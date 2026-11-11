import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { dt, firstName, pts, rankSort, rpc, sb, serverNow, STATUS, uploadPhoto, useLive, useTick } from './lib'
import { Act, AuctionClock, Avatar, Coin, Demo, Empty, Loading, Modal, Photo, useToast } from './ui'
import { changePassword, logout, Wordmark } from './App.jsx'

// Anima a troca de posições numa lista (ranking).
export function useFlip(ref, dep) {
  const prev = useRef(new Map())
  useLayoutEffect(() => {
    if (!ref.current) return
    const next = new Map()
    for (const el of ref.current.children) {
      const k = el.dataset.k; if (!k) continue
      const top = el.offsetTop; next.set(k, top)
      const old = prev.current.get(k)
      if (old != null && old !== top) el.animate([{ transform: `translateY(${old - top}px)` }, { transform: 'none' }], { duration: 550, easing: 'cubic-bezier(.2,.8,.2,1)' })
    }
    prev.current = next
  }, [dep, ref])
}

// Dados do evento em tempo real, usados pelo colaborador e pelo telão.
export function useEventData(eventId, { withBids = true } = {}) {
  const on = { enabled: !!eventId }
  const [profiles] = useLive('profiles', (t) => t.select('id,full_name,username,photo_url,sector,branch,role,active,is_demo'), [])
  const [scores] = useLive('scores', (t) => t.select('*').eq('event_id', eventId), [eventId], on)
  const [prizes] = useLive('prizes', (t) => t.select('*').eq('event_id', eventId).order('position').order('created_at'), [eventId], on)
  const [auctions] = useLive('auctions', (t) => t.select('*').eq('event_id', eventId).order('position').order('created_at'), [eventId], on)
  const live = auctions?.find((a) => a.status === 'aberto' || a.status === 'pausado') ?? null
  const [bids] = useLive('bids', (t) => t.select('*').eq('auction_id', live?.id).eq('round', live?.round).eq('voided', false).order('id', { ascending: false }).limit(8), [live?.id, live?.round], { enabled: withBids && !!live })
  const pmap = useMemo(() => new Map((profiles ?? []).map((p) => [p.id, p])), [profiles])
  const prizeMap = useMemo(() => new Map((prizes ?? []).map((p) => [p.id, p])), [prizes])
  const ranking = useMemo(() => (scores ?? []).filter((s) => pmap.get(s.user_id)?.active && pmap.get(s.user_id)?.role === 'colaborador').sort(rankSort)
    .map((s, i) => ({ ...s, pos: i + 1, p: pmap.get(s.user_id) })), [scores, pmap])
  const ready = !!(profiles && scores && prizes && auctions)
  return { ready, pmap, prizeMap, prizes: prizes ?? [], auctions: auctions ?? [], live, bids: live ? bids ?? [] : [], ranking }
}

export default function Colab({ me, event, reloadMe }) {
  const [tab, setTab] = useState('inicio')
  const [quiz, setQuiz] = useState(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const d = useEventData(event?.id)
  const eid = event?.id
  const [walletRows] = useLive('wallets', (t) => t.select('*').eq('event_id', eid).eq('user_id', me.id), [eid], { enabled: !!eid })
  const [quizzes] = useLive('quizzes', (t) => t.select('*').eq('event_id', eid).neq('status', 'rascunho').order('created_at'), [eid], { enabled: !!eid })
  const [attempts, reloadAttempts] = useLive('quiz_attempts', (t) => t.select('*').eq('user_id', me.id), [me.id])
  const [tasks] = useLive('tasks', (t) => t.select('*').eq('event_id', eid).order('created_at'), [eid], { enabled: !!eid })
  const [done] = useLive('task_completions', (t) => t.select('*').eq('user_id', me.id), [me.id])
  const [ledger] = useLive('wallet_ledger', (t) => t.select('*').eq('event_id', eid).eq('user_id', me.id).order('id', { ascending: false }).limit(100), [eid], { enabled: !!eid, also: ['wallets'] })
  const wallet = walletRows?.[0]

  if (!event) return <div className="auth"><div className="auth-card"><Wordmark /><h1>Nenhum evento ativo</h1><p className="muted">Assim que o administrador iniciar o All Hands, tudo aparece aqui.</p><button className="btn" onClick={logout}>Sair</button></div></div>
  if (!d.ready || !walletRows || !quizzes || !attempts) return <Loading />
  if (!wallet) return <div className="auth"><div className="auth-card"><Wordmark logo={event.logo_url} /><h1>Você ainda não está neste evento</h1><p className="muted">Peça ao administrador para incluir você em “{event.name}”.</p><button className="btn" onClick={logout}>Sair</button></div></div>
  if (quiz) return <QuizPlayer quiz={quiz} onExit={() => { setQuiz(null); reloadAttempts() }} />

  const ctx = { me, event, d, wallet, quizzes, attempts, tasks: tasks ?? [], done: done ?? [], ledger: ledger ?? [], setTab, setQuiz }
  const tabs = [['inicio', 'Início'], ['quizzes', 'Quizzes'], ['leilao', 'Leilão'], ['ranking', 'Ranking'], ['carteira', 'Carteira']]
  return (
    <div className="app stack loose">
      <header className="row between">
        <Wordmark logo={event.logo_url} />
        <button className="btn ghost sm" onClick={() => setProfileOpen(true)} aria-label="Meu perfil" style={{ padding: 4 }}><Avatar p={me} size={42} /></button>
      </header>
      {tab === 'inicio' && <Home {...ctx} />}
      {tab === 'quizzes' && <Quizzes {...ctx} />}
      {tab === 'leilao' && <AuctionTab {...ctx} />}
      {tab === 'ranking' && <Ranking {...ctx} />}
      {tab === 'carteira' && <WalletTab {...ctx} />}
      <nav className="tabbar" aria-label="Navegação">
        {tabs.map(([k, label]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); window.scrollTo(0, 0) }}>{label}{k === 'leilao' && d.live && tab !== 'leilao' && <span className="dot" />}</button>)}
      </nav>
      {profileOpen && <ProfileSheet me={me} reloadMe={reloadMe} onClose={() => setProfileOpen(false)} />}
    </div>
  )
}

const quizOpen = (q, now) => q.status === 'publicado' && (!q.opens_at || new Date(q.opens_at) <= now) && (!q.closes_at || new Date(q.closes_at) > now)
const quizClosed = (q, now) => q.status === 'encerrado' || (q.closes_at && new Date(q.closes_at) <= now)

function WalletCard({ wallet, score }) {
  const free = wallet.balance - wallet.reserved
  return (
    <section className="wallet" aria-label="Minha carteira">
      <div className="eyebrow">Saldo disponível</div>
      <div className="num">{pts(free)}<small style={{ fontSize: '.3em', marginLeft: 6, fontFamily: 'var(--body)' }}>PTS</small></div>
      {wallet.reserved > 0 && <div className="small" style={{ marginTop: 6 }}>+ {pts(wallet.reserved)} reservados no seu lance. Voltam se você for superado.</div>}
      <div className="split"><div><b>{pts(score?.earned)}</b>conquistados</div><div><b>{pts(wallet.spent)}</b>usados em prêmios</div></div>
    </section>
  )
}

function Home({ me, event, d, wallet, quizzes, attempts, setTab, setQuiz }) {
  const now = useTick(15000)
  const mine = d.ranking.find((r) => r.user_id === me.id)
  const answered = new Set(attempts.filter((a) => a.finished_at).map((a) => a.quiz_id))
  const open = quizzes.filter((q) => quizOpen(q, now) && !answered.has(q.id))
  const queue = d.auctions.filter((a) => a.status === 'agendado')
  const upcoming = queue.length ? queue.map((a) => ({ a, p: d.prizeMap.get(a.prize_id) })) : d.prizes.filter((p) => p.status === 'disponivel').map((p) => ({ p }))
  const hello = new Date(now).getHours() < 12 ? 'Bom dia' : new Date(now).getHours() < 18 ? 'Boa tarde' : 'Boa noite'
  return (
    <>
      <div className="stack tight"><p className="eyebrow">{event.name}</p><h1>{hello}, {firstName(me.full_name)}.</h1></div>
      {d.live && <LiveBar d={d} onClick={() => setTab('leilao')} />}
      <WalletCard wallet={wallet} score={mine} />
      {mine && <button className="btn block" onClick={() => setTab('ranking')}>Você está em {mine.pos}º lugar de {d.ranking.length}. Ver ranking</button>}
      <section className="stack">
        <div className="row between"><h2>Para responder agora</h2><button className="btn ghost sm" onClick={() => setTab('quizzes')}>Ver todos</button></div>
        {open.length === 0 ? <Empty>Nenhum quiz aberto no momento. Novos quizzes aparecem aqui.</Empty>
          : <div className="panel list" style={{ paddingBlock: 6 }}>{open.map((q) => <QuizRow key={q.id} q={q} onStart={() => setQuiz(q)} />)}</div>}
      </section>
      {upcoming.length > 0 && (
        <section className="stack">
          <h2>Prêmios que vão a leilão</h2>
          <div className="hscroll">{upcoming.map(({ p, a }, i) => p && (
            <div key={a?.id ?? p.id} className="stack tight"><Photo src={p.photo_url} name={p.name} /><b className="ellipsis">{p.name}</b><span className="muted small">Lance inicial {pts(a?.start_price ?? p.start_price)} pts{queue.length ? ` · ${i + 1}º da fila` : ''}</span></div>
          ))}</div>
        </section>
      )}
    </>
  )
}

function LiveBar({ d, onClick }) {
  const p = d.prizeMap.get(d.live.prize_id)
  return (
    <button className="livebar pop" onClick={onClick}>
      <Photo src={p?.photo_url} name={p?.name} />
      <div className="grow"><div className="eyebrow" style={{ color: '#fff' }}>Leilão ao vivo</div><b className="ellipsis" style={{ display: 'block', fontSize: '1.1rem' }}>{p?.name}</b>
        <span className="small">{d.live.current_bid ? `Lance atual ${pts(d.live.current_bid)} pts` : `Abre em ${pts(d.live.start_price)} pts`}</span></div>
      <b>Dar lance</b>
    </button>
  )
}

function QuizRow({ q, onStart, attempt }) {
  return (
    <div className="row between">
      <div className="grow"><b>{q.title}</b><div className="muted small">{q.closes_at ? `Até ${dt(q.closes_at)}` : 'Sem prazo'} · {q.seconds_per_question}s por pergunta</div></div>
      <button className="btn primary sm" onClick={onStart}>{attempt ? 'Continuar' : 'Responder'}</button>
    </div>
  )
}

function Quizzes({ quizzes, attempts, tasks, done, setQuiz }) {
  const now = useTick(15000)
  const [review, setReview] = useState(null)
  const amap = new Map(attempts.map((a) => [a.quiz_id, a]))
  const open = quizzes.filter((q) => quizOpen(q, now) && !amap.get(q.id)?.finished_at)
  const soon = quizzes.filter((q) => q.status === 'publicado' && q.opens_at && new Date(q.opens_at) > now)
  const finished = quizzes.filter((q) => amap.get(q.id)?.finished_at)
  const missed = quizzes.filter((q) => quizClosed(q, now) && !amap.get(q.id))
  const doneSet = new Set(done.map((x) => x.task_id))
  return (
    <>
      <h1>Quizzes e tarefas</h1>
      <section className="stack"><h2>Disponíveis</h2>
        {open.length === 0 ? <Empty>Você está em dia. Nenhum quiz esperando resposta.</Empty>
          : <div className="panel list" style={{ paddingBlock: 6 }}>{open.map((q) => <QuizRow key={q.id} q={q} attempt={amap.get(q.id)} onStart={() => setQuiz(q)} />)}</div>}
        {soon.map((q) => <p key={q.id} className="muted small">Em breve: “{q.title}” abre em {dt(q.opens_at)}.</p>)}
      </section>
      <section className="stack"><h2>Já respondidos</h2>
        {finished.length === 0 ? <p className="muted">Seus resultados aparecem aqui.</p>
          : <div className="panel list" style={{ paddingBlock: 6 }}>{finished.map((q) => { const a = amap.get(q.id); return (
            <div key={q.id} className="row between">
              <div className="grow"><b>{q.title}</b><div className="muted small">{a.correct_count} acertos · {a.wrong_count} erros</div></div>
              <div style={{ textAlign: 'right' }}><Coin n={a.points_earned} />{quizClosed(q, now) && <div><button className="btn ghost sm" onClick={() => setReview(q)}>Ver gabarito</button></div>}</div>
            </div>) })}</div>}
        {finished.some((q) => !quizClosed(q, now)) && <p className="muted small">O gabarito é liberado quando o quiz encerra.</p>}
        {missed.length > 0 && <p className="muted small">Encerrados sem a sua participação: {missed.map((q) => q.title).join(', ')}.</p>}
      </section>
      {tasks.length > 0 && (
        <section className="stack"><h2>Tarefas</h2>
          <div className="panel list" style={{ paddingBlock: 6 }}>{tasks.map((t) => (
            <div key={t.id} className="row between">
              <div className="grow"><b>{t.title}</b>{t.description && <div className="muted small">{t.description}</div>}</div>
              {doneSet.has(t.id) ? <span className="chip ok">Concluída · +{pts(t.points)}</span> : <span className="chip gold">Vale {pts(t.points)} pts</span>}
            </div>))}</div>
          <p className="muted small">As tarefas são conferidas pelo administrador, que libera os pontos.</p>
        </section>
      )}
      {review && <QuizReview quiz={review} attempt={amap.get(review.id)} onClose={() => setReview(null)} />}
    </>
  )
}

function QuizReview({ quiz, attempt, onClose }) {
  const [data, setData] = useState(null)
  useEffect(() => { (async () => {
    const { data: qs } = await sb.from('questions').select('id,body,position,points,options(id,body,position,option_keys(is_correct))').eq('quiz_id', quiz.id).order('position')
    const { data: ans } = await sb.from('attempt_answers').select('*').eq('attempt_id', attempt.id)
    setData({ qs: qs ?? [], ans: new Map((ans ?? []).map((a) => [a.question_id, a])) })
  })() }, [quiz.id, attempt.id])
  const isRight = (o) => { const k = o.option_keys; return Array.isArray(k) ? k[0]?.is_correct : k?.is_correct }
  return (
    <Modal title={`Gabarito: ${quiz.title}`} onClose={onClose}>
      {!data ? <Loading /> : data.qs.map((qq, i) => { const a = data.ans.get(qq.id); return (
        <div key={qq.id} className="stack tight"><b>{i + 1}. {qq.body}</b>
          {[...qq.options].sort((x, y) => x.position - y.position).map((o) => (
            <div key={o.id} className={`opt ${isRight(o) ? 'right' : a?.option_id === o.id ? 'wrong' : ''}`} style={{ padding: 10, cursor: 'default' }}>
              <span className="grow">{o.body}</span>{isRight(o) && <span className="chip ok">Correta</span>}{a?.option_id === o.id && <span className="chip">Sua resposta</span>}
            </div>))}
          {a?.timed_out && <span className="muted small">Você não respondeu a tempo.</span>}
        </div>) })}
    </Modal>
  )
}

function QuizPlayer({ quiz, onExit }) {
  const toast = useToast()
  const [st, setSt] = useState(null); const [sel, setSel] = useState(null); const [sending, setSending] = useState(false); const [err, setErr] = useState('')
  const now = useTick(200)
  const load = async () => { try { setSt(await rpc('quiz_state', { p_quiz: quiz.id })); setSel(null) } catch (e) { setErr(e.message) } }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const left = st && !st.finished ? new Date(st.deadline).getTime() - now : 0
  const timedOut = useRef(null)
  useEffect(() => { // tempo esgotado: o servidor marca como erro e devolve a próxima
    if (st && !st.finished && left <= -400 && timedOut.current !== st.question.id && !sending) { timedOut.current = st.question.id; toast('Tempo esgotado nesta pergunta.', 'bad'); setTimeout(load, 1800) }
  })
  const answer = async () => {
    if (!sel || sending) return
    setSending(true)
    try { setSt(await rpc('quiz_answer', { p_quiz: quiz.id, p_question: st.question.id, p_option: sel })); setSel(null) }
    catch (e) { toast(e.message.includes('fetch') ? 'Sem conexão. Sua resposta não foi enviada; tente de novo.' : e.message, 'bad') } finally { setSending(false) }
  }
  if (err) return <div className="quiz"><div /><div className="stack"><h1>Não foi possível abrir</h1><p className="muted">{err}</p></div><button className="btn" onClick={onExit}>Voltar</button></div>
  if (!st) return <Loading />
  if (st.finished) return (
    <div className="quiz">
      <p className="eyebrow">{quiz.title}</p>
      <div className="stack loose" style={{ alignContent: 'center', textAlign: 'center' }}>
        <div className="pop"><div className="eyebrow">Você ganhou</div><div className="num coin" style={{ fontSize: '5rem', lineHeight: 1 }}>+{pts(st.points)}</div><div className="muted">pontos na sua carteira</div></div>
        <div className="row" style={{ justifyContent: 'center', gap: 28 }}>
          <div><div className="num" style={{ fontSize: '2rem' }}>{st.total}</div><span className="muted small">perguntas</span></div>
          <div><div className="num" style={{ fontSize: '2rem', color: 'var(--ok)' }}>{st.correct}</div><span className="muted small">acertos</span></div>
          <div><div className="num" style={{ fontSize: '2rem', color: 'var(--bad)' }}>{st.wrong}</div><span className="muted small">erros</span></div>
        </div>
        <p className="muted small">O gabarito fica disponível quando o quiz encerrar para todos.</p>
      </div>
      <button className="btn primary big block" onClick={onExit}>Voltar ao início</button>
    </div>
  )
  const pct = Math.max(0, Math.min(100, (left / (st.seconds * 1000)) * 100))
  return (
    <div className="quiz">
      <div className="stack tight">
        <div className="row between small"><b>Pergunta {st.index + 1} de {st.total}</b><span className={`clock ${left < 6000 ? 'low' : ''}`}>{Math.max(0, Math.ceil(left / 1000))}s</span></div>
        <div className="timebar"><i className={left < 6000 ? 'low' : ''} style={{ width: pct + '%' }} /></div>
      </div>
      <div className="stack rise" key={st.question.id}>
        <span className="chip gold" style={{ justifySelf: 'start' }}>Vale {pts(st.question.points)} pts</span>
        <h2 style={{ fontSize: '1.5rem' }}>{st.question.body}</h2>
        <div className="stack tight" role="radiogroup">{st.question.options.map((o, i) => (
          <button key={o.id} role="radio" aria-checked={sel === o.id} className={`opt ${sel === o.id ? 'sel' : ''}`} onClick={() => setSel(o.id)} disabled={left <= 0}><span className="k">{String.fromCharCode(65 + i)}</span>{o.body}</button>))}</div>
      </div>
      <div className="stack tight">
        <button className="btn primary big block" disabled={!sel || sending || left <= 0} onClick={answer}>{sending ? 'Enviando…' : 'Confirmar resposta'}</button>
        <button className="btn ghost sm" onClick={onExit}>Sair (o tempo desta pergunta continua correndo)</button>
      </div>
    </div>
  )
}

function AuctionTab({ me, d, wallet }) {
  const last = [...d.auctions].filter((a) => a.status === 'encerrado').sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at))
  const queue = d.auctions.filter((a) => a.status === 'agendado')
  if (d.live) return <BidRoom me={me} d={d} wallet={wallet} />
  const justClosed = last[0] && serverNow() - new Date(last[0].closed_at) < 5 * 60000 ? last[0] : null
  return (
    <>
      <h1>Leilão</h1>
      {justClosed ? <ResultCard a={justClosed} d={d} me={me} /> : <Empty>Nenhum leilão ao vivo agora. Quando começar, esta tela vira a sala de lances.</Empty>}
      {queue.length > 0 && <section className="stack"><h2>Na fila</h2><div className="panel list" style={{ paddingBlock: 6 }}>{queue.map((a, i) => { const p = d.prizeMap.get(a.prize_id); return (
        <div key={a.id} className="row"><Photo src={p?.photo_url} name={p?.name} style={{ width: 64, flex: 'none' }} />
          <div className="grow"><b>{p?.name}</b><div className="muted small">Lote {i + 1} · inicial {pts(a.start_price)} pts · de {pts(a.min_increment)} em {pts(a.min_increment)}</div>{(p?.donor_name || p?.donor_id) && <div className="muted small">Oferecido por {p.donor_name || d.pmap.get(p.donor_id)?.full_name}</div>}</div></div>) })}</div></section>}
      {last.length > 0 && <section className="stack"><h2>Já foram</h2><div className="panel list" style={{ paddingBlock: 6 }}>{last.map((a) => { const p = d.prizeMap.get(a.prize_id); const w = d.pmap.get(a.winner_id); return (
        <div key={a.id} className="row"><Photo src={p?.photo_url} name={p?.name} style={{ width: 54, flex: 'none' }} />
          <div className="grow"><b>{p?.name}</b><div className="muted small">{a.result === 'arrematado' ? `${w?.full_name ?? '—'}${a.winner_id === me.id ? ' (você!)' : ''}` : 'Sem lances'}</div></div>
          {a.result === 'arrematado' && <Coin n={a.final_price} />}</div>) })}</div></section>}
    </>
  )
}

function ResultCard({ a, d, me }) {
  const p = d.prizeMap.get(a.prize_id); const w = d.pmap.get(a.winner_id)
  return (
    <div className="lot pop"><Photo src={p?.photo_url} name={p?.name} />
      <div className="body" style={{ textAlign: 'center' }}>
        <p className="eyebrow">Leilão encerrado</p>
        {a.result === 'arrematado' ? <><h2>{a.winner_id === me.id ? 'É seu! Parabéns!' : `${w?.full_name} arrematou`}</h2><p>{p?.name} por <Coin n={a.final_price} /></p></> : <h2>{p?.name} ficou sem lances</h2>}
      </div></div>
  )
}

function BidRoom({ me, d, wallet }) {
  const toast = useToast()
  const a = d.live; const p = d.prizeMap.get(a.prize_id); const leader = d.pmap.get(a.current_bidder)
  const [confirm, setConfirm] = useState(null); const [custom, setCustom] = useState('')
  const free = wallet.balance - wallet.reserved
  const iLead = a.current_bidder === me.id
  const min = a.current_bid == null ? a.start_price : a.current_bid + a.min_increment
  const isDonor = p?.donor_id === me.id
  const wasLeader = useRef(iLead); const [lost, setLost] = useState(false)
  useEffect(() => {
    if (wasLeader.current && !iLead && a.current_bidder) { setLost(true); navigator.vibrate?.([120, 60, 120]) }
    if (iLead) setLost(false)
    wasLeader.current = iLead
  }, [iLead, a.current_bidder])
  const paused = a.status === 'pausado'
  const send = async (amount) => {
    const r = await rpc('place_bid', { p_auction: a.id, p_amount: amount })
    if (r.ok) { toast(`Lance de ${pts(amount)} pts registrado. Você lidera!`, 'ok'); setCustom('') } else toast(r.message, 'bad')
  }
  const ask = (amount) => {
    if (!Number.isFinite(amount) || amount < min) return toast(`O lance mínimo agora é ${pts(min)} pts.`, 'bad')
    if (amount > free) return toast(`Você tem ${pts(free)} pts disponíveis.`, 'bad')
    setConfirm(amount)
  }
  const quick = [[min, 'Mínimo'], [min + a.min_increment, '+1 passo'], [min + 4 * a.min_increment, '+4 passos']]
  const can = !paused && !iLead && !isDonor
  return (
    <>
      <div className="row between"><h1>Sala de lances</h1><span className={`chip ${paused ? '' : 'live'}`}>{paused ? 'Pausado' : 'Ao vivo'}</span></div>
      <div className="lot">
        <Photo src={p?.photo_url} name={p?.name} />
        <div className="body">
          <div><h2>{p?.name}</h2>{p?.description && <p className="muted small">{p.description}</p>}{(p?.donor_name || p?.donor_id) && <p className="muted small">Oferecido por {p.donor_name || d.pmap.get(p.donor_id)?.full_name}</p>}</div>
          <div className="bidnow">
            <div><div className="eyebrow">{a.current_bid ? 'Lance atual' : 'Lance inicial'}</div><div key={a.current_bid} className="num coin pop">{pts(a.current_bid ?? a.start_price)}</div></div>
            <div style={{ textAlign: 'right' }}><div className="eyebrow">{a.mode === 'tempo' ? 'Tempo' : 'Encerramento'}</div><AuctionClock a={a} className="num" onZero={() => sb.rpc('close_expired_auctions')} />{a.mode === 'manual' && <div className="muted small">pelo apresentador</div>}</div>
          </div>
          {leader ? <div className="row"><Avatar p={leader} size={36} /><div className="grow"><b>{iLead ? 'Você' : leader.full_name}</b><span className="muted small"> lidera · {a.participant_count} {a.participant_count === 1 ? 'participante' : 'participantes'}</span></div></div> : <p className="muted">Ninguém deu lance ainda. Abra o leilão!</p>}
          {iLead && <div className="leadbanner win">Você está na frente. Seus {pts(a.current_bid)} pts ficam reservados.</div>}
          {lost && !iLead && <div className="leadbanner lost">Você foi superado! Seus pontos já voltaram para a carteira.</div>}
          {isDonor && <div className="leadbanner">Este prêmio foi oferecido por você, então você não dá lance nele.</div>}
          {paused && <div className="leadbanner">O apresentador pausou o leilão. Aguarde.</div>}
        </div>
      </div>
      {can && (
        <section className="stack">
          <div className="row between"><h2>Dar lance</h2><span className="muted small">Disponível: <b>{pts(free)} pts</b></span></div>
          <div className="quick">{quick.map(([v, label], i) => <button key={i} className={`btn ${i === 0 ? 'hot' : ''}`} disabled={v > free} onClick={() => ask(v)}><span className="num">{pts(v)}</span><small>{label}</small></button>)}</div>
          <div className="row"><input className="input" inputMode="numeric" placeholder={`Outro valor (mín. ${pts(min)})`} value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))} /><button className="btn primary" disabled={!custom} onClick={() => ask(Number(custom))}>Dar lance</button></div>
          {free < min && <p className="err">Seu saldo disponível não alcança o lance mínimo deste leilão.</p>}
        </section>
      )}
      <section className="stack tight"><h3>Últimos lances</h3>
        {d.bids.length === 0 ? <p className="muted small">Os lances aparecem aqui em tempo real.</p> : <div className="bidfeed">{d.bids.map((b) => <div key={b.id} className="row between"><span className="row"><Avatar p={d.pmap.get(b.user_id)} size={26} />{b.user_id === me.id ? 'Você' : d.pmap.get(b.user_id)?.full_name}</span><Coin n={b.amount} /></div>)}</div>}
      </section>
      {confirm != null && (
        <Modal title="Confirmar lance" onClose={() => setConfirm(null)}>
          <div style={{ textAlign: 'center' }}><div className="num coin" style={{ fontSize: '3.6rem', lineHeight: 1 }}>{pts(confirm)}</div><p className="muted">pontos em “{p?.name}”</p></div>
          <p className="muted small">Os pontos ficam reservados enquanto você lidera e voltam na hora se alguém superar o seu lance.</p>
          <Act className="btn hot big block" onClick={async () => { await send(confirm); setConfirm(null) }}>Confirmar lance</Act>
          <button className="btn block" onClick={() => setConfirm(null)}>Cancelar</button>
        </Modal>
      )}
    </>
  )
}

export function RankList({ ranking, meId, limit }) {
  const ref = useRef()
  const rows = limit ? ranking.slice(0, limit) : ranking
  useFlip(ref, rows.map((r) => r.user_id).join())
  return (
    <div ref={ref}>{rows.map((r) => (
      <div key={r.user_id} data-k={r.user_id} className={`rankrow ${r.user_id === meId ? 'me' : ''}`}>
        <span className="pos">{r.pos}º</span><Avatar p={r.p} size={40} />
        <div className="grow"><b className="ellipsis" style={{ display: 'block' }}>{r.p?.full_name} <Demo on={r.p?.is_demo} /></b><span className="muted small">{r.quizzes_done} {r.quizzes_done === 1 ? 'quiz' : 'quizzes'} · {r.prizes_won} {r.prizes_won === 1 ? 'prêmio' : 'prêmios'}</span></div>
        <Coin n={r.earned} />
      </div>))}</div>
  )
}

function Ranking({ me, d }) {
  const top = d.ranking.slice(0, 3)
  return (
    <>
      <div className="stack tight"><h1>Ranking</h1><p className="muted">Conta o total conquistado em quizzes e tarefas. Gastar em lances não derruba ninguém.</p></div>
      {top.length === 3 && (
        <div className="podium">{[top[1], top[0], top[2]].map((r, i) => (
          <div key={r.user_id} className={i === 1 ? 'p1' : ''}><span className="place" style={{ color: i === 1 ? 'var(--gold)' : 'var(--muted)' }}>{r.pos}º</span><Avatar p={r.p} size={i === 1 ? 68 : 52} /><b className="small">{firstName(r.p?.full_name)}</b><Coin n={r.earned} /></div>))}</div>
      )}
      {d.ranking.length === 0 ? <Empty>O ranking começa quando alguém pontuar.</Empty> : <RankList ranking={d.ranking} meId={me.id} />}
    </>
  )
}

const KIND = { quiz: 'Quiz', tarefa: 'Tarefa', ajuste: 'Ajuste do administrador', premio: 'Prêmio', estorno: 'Estorno' }
function WalletTab({ me, d, wallet, ledger }) {
  const mine = d.ranking.find((r) => r.user_id === me.id)
  const won = d.auctions.filter((a) => a.winner_id === me.id && a.result === 'arrematado')
  return (
    <>
      <h1>Carteira</h1>
      <WalletCard wallet={wallet} score={mine} />
      {won.length > 0 && <section className="stack"><h2>Meus prêmios</h2><div className="panel list" style={{ paddingBlock: 6 }}>{won.map((a) => { const p = d.prizeMap.get(a.prize_id); return (
        <div key={a.id} className="row"><Photo src={p?.photo_url} name={p?.name} style={{ width: 54, flex: 'none' }} /><div className="grow"><b>{p?.name}</b><div className="muted small">{a.delivered ? 'Entregue' : 'Retire com a organização'}</div></div><Coin n={a.final_price} /></div>) })}</div></section>}
      <section className="stack"><h2>Extrato</h2>
        {ledger.length === 0 ? <Empty>Nenhuma movimentação ainda. Responda um quiz para ganhar os primeiros pontos.</Empty>
          : <div className="panel list" style={{ paddingBlock: 6 }}>{ledger.map((l) => (
            <div key={l.id} className="row between"><div className="grow"><b>{l.reason}</b><div className="muted small">{KIND[l.kind]} · {dt(l.created_at)}</div></div>
              <span className="num" style={{ color: l.amount >= 0 ? 'var(--ok)' : 'var(--bad)' }}>{l.amount >= 0 ? '+' : '−'}{pts(Math.abs(l.amount))}</span></div>))}</div>}
      </section>
    </>
  )
}

function ProfileSheet({ me, reloadMe, onClose }) {
  const toast = useToast()
  const [p1, setP1] = useState(''); const [p2, setP2] = useState(''); const [busy, setBusy] = useState(false)
  const pick = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    setBusy(true)
    try { await rpc('set_my_photo', { p_url: await uploadPhoto(f, `perfis/${me.id}`) }); await reloadMe(); toast('Foto atualizada.', 'ok') } catch (err) { toast(err.message, 'bad') } finally { setBusy(false) }
  }
  return (
    <Modal title="Meu perfil" onClose={onClose}>
      <div className="row"><Avatar p={me} size={72} /><div className="grow"><b>{me.full_name}</b><div className="muted small">{me.username}{me.sector ? ` · ${me.sector}` : ''}{me.branch ? ` · ${me.branch}` : ''}</div></div></div>
      <label className="btn">{busy ? 'Enviando…' : 'Trocar foto'}<input type="file" accept="image/*" hidden onChange={pick} disabled={busy} /></label>
      <h3>Trocar senha</h3>
      <input className="input" type="password" placeholder="Nova senha" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} />
      <input className="input" type="password" placeholder="Repita a nova senha" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} />
      <Act className="btn primary" disabled={!p1} onClick={async () => { await changePassword(p1, p2); setP1(''); setP2(''); toast('Senha alterada.', 'ok') }}>Salvar nova senha</Act>
      <button className="btn danger" onClick={logout}>Sair da conta</button>
    </Modal>
  )
}
