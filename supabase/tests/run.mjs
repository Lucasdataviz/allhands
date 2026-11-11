// Testes das regras de negócio contra um Postgres local (dados fictícios).
import pg from 'pg';
const pool = new pg.Pool({ host: '/tmp/pgs', user: 'postgres', database: 'ah', max: 80 });
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ok  ' : ' FALHA ') + m); };
const su = (q, p) => pool.query(q, p);
async function as(uid, q, p) { // executa como um usuário logado, com RLS
  const c = await pool.connect();
  try { await c.query('begin'); await c.query(`set local role authenticated`); await c.query(`select set_config('request.jwt.claim.sub',$1,true)`, [uid]);
    const r = await c.query(q, p); await c.query('commit'); return r;
  } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
}
const err = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };

await su(`grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated; grant execute on all functions in schema public to authenticated;
  revoke execute on function _move_points, _finish_attempt, _close_auction, _release_leader, _audit, _fail, _quiz_open from authenticated`);
const N = 40;
const mk = async (name, role) => { const { rows: [u] } = await su(`insert into auth.users default values returning id`);
  await su(`insert into profiles (id, username, full_name, role, is_demo) values ($1,$2,$2,$3,true)`, [u.id, name, role]); return u.id; };
const admin = await mk('admin.demo', 'admin');
const users = []; for (let i = 0; i < N; i++) users.push(await mk('colab' + i, 'colaborador'));
const { rows: [ev] } = await su(`insert into events (name, status, is_demo) values ('DEMO', 'ativo', true) returning id`);
for (const u of users) await su(`insert into event_participants values ($1,$2)`, [ev.id, u]);

console.log('\nQuiz');
const { rows: [qz] } = await as(admin, `insert into quizzes (event_id,title,status,seconds_per_question) values ($1,'Quiz demo','publicado',5) returning id`, [ev.id]);
const qs = [];
for (let i = 0; i < 3; i++) { const { rows: [q] } = await as(admin, `insert into questions (quiz_id,position,body,points) values ($1,$2::int,'P'||$2::text,10) returning id`, [qz.id, i]);
  const opts = []; for (let j = 0; j < 3; j++) { const { rows: [o] } = await as(admin, `insert into options (question_id,position,body) values ($1,$2::int,'A'||$2::text) returning id`, [q.id, j]);
    await as(admin, `insert into option_keys values ($1,$2)`, [o.id, j === 0]); opts.push(o.id); } qs.push({ id: q.id, opts }); }
ok((await as(users[0], `select * from questions`)).rowCount === 0, 'colaborador não lê perguntas direto da tabela');
ok((await as(users[0], `select * from option_keys`)).rowCount === 0, 'colaborador não lê o gabarito');
let st = (await as(users[0], `select quiz_state($1) s`, [qz.id])).rows[0].s;
ok(!st.finished && st.total === 3 && !JSON.stringify(st).includes('is_correct'), 'primeira pergunta vem sem gabarito');
for (let i = 0; i < 2; i++) { const q = qs.find(x => x.id === st.question.id);
  st = (await as(users[0], `select quiz_answer($1,$2,$3) s`, [qz.id, q.id, q.opts[0]])).rows[0].s; }
const q3 = qs.find(x => x.id === st.question.id);
st = (await as(users[0], `select quiz_answer($1,$2,$3) s`, [qz.id, q3.id, q3.opts[1]])).rows[0].s;
ok(st.finished && st.correct === 2 && st.wrong === 1 && st.points === 20, '2 acertos e 1 erro = 20 pontos');
st = (await as(users[0], `select quiz_state($1) s`, [qz.id])).rows[0].s;
const bal0 = (await su(`select balance from wallets where user_id=$1`, [users[0]])).rows[0].balance;
ok(st.finished && bal0 === 20, 'refazer o quiz não gera pontos de novo');
st = (await as(users[1], `select quiz_state($1) s`, [qz.id])).rows[0].s;
await new Promise(r => setTimeout(r, 7500));
st = (await as(users[1], `select quiz_answer($1,$2,$3) s`, [qz.id, st.question.id, qs.find(x => x.id === st.question.id).opts[0]])).rows[0].s;
ok(!st.finished && st.index === 1, 'resposta fora do tempo conta como erro e avança');
ok((await as(users[1], `select * from wallets`)).rowCount === 1, 'colaborador só enxerga a própria carteira');

console.log('\nPontos');
ok(/administradores/.test(await err(() => as(users[0], `select admin_adjust_points($1,$2,500,'x')`, [ev.id, users[0]]))), 'colaborador não ajusta pontos');
ok(/motivo/i.test(await err(() => as(admin, `select admin_adjust_points($1,$2,500,'')`, [ev.id, users[0]]))), 'ajuste exige motivo');
for (const u of users) await as(admin, `select admin_adjust_points($1,$2,$3,'Carga de teste')`, [ev.id, u, 1000]);
ok(/insuficiente/.test(await err(() => as(admin, `select admin_adjust_points($1,$2,-5000,'x')`, [ev.id, users[2]]))), 'saldo nunca fica negativo');
ok(await err(() => as(users[0], `update wallets set balance = 99999`)) !== null || (await su(`select balance from wallets where user_id=$1`, [users[0]])).rows[0].balance === 1020, 'colaborador não altera a carteira direto');
const { rows: [tk] } = await as(admin, `insert into tasks (event_id,title,points) values ($1,'Tarefa demo',50) returning id`, [ev.id]);
await as(admin, `select admin_set_task($1,$2,true)`, [tk.id, users[3]]); await as(admin, `select admin_set_task($1,$2,true)`, [tk.id, users[3]]);
ok((await su(`select balance from wallets where user_id=$1`, [users[3]])).rows[0].balance === 1050, 'tarefa marcada duas vezes credita uma só');

console.log('\nLeilão manual com lances simultâneos');
const mkAuction = async (mode, dur, donor) => { const { rows: [p] } = await as(admin, `insert into prizes (event_id,name,start_price,min_increment,donor_id) values ($1,'Prêmio demo',10,5,$2) returning id`, [ev.id, donor ?? null]);
  const { rows: [a] } = await as(admin, `insert into auctions (event_id,prize_id,start_price,min_increment,mode,duration_seconds) values ($1,$2,10,5,$3,$4) returning id`, [ev.id, p.id, mode, dur]); return { a: a.id, p: p.id }; };
const bid = async (u, a, amt) => (await as(u, `select place_bid($1,$2) r`, [a, amt])).rows[0].r;
const inv = async (a) => { const { rows: [x] } = await su(`select current_bid, current_bidder from auctions where id=$1`, [a]);
  const { rows: [s] } = await su(`select coalesce(sum(reserved),0)::int r, count(*) filter (where reserved>0)::int n, min(balance-reserved) m from wallets`);
  return { x, s }; };
let A = await mkAuction('manual', null, users[5]);
ok((await bid(users[0], A.a, 10)).code === 'encerrado', 'lance antes de iniciar é recusado');
await as(admin, `select admin_auction_action($1,'iniciar')`, [A.a]);
ok((await bid(users[5], A.a, 10)).code === 'doador', 'doador não dá lance no próprio prêmio');
ok((await bid(users[0], A.a, 5)).code === 'lance_baixo', 'lance abaixo do inicial é recusado');
let r = await Promise.all(users.filter((_, i) => i !== 5).map(u => bid(u, A.a, 10)));
ok(r.filter(x => x.ok).length === 1, `${N - 1} lances idênticos ao mesmo tempo: só 1 assume a liderança`);
let okCount = 1;
for (let round = 0; round < 15; round++) {
  const cur = (await su(`select current_bid from auctions where id=$1`, [A.a])).rows[0].current_bid;
  r = await Promise.all(users.filter((_, i) => i !== 5).map(u => bid(u, A.a, cur + 5 + 5 * Math.floor(Math.random() * 4))));
  okCount += r.filter(x => x.ok).length;
}
let i1 = await inv(A.a);
const nb = (await su(`select count(*)::int n, max(amount) m from bids where auction_id=$1`, [A.a])).rows[0];
ok(nb.n === okCount && nb.m === i1.x.current_bid, `${okCount} lances aceitos em ~600 tentativas; maior lance registrado = lance atual`);
ok(i1.s.n === 1 && i1.s.r === i1.x.current_bid && i1.s.m >= 0, 'só o líder tem pontos reservados; ninguém negativo');
{ const up = i1.x.current_bid + 50; const r2 = await bid(i1.x.current_bidder, A.a, up); const w2 = (await su(`select reserved from wallets where user_id=$1`, [i1.x.current_bidder])).rows[0];
  ok(r2.ok && w2.reserved === up, 'líder aumenta o próprio lance e a reserva passa a ser só o novo valor'); okCount++; i1 = await inv(A.a);
  ok((await bid(i1.x.current_bidder, A.a, 999999)).code === 'saldo_insuficiente', 'líder não aumenta além do que tem'); }
const poor = users[6]; await as(admin, `select admin_adjust_points($1,$2,-990,'teste')`, [ev.id, poor]).catch(() => {});
const avail = (await su(`select balance-reserved a from wallets where user_id=$1`, [poor])).rows[0].a;
if (avail < i1.x.current_bid + 5) ok((await bid(poor, A.a, i1.x.current_bid + 5)).code === 'saldo_insuficiente', 'sem pontos suficientes: lance recusado');
ok(/administradores/.test(await err(() => as(users[0], `select admin_auction_action($1,'encerrar')`, [A.a]))), 'colaborador não encerra leilão');
await as(admin, `select admin_auction_action($1,'pausar')`, [A.a]);
ok((await bid(users[7], A.a, 5000)).code === 'pausado', 'pausado: lance recusado');
await as(admin, `select admin_auction_action($1,'retomar')`, [A.a]);
const before = (await su(`select balance from wallets where user_id=$1`, [i1.x.current_bidder])).rows[0].balance;
await Promise.all([as(admin, `select admin_auction_action($1,'encerrar')`, [A.a]), ...users.slice(8, 30).map(u => bid(u, A.a, i1.x.current_bid + 5))]);
const fin = (await su(`select * from auctions where id=$1`, [A.a])).rows[0];
const wl = (await su(`select * from wallets where user_id=$1`, [fin.winner_id])).rows[0];
const allRes = (await su(`select coalesce(sum(reserved),0)::int r from wallets`)).rows[0].r;
ok(fin.status === 'encerrado' && fin.result === 'arrematado' && fin.final_price === fin.current_bid, 'encerramento manual durante rajada de lances define um vencedor');
ok(allRes === 0 && wl.spent === fin.final_price, 'vencedor debitado pelo lance final; todas as reservas liberadas');
ok((await su(`select count(*)::int n from wallet_ledger where kind='premio' and ref_id=$1`, [A.a])).rows[0].n === 1, 'um único débito de prêmio (sem dois vencedores)');
ok((await bid(users[9], A.a, 9999)).code === 'encerrado', 'lance após encerramento é recusado');
ok((await su(`select screen from display_state`)).rows[0].screen === 'resultado', 'telão vai para a tela de resultado');
await as(admin, `select admin_auction_action($1,'estornar','teste de estorno')`, [A.a]);
ok((await su(`select balance from wallets where user_id=$1`, [fin.winner_id])).rows[0].balance === wl.balance + fin.final_price, 'estorno devolve os pontos ao vencedor');

console.log('\nLeilão por tempo');
A = await mkAuction('tempo', 10);
await as(admin, `select admin_auction_action($1,'iniciar')`, [A.a]);
ok(/andamento/.test(await err(async () => { const B = await mkAuction('manual', null); await as(admin, `select admin_auction_action($1,'iniciar')`, [B.a]); })), 'não abre dois leilões ao mesmo tempo');
await bid(users[10], A.a, 10);
await new Promise(r => setTimeout(r, 4000));
const e1 = (await su(`select ends_at from auctions where id=$1`, [A.a])).rows[0].ends_at;
await bid(users[11], A.a, 15);
const e2 = (await su(`select ends_at from auctions where id=$1`, [A.a])).rows[0].ends_at;
ok(e2 > e1, 'lance nos 10 s finais prorroga o cronômetro');
await new Promise(r => setTimeout(r, 10500));
ok((await bid(users[12], A.a, 500)).code === 'encerrado', 'lance após o tempo é recusado mesmo sem ninguém ter fechado');
await as(users[0], `select close_expired_auctions()`);
const t = (await su(`select * from auctions where id=$1`, [A.a])).rows[0];
ok(t.status === 'encerrado' && t.winner_id === users[11] && t.final_price === 15, 'tempo zerado: servidor encerra e define o vencedor');
ok((await su(`select reserved from wallets where user_id=$1`, [users[10]])).rows[0].reserved === 0, 'superado teve os pontos devolvidos');

console.log('\nSem lances, cancelar, reiniciar');
A = await mkAuction('manual', null);
await as(admin, `select admin_auction_action($1,'iniciar')`, [A.a]); await as(admin, `select admin_auction_action($1,'encerrar')`, [A.a]);
ok((await su(`select status from prizes where id=$1`, [A.p])).rows[0].status === 'nao_arrematado', 'sem lances: prêmio não arrematado');
await as(admin, `select admin_auction_action($1,'reiniciar')`, [A.a]); await as(admin, `select admin_auction_action($1,'iniciar')`, [A.a]);
await bid(users[13], A.a, 10); await as(admin, `select admin_auction_action($1,'cancelar')`, [A.a]);
ok((await su(`select reserved from wallets where user_id=$1`, [users[13]])).rows[0].reserved === 0, 'cancelar devolve a reserva');
const neg = (await su(`select count(*)::int n from wallets where balance<0 or reserved<0 or reserved>balance`)).rows[0].n;
const drift = (await su(`select count(*)::int n from wallets w where balance <> (select coalesce(sum(amount),0) from wallet_ledger l where l.user_id=w.user_id and l.event_id=w.event_id)`)).rows[0].n;
ok(neg === 0 && drift === 0, 'no fim, todo saldo bate com a soma do extrato');
ok((await su(`select count(*)::int n from audit_log`)).rows[0].n > 10, 'ações administrativas registradas na auditoria');
console.log(`\n${pass} ok, ${fail} falhas`); await pool.end(); process.exit(fail ? 1 : 0);
