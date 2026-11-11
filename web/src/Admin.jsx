import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { dOnly, dt, fn, go, pts, q, rpc, sb, STATUS, useLive } from './lib'
import { Act, Avatar, Coin, Confirm, Demo, Empty, FormModal, Loading, Modal, useToast } from './ui'
import { logout, Wordmark } from './App.jsx'
import { Auctions, Prizes, QuizzesAdmin, Reports } from './AdminGame.jsx'

const NAV = [['painel', 'Painel'], ['leiloes', 'Leilões'], ['telao', 'Telão'], ['quizzes', 'Quizzes'], ['tarefas', 'Tarefas'], ['premios', 'Prêmios'], ['pessoas', 'Colaboradores'], ['pontos', 'Pontos'], ['relatorios', 'Relatórios'], ['eventos', 'Eventos'], ['auditoria', 'Auditoria']]

export function useAdminData(eid) {
  const on = { enabled: !!eid }
  const [profiles, reloadProfiles] = useLive('profiles', (t) => t.select('*').order('full_name'), [])
  const [participants] = useLive('event_participants', (t) => t.select('*').eq('event_id', eid), [eid], on)
  const [wallets] = useLive('wallets', (t) => t.select('*').eq('event_id', eid), [eid], on)
  const [scores] = useLive('scores', (t) => t.select('*').eq('event_id', eid), [eid], on)
  const [quizzes] = useLive('quizzes', (t) => t.select('*').eq('event_id', eid).order('created_at'), [eid], on)
  const [attempts] = useLive('quiz_attempts', (t) => t.select('*, quizzes!inner(event_id)').eq('quizzes.event_id', eid), [eid], on)
  const [tasks] = useLive('tasks', (t) => t.select('*').eq('event_id', eid).order('created_at'), [eid], on)
  const [completions] = useLive('task_completions', (t) => t.select('*, tasks!inner(event_id)').eq('tasks.event_id', eid), [eid], on)
  const [prizes] = useLive('prizes', (t) => t.select('*').eq('event_id', eid).order('position').order('created_at'), [eid], on)
  const [auctions] = useLive('auctions', (t) => t.select('*').eq('event_id', eid).order('position').order('created_at'), [eid], on)
  const [display] = useLive('display_state', (t) => t.select('*').eq('event_id', eid), [eid], on)
  const pmap = useMemo(() => new Map((profiles ?? []).map((p) => [p.id, p])), [profiles])
  const prizeMap = useMemo(() => new Map((prizes ?? []).map((p) => [p.id, p])), [prizes])
  const wmap = useMemo(() => new Map((wallets ?? []).map((w) => [w.user_id, w])), [wallets])
  const smap = useMemo(() => new Map((scores ?? []).map((s) => [s.user_id, s])), [scores])
  const inEvent = useMemo(() => new Set((participants ?? []).map((p) => p.user_id)), [participants])
  const ready = !!profiles && (!eid || !!(participants && wallets && scores && quizzes && attempts && tasks && completions && prizes && auctions && display))
  const live = auctions?.find((a) => a.status === 'aberto' || a.status === 'pausado') ?? null
  return { ready, profiles: profiles ?? [], reloadProfiles, pmap, prizeMap, wmap, smap, inEvent, quizzes: quizzes ?? [], attempts: attempts ?? [], tasks: tasks ?? [], completions: completions ?? [], prizes: prizes ?? [], auctions: auctions ?? [], display: display?.[0], live }
}

export default function Admin({ me, activeEvent }) {
  const [tab, setTab] = useState('painel')
  const [events] = useLive('events', (t) => t.select('*').order('created_at', { ascending: false }), [])
  const [picked, setPicked] = useState(null)
  const ev = events?.find((e) => e.id === picked) ?? events?.find((e) => e.id === activeEvent?.id) ?? events?.[0] ?? null
  const d = useAdminData(ev?.id)
  if (!events || !d.ready) return <Loading />
  const ctx = { me, ev, d, events, setTab }
  const needEvent = !ev && tab !== 'eventos'
  return (
    <div className="admin">
      <aside className="side">
        <div className="hide-sm" style={{ padding: '4px 10px 16px' }}><Wordmark logo={ev?.logo_url} /><p className="eyebrow" style={{ marginTop: 8 }}>Painel administrativo</p></div>
        {NAV.map(([k, label]) => <button key={k} className={`nav ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}{k === 'leiloes' && d.live && <span className="chip live">ao vivo</span>}</button>)}
        <div className="grow hide-sm" />
        <div className="hide-sm stack tight" style={{ padding: 10 }}><span className="small"><b>{me.full_name}</b></span><button className="btn sm" onClick={logout}>Sair</button></div>
      </aside>
      <main className="main">
        <div className="row between wrap noprint" style={{ marginBottom: 18 }}>
          <label className="row small"><span className="muted">Evento</span>
            <select className="input" style={{ minHeight: 38, width: 'auto' }} value={ev?.id ?? ''} onChange={(e) => setPicked(e.target.value)}>
              {events.length === 0 && <option value="">Nenhum evento</option>}
              {events.map((e) => <option key={e.id} value={e.id}>{e.name} ({STATUS[e.status]}){e.is_demo ? ' · DEMO' : ''}</option>)}
            </select></label>
          {ev && ev.status !== 'ativo' && <span className="chip bad">Este evento não está ativo: os colaboradores não o veem.</span>}
          {ev?.is_demo && <span className="chip demo">Evento de demonstração: dados fictícios</span>}
        </div>
        {needEvent ? <Empty>Crie o primeiro evento para começar. <button className="btn primary sm" onClick={() => setTab('eventos')}>Ir para Eventos</button></Empty>
          : tab === 'painel' ? <Dashboard {...ctx} />
          : tab === 'leiloes' ? <Auctions {...ctx} />
          : tab === 'telao' ? <TelaoControl {...ctx} />
          : tab === 'quizzes' ? <QuizzesAdmin {...ctx} />
          : tab === 'tarefas' ? <Tasks {...ctx} />
          : tab === 'premios' ? <Prizes {...ctx} />
          : tab === 'pessoas' ? <People {...ctx} />
          : tab === 'pontos' ? <Points {...ctx} />
          : tab === 'relatorios' ? <Reports {...ctx} />
          : tab === 'eventos' ? <Events {...ctx} />
          : <Audit {...ctx} />}
      </main>
    </div>
  )
}

export const Head = ({ title, sub, children }) => <header><div className="stack tight"><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div><div className="row wrap noprint">{children}</div></header>

function Dashboard({ ev, d, setTab }) {
  const [ledger] = useLive('wallet_ledger', (t) => t.select('amount,kind').eq('event_id', ev.id), [ev.id])
  const colabs = d.profiles.filter((p) => p.role === 'colaborador')
  const inEv = colabs.filter((p) => d.inEvent.has(p.id))
  const active = inEv.filter((p) => (d.smap.get(p.id)?.earned ?? 0) > 0 || (d.smap.get(p.id)?.quizzes_done ?? 0) > 0)
  const given = (ledger ?? []).filter((l) => l.amount > 0 && l.kind !== 'estorno').reduce((s, l) => s + l.amount, 0)
  const spent = [...d.wmap.values()].reduce((s, w) => s + w.spent, 0)
  const k = [
    ['Colaboradores cadastrados', colabs.length], ['No evento', inEv.length], ['Já participaram', active.length],
    ['Quizzes criados', d.quizzes.length], ['Quizzes respondidos', d.attempts.filter((a) => a.finished_at).length],
    ['Pontos distribuídos', pts(given)], ['Pontos usados em prêmios', pts(spent)],
    ['Prêmios cadastrados', d.prizes.length], ['Prêmios arrematados', d.auctions.filter((a) => a.result === 'arrematado').length],
    ['Leilões realizados', d.auctions.filter((a) => a.status === 'encerrado').length], ['Leilões em andamento', d.live ? 1 : 0], ['Leilões na fila', d.auctions.filter((a) => a.status === 'agendado').length],
  ]
  const todo = []
  if (inEv.length === 0) todo.push(['Nenhum colaborador no evento ainda.', 'pessoas', 'Cadastrar'])
  if (d.quizzes.filter((x) => x.status === 'publicado').length === 0) todo.push(['Nenhum quiz publicado.', 'quizzes', 'Criar quiz'])
  if (d.prizes.length === 0) todo.push(['Nenhum prêmio cadastrado.', 'premios', 'Cadastrar prêmio'])
  if (ev.status !== 'ativo') todo.push(['O evento ainda não está ativo.', 'eventos', 'Ativar'])
  return (
    <div className="stack loose">
      <Head title={ev.name} sub={`${ev.event_date ? dOnly(ev.event_date) + ' · ' : ''}${STATUS[ev.status]}`}><button className="btn" onClick={() => window.open('#/telao', '_blank')}>Abrir telão</button></Head>
      {d.live && <button className="livebar" onClick={() => setTab('leiloes')}><div className="grow"><div className="eyebrow" style={{ color: '#fff' }}>Leilão em andamento</div><b style={{ fontSize: '1.15rem' }}>{d.prizeMap.get(d.live.prize_id)?.name}</b></div><b>Abrir controle</b></button>}
      {todo.length > 0 && <div className="panel stack tight"><h3>Falta para o evento rodar</h3>{todo.map(([t, to, label]) => <div key={t} className="row between"><span>{t}</span><button className="btn sm" onClick={() => setTab(to)}>{label}</button></div>)}</div>}
      <div className="kpis">{k.map(([label, v]) => <div key={label}><span className="num">{v}</span><span className="muted small">{label}</span></div>)}</div>
    </div>
  )
}

/* ───────── Colaboradores ───────── */
function People({ me, ev, d }) {
  const toast = useToast()
  const [edit, setEdit] = useState(null); const [imp, setImp] = useState(false); const [reset, setReset] = useState(null); const [search, setSearch] = useState(''); const [created, setCreated] = useState(null)
  const list = d.profiles.filter((p) => (p.full_name + p.username + (p.sector ?? '') + (p.branch ?? '')).toLowerCase().includes(search.toLowerCase()))
  const roleOpts = [{ value: 'colaborador', label: 'Colaborador' }, { value: 'admin', label: 'Administrador' }, { value: 'telao', label: 'Telão (só exibição)' }]
  const fields = (isNew) => [
    { name: 'full_name', label: 'Nome completo', required: true },
    ...(isNew ? [{ name: 'username', label: 'Usuário', hint: 'Em branco, vira nome.sobrenome automaticamente.' }] : []),
    { name: 'sector', label: 'Setor ou equipe' }, { name: 'branch', label: 'Filial' },
    { name: 'role', label: 'Perfil', type: 'select', options: roleOpts, default: 'colaborador' },
    ...(isNew ? [] : [{ name: 'photo_url', label: 'Foto de perfil', type: 'image', folder: 'perfis/admin' }, { name: 'active', label: 'Conta ativa', type: 'checkbox' }]),
  ]
  const save = async (v) => {
    if (edit.id) {
      if (edit.id === me.id && (v.role !== 'admin' || !v.active)) throw new Error('Você não pode remover o seu próprio acesso de administrador.')
      await q(sb.from('profiles').update(v).eq('id', edit.id)); toast('Cadastro atualizado.', 'ok')
    } else { const r = await fn({ action: 'create', event_id: ev?.id, users: [v] }); if (r.errors.length) throw new Error(r.errors[0].error); setCreated(r); d.reloadProfiles() }
  }
  const addAll = async () => {
    const rows = d.profiles.filter((p) => p.role === 'colaborador' && p.active && !d.inEvent.has(p.id)).map((p) => ({ event_id: ev.id, user_id: p.id }))
    if (!rows.length) return toast('Todos os colaboradores ativos já estão no evento.')
    await q(sb.from('event_participants').insert(rows)); toast(`${rows.length} incluídos no evento.`, 'ok')
  }
  return (
    <div className="stack">
      <Head title="Colaboradores" sub={`${d.profiles.length} contas · senha inicial Mudar@123, trocada no primeiro acesso`}>
        <input className="input" style={{ width: 220, minHeight: 40 }} placeholder="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} />
        {ev && <Act className="btn" onClick={addAll}>Incluir todos no evento</Act>}
        <button className="btn" onClick={() => setImp(true)}>Importar planilha</button>
        <button className="btn primary" onClick={() => setEdit({})}>Novo</button>
      </Head>
      <div className="tablewrap"><table className="grid"><thead><tr><th>Nome</th><th>Usuário</th><th>Setor</th><th>Filial</th><th>Perfil</th><th>Situação</th>{ev && <th>No evento</th>}<th /></tr></thead><tbody>
        {list.map((p) => (
          <tr key={p.id}><td><span className="row"><Avatar p={p} size={32} /><b>{p.full_name}</b><Demo on={p.is_demo} /></span></td><td>{p.username}</td><td>{p.sector ?? '—'}</td><td>{p.branch ?? '—'}</td>
            <td>{roleOpts.find((r) => r.value === p.role)?.label}</td>
            <td>{p.active ? p.must_change_password ? <span className="chip">Nunca entrou</span> : <span className="chip ok">Ativa</span> : <span className="chip bad">Desativada</span>}</td>
            {ev && <td>{p.role !== 'colaborador' ? '—' : d.inEvent.has(p.id) ? <span className="chip ok">Sim</span> : <Act className="btn sm" onClick={() => q(sb.from('event_participants').insert({ event_id: ev.id, user_id: p.id }))}>Incluir</Act>}</td>}
            <td className="r"><span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
              <button className="btn sm" onClick={() => setEdit(p)}>Editar</button>
              <Act className="btn sm" onClick={() => q(sb.from('profiles').update({ active: !p.active }).eq('id', p.id))} disabled={p.id === me.id}>{p.active ? 'Desativar' : 'Ativar'}</Act>
              <button className="btn sm" onClick={() => setReset(p)}>Redefinir senha</button></span></td></tr>))}
      </tbody></table>{list.length === 0 && <Empty>Ninguém encontrado.</Empty>}</div>
      {edit && <FormModal title={edit.id ? 'Editar colaborador' : 'Novo colaborador'} fields={fields(!edit.id)} initial={edit} onSave={save} onClose={() => setEdit(null)} />}
      {reset && <Confirm title="Redefinir senha" confirmLabel="Redefinir" onClose={() => setReset(null)} onConfirm={async () => { await fn({ action: 'reset_password', user_id: reset.id }); toast('Senha voltou para Mudar@123.', 'ok') }}><p>A senha de <b>{reset.full_name}</b> volta para <b>Mudar@123</b> e será trocada no próximo acesso.</p></Confirm>}
      {imp && <ImportPeople ev={ev} onClose={() => setImp(false)} onDone={(r) => { setCreated(r); d.reloadProfiles() }} />}
      {created && <Modal title="Contas criadas" onClose={() => setCreated(null)}>
        <p>{created.created.length} criadas. Senha inicial de todos: <b>{created.default_password}</b></p>
        <div className="tablewrap" style={{ maxHeight: 300, overflow: 'auto' }}><table className="grid"><tbody>{created.created.map((u) => <tr key={u.id}><td>{u.full_name}</td><td><b>{u.username}</b></td></tr>)}</tbody></table></div>
        {created.errors.length > 0 && <div className="err">{created.errors.length} com erro: {created.errors.map((e) => `${e.full_name} (${e.error})`).join('; ')}</div>}
        <button className="btn" onClick={() => exportXlsx('usuarios-criados', created.created.map((u) => ({ Nome: u.full_name, Usuário: u.username, 'Senha inicial': created.default_password })))}>Baixar lista em Excel</button>
      </Modal>}
    </div>
  )
}

export function exportXlsx(name, rows) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Sem dados': '' }]), 'Dados')
  XLSX.writeFile(wb, `${name}.xlsx`)
}

function ImportPeople({ ev, onClose, onDone }) {
  const [rows, setRows] = useState(null); const [err, setErr] = useState('')
  const read = async (e) => {
    setErr('')
    try {
      const wb = XLSX.read(await e.target.files[0].arrayBuffer())
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
      const pick = (r, ...names) => { for (const k of Object.keys(r)) if (names.includes(norm(k))) return String(r[k]).trim(); return '' }
      const out = raw.map((r) => ({ full_name: pick(r, 'nome', 'nome completo', 'colaborador'), sector: pick(r, 'setor', 'equipe', 'setor ou equipe'), branch: pick(r, 'filial', 'cidade', 'unidade'), username: pick(r, 'usuario', 'login') })).filter((r) => r.full_name)
      if (!out.length) throw new Error('Não achei a coluna "Nome" na planilha.')
      setRows(out)
    } catch (e2) { setErr(e2.message) }
  }
  return (
    <Modal title="Importar colaboradores" onClose={onClose} wide>
      <p className="muted">Planilha Excel ou CSV com as colunas <b>Nome</b>, <b>Setor</b> e <b>Filial</b>. O usuário é gerado como nome.sobrenome.</p>
      <div className="row wrap"><label className="btn primary">Escolher planilha<input type="file" accept=".xlsx,.xls,.csv" hidden onChange={read} /></label>
        <button className="btn" onClick={() => exportXlsx('modelo-colaboradores', [{ Nome: 'Maria Souza', Setor: 'SAC', Filial: 'Matriz' }])}>Baixar modelo</button></div>
      {err && <p className="err">{err}</p>}
      {rows && <>
        <div className="tablewrap" style={{ maxHeight: 280, overflow: 'auto' }}><table className="grid"><thead><tr><th>Nome</th><th>Setor</th><th>Filial</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}><td>{r.full_name}</td><td>{r.sector}</td><td>{r.branch}</td></tr>)}</tbody></table></div>
        <Act className="btn primary" onClick={async () => { const r = await fn({ action: 'create', event_id: ev?.id, users: rows }); onDone(r); onClose() }}>Criar {rows.length} contas{ev ? ` e incluir em “${ev.name}”` : ''}</Act>
      </>}
    </Modal>
  )
}

/* ───────── Pontos ───────── */
const KIND = { quiz: 'Quiz', tarefa: 'Tarefa', ajuste: 'Ajuste manual', premio: 'Prêmio', estorno: 'Estorno' }
function Points({ ev, d }) {
  const [adj, setAdj] = useState(null); const [stmt, setStmt] = useState(null)
  const [ledger] = useLive('wallet_ledger', (t) => t.select('*').eq('event_id', ev.id).order('id', { ascending: false }).limit(300), [ev.id], { also: ['wallets'] })
  const people = d.profiles.filter((p) => d.inEvent.has(p.id)).sort((a, b) => (d.smap.get(b.id)?.earned ?? 0) - (d.smap.get(a.id)?.earned ?? 0))
  return (
    <div className="stack loose">
      <Head title="Pontos" sub="Saldos, ajustes manuais com motivo e extrato de cada carteira." />
      <div className="tablewrap"><table className="grid"><thead><tr><th>Colaborador</th><th className="r">Disponível</th><th className="r">Reservado</th><th className="r">Conquistado</th><th className="r">Usado</th><th /></tr></thead><tbody>
        {people.map((p) => { const w = d.wmap.get(p.id) ?? { balance: 0, reserved: 0, spent: 0 }; return (
          <tr key={p.id}><td><span className="row"><Avatar p={p} size={30} /><b>{p.full_name}</b><Demo on={p.is_demo} /></span></td>
            <td className="r"><Coin n={w.balance - w.reserved} /></td><td className="r">{pts(w.reserved)}</td><td className="r">{pts(d.smap.get(p.id)?.earned)}</td><td className="r">{pts(w.spent)}</td>
            <td className="r"><span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}><button className="btn sm" onClick={() => setStmt(p)}>Extrato</button><button className="btn sm primary" onClick={() => setAdj(p)}>Ajustar</button></span></td></tr>) })}
      </tbody></table>{people.length === 0 && <Empty>Inclua colaboradores no evento para ver as carteiras.</Empty>}</div>
      <section className="stack"><h2>Últimas movimentações</h2><LedgerTable rows={ledger ?? []} d={d} showUser /></section>
      {adj && <FormModal title={`Ajustar pontos de ${adj.full_name}`} saveLabel="Aplicar ajuste" onClose={() => setAdj(null)}
        fields={[{ name: 'op', label: 'Operação', type: 'select', options: [{ value: 'add', label: 'Adicionar pontos' }, { value: 'sub', label: 'Retirar pontos' }], default: 'add' }, { name: 'amount', label: 'Quantidade de pontos', type: 'number', min: 1, required: true }, { name: 'reason', label: 'Motivo', required: true, hint: 'Aparece no extrato do colaborador.' }]}
        onSave={(v) => rpc('admin_adjust_points', { p_event: ev.id, p_user: adj.id, p_amount: v.op === 'sub' ? -v.amount : v.amount, p_reason: v.reason })} />}
      {stmt && <Modal title={`Extrato de ${stmt.full_name}`} onClose={() => setStmt(null)} wide><Statement ev={ev} user={stmt} d={d} /></Modal>}
    </div>
  )
}
function Statement({ ev, user, d }) {
  const [rows] = useLive('wallet_ledger', (t) => t.select('*').eq('event_id', ev.id).eq('user_id', user.id).order('id', { ascending: false }), [ev.id, user.id])
  return rows ? <LedgerTable rows={rows} d={d} /> : <Loading />
}
export function LedgerTable({ rows, d, showUser }) {
  if (!rows.length) return <Empty>Nenhuma movimentação.</Empty>
  return <div className="tablewrap"><table className="grid"><thead><tr><th>Quando</th>{showUser && <th>Colaborador</th>}<th>Tipo</th><th>Descrição</th><th>Feito por</th><th className="r">Pontos</th></tr></thead><tbody>
    {rows.map((l) => <tr key={l.id}><td>{dt(l.created_at)}</td>{showUser && <td>{d.pmap.get(l.user_id)?.full_name}</td>}<td>{KIND[l.kind]}</td><td>{l.reason}</td><td>{d.pmap.get(l.created_by)?.full_name ?? 'Sistema'}</td>
      <td className="r"><b style={{ color: l.amount >= 0 ? 'var(--ok)' : 'var(--bad)' }}>{l.amount >= 0 ? '+' : '−'}{pts(Math.abs(l.amount))}</b></td></tr>)}</tbody></table></div>
}

/* ───────── Tarefas ───────── */
function Tasks({ ev, d }) {
  const [edit, setEdit] = useState(null); const [mark, setMark] = useState(null); const [del, setDel] = useState(null)
  const count = (id) => d.completions.filter((c) => c.task_id === id).length
  return (
    <div className="stack">
      <Head title="Tarefas" sub="Atividades fora do sistema que valem pontos. Você confere e marca quem cumpriu."><button className="btn primary" onClick={() => setEdit({})}>Nova tarefa</button></Head>
      {d.tasks.length === 0 ? <Empty>Nenhuma tarefa. Exemplo: “Postar uma foto com a camiseta do evento”.</Empty> : <div className="tablewrap"><table className="grid"><thead><tr><th>Tarefa</th><th className="r">Pontos</th><th className="r">Cumpriram</th><th /></tr></thead><tbody>
        {d.tasks.map((t) => <tr key={t.id}><td><b>{t.title}</b><div className="muted small">{t.description}</div></td><td className="r"><Coin n={t.points} /></td><td className="r">{count(t.id)}</td>
          <td className="r"><span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}><button className="btn sm primary" onClick={() => setMark(t)}>Marcar quem cumpriu</button><button className="btn sm" onClick={() => setEdit(t)}>Editar</button><button className="btn sm" onClick={() => setDel(t)} disabled={count(t.id) > 0} title={count(t.id) > 0 ? 'Desmarque todos antes de excluir' : ''}>Excluir</button></span></td></tr>)}
      </tbody></table></div>}
      {edit && <FormModal title={edit.id ? 'Editar tarefa' : 'Nova tarefa'} initial={edit} onClose={() => setEdit(null)}
        fields={[{ name: 'title', label: 'Título', required: true }, { name: 'description', label: 'Descrição', type: 'textarea' }, { name: 'points', label: 'Pontos', type: 'number', min: 1, required: true, hint: edit.id && count(edit.id) > 0 ? 'Mudar o valor não altera pontos já creditados.' : undefined }]}
        onSave={(v) => q(edit.id ? sb.from('tasks').update(v).eq('id', edit.id) : sb.from('tasks').insert({ ...v, event_id: ev.id }))} />}
      {del && <Confirm title="Excluir tarefa" danger confirmLabel="Excluir" onClose={() => setDel(null)} onConfirm={() => q(sb.from('tasks').delete().eq('id', del.id))}><p>Excluir “{del.title}”?</p></Confirm>}
      {mark && <Modal title={mark.title} onClose={() => setMark(null)}>
        <p className="muted">Marcar credita {pts(mark.points)} pts na hora. Desmarcar retira os pontos.</p>
        <div className="list">{d.profiles.filter((p) => d.inEvent.has(p.id)).map((p) => { const on = d.completions.some((c) => c.task_id === mark.id && c.user_id === p.id); return (
          <div key={p.id} className="row between"><span className="row"><Avatar p={p} size={30} />{p.full_name}</span>
            <Act className={`btn sm ${on ? '' : 'primary'}`} onClick={() => rpc('admin_set_task', { p_task: mark.id, p_user: p.id, p_done: !on })}>{on ? 'Desmarcar' : 'Cumpriu'}</Act></div>) })}</div>
      </Modal>}
    </div>
  )
}

/* ───────── Telão ───────── */
const SCREENS = [['inicio', 'Tela inicial'], ['ranking', 'Ranking'], ['quizzes', 'Quizzes'], ['premios', 'Prêmios disponíveis'], ['leilao', 'Leilão atual'], ['resultado', 'Resultado do leilão'], ['historico', 'Histórico de vencedores'], ['mensagem', 'Mensagem personalizada']]
function TelaoControl({ ev, d }) {
  const toast = useToast()
  const [msg, setMsg] = useState(d.display?.message ?? '')
  const last = [...d.auctions].filter((a) => a.status === 'encerrado').sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at))[0]
  const set = async (screen) => {
    if (screen === 'leilao' && !d.live) return toast('Não há leilão em andamento. Inicie um na aba Leilões.', 'bad')
    if (screen === 'resultado' && !last) return toast('Ainda não há leilão encerrado.', 'bad')
    if (screen === 'mensagem' && !msg.trim()) return toast('Escreva a mensagem antes.', 'bad')
    await q(sb.from('display_state').update({ screen, message: msg.trim() || null, auction_id: screen === 'resultado' ? (d.display?.auction_id ?? last.id) : d.display?.auction_id ?? null, updated_at: new Date().toISOString() }).eq('event_id', ev.id))
  }
  const hasTelao = d.profiles.some((p) => p.role === 'telao')
  return (
    <div className="stack loose">
      <Head title="Telão" sub="Escolha o que aparece na TV. Durante um leilão o telão muda sozinho e mostra o vencedor ao encerrar."><button className="btn primary" onClick={() => window.open('#/telao', '_blank')}>Abrir telão em nova aba</button></Head>
      {d.live && <p className="chip live" style={{ justifySelf: 'start' }}>Leilão ao vivo: o telão está travado na tela do leilão (ou na mensagem).</p>}
      <div className="screens">{SCREENS.map(([k, label]) => <Act key={k} className={d.display?.screen === k ? 'on' : ''} onClick={() => set(k)}>{label}</Act>)}</div>
      <label className="field"><span>Mensagem personalizada</span><textarea className="input" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Ex.: Intervalo de 10 minutos. Voltamos já!" /></label>
      <div className="panel stack tight"><h3>Como ligar na TV</h3>
        <p className="muted">Abra o telão no computador ligado à TV e clique em “Tela cheia” (o botão aparece ao mover o mouse). Se cair a conexão, ele se atualiza sozinho ao voltar.</p>
        <p className="muted">{hasTelao ? 'Já existe uma conta de perfil “Telão” para usar nesse computador sem expor a sua senha de administrador.' : 'Dica: em Colaboradores, crie uma conta com perfil “Telão (só exibição)” para usar nesse computador sem expor a sua senha de administrador.'}</p></div>
    </div>
  )
}

/* ───────── Eventos ───────── */
function Events({ ev, events, d }) {
  const toast = useToast()
  const [edit, setEdit] = useState(null); const [confirm, setConfirm] = useState(null)
  const fields = [{ name: 'name', label: 'Nome do evento', required: true }, { name: 'event_date', label: 'Data', type: 'date' }, { name: 'welcome_message', label: 'Mensagem de boas-vindas (telão)', type: 'textarea' },
    { name: 'logo_url', label: 'Logotipo da empresa', type: 'image', folder: 'logos' }, { name: 'max_prizes_per_person', label: 'Máximo de prêmios por pessoa', type: 'number', min: 1, hint: 'Em branco = sem limite.' }]
  const setStatus = async (e, status) => {
    if (status === 'ativo' && events.some((x) => x.status === 'ativo' && x.id !== e.id)) throw new Error('Já existe um evento ativo. Finalize ou pause o outro antes.')
    await q(sb.from('events').update({ status }).eq('id', e.id))
  }
  const seedDemo = async () => {
    const [e] = await q(sb.from('events').insert({ name: 'DEMO All Hands', is_demo: true, status: 'rascunho', welcome_message: 'Evento fictício para testar a plataforma.' }).select())
    const names = ['Demo Ana', 'Demo Bruno', 'Demo Carla', 'Demo Diego', 'Demo Elisa', 'Demo Fábio', 'Demo Gabi', 'Demo Heitor']
    const r = await fn({ action: 'create', event_id: e.id, users: names.map((n, i) => ({ full_name: n, sector: ['SAC', 'N2', 'Infra', 'Comercial'][i % 4], branch: 'Demo', is_demo: true })) })
    for (const u of r.created) await rpc('admin_adjust_points', { p_event: e.id, p_user: u.id, p_amount: 200 + 50 * Math.floor(Math.random() * 9), p_reason: 'Carga de demonstração' })
    const [qz] = await q(sb.from('quizzes').insert({ event_id: e.id, title: 'Quiz DEMO: conhecimentos gerais', description: 'Perguntas fictícias para teste.', status: 'publicado', seconds_per_question: 20 }).select())
    const qs = [['Quanto é 7 × 8?', ['56', '54', '64'], 0], ['A capital do Ceará é:', ['Fortaleza', 'Recife', 'Natal'], 0], ['Um dia tem 24 horas.', ['Verdadeiro', 'Falso'], 0]]
    for (const [i, [body, opts, right]] of qs.entries()) {
      const [qq] = await q(sb.from('questions').insert({ quiz_id: qz.id, position: i, body, points: 10, kind: opts.length === 2 ? 'vf' : 'multipla' }).select())
      const os = await q(sb.from('options').insert(opts.map((b, j) => ({ question_id: qq.id, position: j, body: b }))).select())
      await q(sb.from('option_keys').insert(os.map((o) => ({ option_id: o.id, is_correct: o.position === right }))))
    }
    const ps = await q(sb.from('prizes').insert([['Hambúrguer artesanal (DEMO)', 'Lanches'], ['Cesta de chocolates (DEMO)', 'Doces'], ['Vale-presente (DEMO)', 'Vales'], ['Açaí 1 litro (DEMO)', 'Lanches']].map(([name, category], i) => ({ event_id: e.id, name, category, description: 'Prêmio fictício de demonstração.', start_price: 20, min_increment: 10, position: i }))).select())
    await q(sb.from('auctions').insert(ps.map((p, i) => ({ event_id: e.id, prize_id: p.id, start_price: 20, min_increment: 10, mode: i % 2 ? 'tempo' : 'manual', duration_seconds: i % 2 ? 60 : null, position: i }))))
    toast('Evento DEMO criado. Ative-o para testar; os usuários demo.* entram com Mudar@123.', 'ok')
  }
  const wipeDemo = async () => {
    await q(sb.from('events').delete().eq('is_demo', true))
    for (const p of d.profiles.filter((x) => x.is_demo)) await fn({ action: 'delete', user_id: p.id }).catch(() => {})
    d.reloadProfiles(); toast('Dados de demonstração apagados.', 'ok')
  }
  return (
    <div className="stack loose">
      <Head title="Eventos" sub="Cada edição tem seus próprios quizzes, carteiras, prêmios e leilões. Só um evento fica ativo por vez."><button className="btn primary" onClick={() => setEdit({})}>Novo evento</button></Head>
      {events.length === 0 ? <Empty>Nenhum evento ainda.</Empty> : <div className="tablewrap"><table className="grid"><thead><tr><th>Evento</th><th>Data</th><th>Situação</th><th /></tr></thead><tbody>
        {events.map((e) => <tr key={e.id}><td><b>{e.name}</b> <Demo on={e.is_demo} />{e.id === ev?.id && <span className="chip">selecionado</span>}</td><td>{dOnly(e.event_date)}</td><td><span className={`chip ${e.status === 'ativo' ? 'ok' : ''}`}>{STATUS[e.status]}</span></td>
          <td className="r"><span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
            <button className="btn sm" onClick={() => setEdit(e)}>Editar</button>
            {e.status !== 'ativo' && <Act className="btn sm primary" onClick={() => setStatus(e, 'ativo')}>{e.status === 'finalizado' ? 'Reabrir' : 'Ativar'}</Act>}
            {e.status === 'ativo' && <Act className="btn sm" onClick={() => setStatus(e, 'rascunho')}>Pausar</Act>}
            {e.status === 'ativo' && <button className="btn sm danger" onClick={() => setConfirm(e)}>Finalizar</button>}</span></td></tr>)}
      </tbody></table></div>}
      <div className="panel stack"><h3>Dados de demonstração</h3>
        <p className="muted">Cria um evento fictício com 8 colaboradores, 1 quiz, 4 prêmios e 4 leilões, tudo marcado como <span className="chip demo">DEMO</span>, para você ensaiar sem tocar no evento real.</p>
        <div className="row wrap"><Act className="btn" onClick={seedDemo} disabled={events.some((e) => e.is_demo)}>Criar evento de demonstração</Act>
          <Act className="btn" onClick={wipeDemo} disabled={!events.some((e) => e.is_demo) && !d.profiles.some((p) => p.is_demo)}>Apagar dados de demonstração</Act></div></div>
      {edit && <FormModal title={edit.id ? 'Editar evento' : 'Novo evento'} initial={edit} fields={fields} onClose={() => setEdit(null)} onSave={(v) => q(edit.id ? sb.from('events').update(v).eq('id', edit.id) : sb.from('events').insert(v))} />}
      {confirm && <Confirm title="Finalizar evento" danger confirmLabel="Finalizar" onClose={() => setConfirm(null)} onConfirm={async () => { if (d.live) throw new Error('Encerre o leilão em andamento antes.'); await setStatus(confirm, 'finalizado') }}><p>Ao finalizar “{confirm.name}”, os colaboradores deixam de ver o evento e nada mais muda nele. O histórico continua disponível aqui.</p></Confirm>}
    </div>
  )
}

function Audit({ ev, d }) {
  const [rows] = useLive('audit_log', (t) => t.select('*').order('id', { ascending: false }).limit(300), [])
  if (!rows) return <Loading />
  return (
    <div className="stack"><Head title="Auditoria" sub="Últimas 300 ações administrativas, de todos os eventos." />
      <div className="tablewrap"><table className="grid"><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhes</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.id}><td>{dt(r.created_at)}</td><td>{d.pmap.get(r.actor_id)?.full_name ?? 'Sistema'}</td><td><b>{r.action}</b></td><td className="muted small">{r.details ? Object.entries(r.details).filter(([, v]) => v != null && String(v).length < 60 && !/^[0-9a-f-]{36}$/.test(String(v))).map(([k, v]) => `${k}: ${v}`).join(' · ') : ''}</td></tr>)}
      </tbody></table></div></div>
  )
}
