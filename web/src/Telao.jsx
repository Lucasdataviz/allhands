import { useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import QRCode from 'qrcode'
import { dt, go, pts, sb, useLive } from './lib'
import { AuctionClock, Avatar, Loading, Photo } from './ui'
import { RankList, useEventData } from './Colab.jsx'
import { logout, Wordmark } from './App.jsx'

export default function Telao({ me }) {
  const [events] = useLive('events', (t) => t.select('*').eq('status', 'ativo'), [])
  const event = events?.[0]
  const d = useEventData(event?.id)
  const [ds] = useLive('display_state', (t) => t.select('*').eq('event_id', event?.id), [event?.id], { enabled: !!event })
  const [quizzes] = useLive('quizzes', (t) => t.select('*').eq('event_id', event?.id).eq('status', 'publicado'), [event?.id], { enabled: !!event })
  const state = ds?.[0]
  let screen = state?.screen ?? 'inicio'
  if (d.live) screen = screen === 'mensagem' ? 'mensagem' : 'leilao' // leilão ao vivo sempre toma a tela
  else if (screen === 'leilao') screen = 'inicio'
  const result = screen === 'resultado' ? d.auctions.find((a) => a.id === state?.auction_id) : null
  if (screen === 'resultado' && !result) screen = 'inicio'

  const full = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())
  if (events && !event) return <div className="telao"><header><Wordmark /></header><div className="t-msg"><h1>Nenhum evento ativo</h1></div><Tools me={me} full={full} /></div>
  if (!event || !d.ready) return <div className="telao"><Loading /></div>
  const done = d.auctions.filter((a) => a.result === 'arrematado').sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at))
  return (
    <div className="telao">
      <header>
        <Wordmark logo={event.logo_url} />
        <div className="row" style={{ gap: '1.4em' }}>
          {event.is_demo && <span className="chip demo" style={{ fontSize: '.8em' }}>EVENTO DE DEMONSTRAÇÃO</span>}
          <span className="eyebrow">{event.name}</span>
          {d.live && <span className="chip live" style={{ fontSize: '.8em' }}>{d.live.status === 'pausado' ? 'Pausado' : 'Ao vivo'}</span>}
        </div>
      </header>
      <div className="t-stage" key={screen + (result?.id ?? '') + (d.live?.id ?? '')}>
        {screen === 'inicio' && <Home event={event} d={d} />}
        {screen === 'ranking' && <div className="stack" style={{ alignContent: 'start', minHeight: 0 }}><h2>Ranking</h2><div className="t-rank"><RankCols ranking={d.ranking} /></div></div>}
        {screen === 'quizzes' && <QuizzesScreen quizzes={quizzes ?? []} d={d} />}
        {screen === 'premios' && <Prizes d={d} />}
        {screen === 'leilao' && <Auction d={d} />}
        {screen === 'resultado' && <Result a={result} d={d} />}
        {screen === 'historico' && <History done={done} d={d} />}
        {screen === 'mensagem' && <div className="t-msg"><h1>{state?.message || event.welcome_message || 'All Hands'}</h1></div>}
      </div>
      <Tools me={me} full={full} />
    </div>
  )
}

const Tools = ({ me, full }) => (
  <div className="t-tools">
    <button className="btn sm" onClick={full}>Tela cheia</button>
    {me.role === 'admin' ? <button className="btn sm" onClick={() => go('admin')}>Voltar ao painel</button> : <button className="btn sm" onClick={logout}>Sair</button>}
  </div>
)

// Duas colunas de dez, cada uma com animação própria de troca de posição.
function RankCols({ ranking }) {
  return <><RankList ranking={ranking.slice(0, 10)} /><RankList ranking={ranking.slice(10, 20)} /></>
}

function Home({ event, d }) {
  const [qr, setQr] = useState('')
  const url = window.location.origin + window.location.pathname
  useEffect(() => { QRCode.toDataURL(url, { margin: 0, width: 600, color: { dark: '#170b2b' } }).then(setQr).catch(() => {}) }, [url])
  const scored = d.ranking.filter((r) => r.earned > 0).length
  const total = d.ranking.reduce((s, r) => s + r.earned, 0)
  return (
    <div className="t-home">
      <div className="stack loose">
        <div className="stack"><p className="eyebrow">Bem-vindos ao</p><h1>{event.name}</h1><p style={{ fontSize: '1.5em', maxWidth: '26ch' }} className="muted">{event.welcome_message || 'Responda, pontue e dispute os prêmios no leilão.'}</p></div>
        <div className="t-meta"><div><b>{d.ranking.length}</b>participantes</div><div><b>{scored}</b>já pontuaram</div><div><b>{pts(total)}</b>pontos em jogo</div><div><b>{d.prizes.length}</b>prêmios</div></div>
        <div className="row" style={{ gap: '1.4em' }}>{qr && <img className="t-qr" src={qr} alt="QR code para entrar" />}<div><b style={{ fontSize: '1.4em' }}>Aponte a câmera para entrar</b><div className="muted">{url.replace(/^https?:\/\//, '')}</div></div></div>
      </div>
      <div className="stack" style={{ minHeight: 0 }}><h2>Top 8</h2><RankList ranking={d.ranking} limit={8} /></div>
    </div>
  )
}

function QuizzesScreen({ quizzes, d }) {
  const answers = d.ranking.reduce((s, r) => s + r.quizzes_done, 0)
  return (
    <div className="stack loose" style={{ alignContent: 'start' }}>
      <div className="row between"><h2>Quizzes abertos</h2><span className="muted">{answers} participações até agora</span></div>
      {quizzes.length === 0 ? <div className="t-msg"><h1>Nenhum quiz aberto agora</h1></div>
        : <div className="t-grid">{quizzes.map((q) => <div key={q.id} className="t-card"><div className="b stack tight"><h2 style={{ fontSize: '1.5em' }}>{q.title}</h2><span className="muted">{q.description}</span><span className="chip gold" style={{ justifySelf: 'start', fontSize: '.8em' }}>{q.closes_at ? `Até ${dt(q.closes_at)}` : 'Sem prazo'}</span></div></div>)}</div>}
    </div>
  )
}

function Prizes({ d }) {
  const list = d.prizes.filter((p) => p.status !== 'arrematado').slice(0, 8)
  return (
    <div className="stack" style={{ alignContent: 'start', minHeight: 0 }}><h2>Prêmios que vão a leilão</h2>
      <div className="t-grid">{list.map((p) => <div key={p.id} className="t-card"><Photo src={p.photo_url} name={p.name} /><div className="b"><b style={{ fontSize: '1.2em' }}>{p.name}</b><div className="muted">Lance inicial {pts(p.start_price)} pts</div></div></div>)}</div></div>
  )
}

function Auction({ d }) {
  const a = d.live; const p = d.prizeMap.get(a.prize_id); const leader = d.pmap.get(a.current_bidder)
  const donor = p?.donor_name || d.pmap.get(p?.donor_id)?.full_name
  return (
    <div className="t-auction">
      <Photo src={p?.photo_url} name={p?.name} />
      <div className="t-right">
        <div className="stack tight"><p className="eyebrow">Em leilão agora{donor ? ` · oferecido por ${donor}` : ''}</p><h1 style={{ fontSize: '3.6em' }}>{p?.name}</h1>{p?.description && <p className="muted" style={{ fontSize: '1.2em' }}>{p.description}</p>}</div>
        <div><p className="eyebrow">{a.current_bid ? 'Maior lance' : 'Lance inicial'}</p><div key={a.current_bid ?? 0} className="num t-bid pop">{pts(a.current_bid ?? a.start_price)}<small>pts</small></div></div>
        <div style={{ alignSelf: 'center' }}>
          {leader ? <div key={a.current_bidder + a.current_bid} className="t-leader new"><Avatar p={leader} size={96} /><div><p className="eyebrow">Na liderança</p><b style={{ fontFamily: 'var(--display)', fontSize: '2.4em', lineHeight: 1 }}>{leader.full_name}</b></div></div>
            : <div className="t-leader"><b style={{ fontSize: '1.6em' }}>Quem abre os lances?</b></div>}
        </div>
        <div className="row between" style={{ alignItems: 'end' }}>
          <div className="t-meta"><div><b>{pts(a.start_price)}</b>lance inicial</div><div><b>{a.participant_count}</b>participantes</div><div><b>{a.bid_count}</b>lances</div></div>
          <div style={{ textAlign: 'right' }}>{a.mode === 'tempo' ? <><p className="eyebrow">Tempo restante</p><AuctionClock a={a} className="t-clock" onZero={() => sb.rpc('close_expired_auctions')} /></> : <><p className="eyebrow">Encerramento</p><b style={{ fontFamily: 'var(--display)', fontSize: '1.9em' }}>{a.status === 'pausado' ? 'Pausado' : 'Pelo apresentador'}</b></>}</div>
        </div>
      </div>
    </div>
  )
}

function Result({ a, d }) {
  const p = d.prizeMap.get(a.prize_id); const w = d.pmap.get(a.winner_id)
  const fired = useRef(false)
  useEffect(() => {
    if (a.result !== 'arrematado' || fired.current) return
    fired.current = true
    const colors = ['#8b4dff', '#ff4f9a', '#ffc83d', '#ffffff']
    const end = Date.now() + 4500
    const burst = () => {
      confetti({ particleCount: 70, spread: 80, startVelocity: 55, origin: { x: 0.1, y: 0.75 }, angle: 60, colors })
      confetti({ particleCount: 70, spread: 80, startVelocity: 55, origin: { x: 0.9, y: 0.75 }, angle: 120, colors })
      if (Date.now() < end) setTimeout(burst, 650)
    }
    burst()
  }, [a.result])
  if (a.result !== 'arrematado') return <div className="t-win"><p className="eyebrow">Leilão encerrado</p><h1>Sem lances</h1><p style={{ fontSize: '1.6em' }} className="muted">{p?.name} não foi arrematado e pode voltar a leilão.</p></div>
  return (
    <div className="t-win">
      <p className="eyebrow" style={{ fontSize: '1.2em' }}>Leilão encerrado</p>
      <h1>Prêmio arrematado!</h1>
      <div className="pair"><Avatar p={w} size={Math.round(window.innerHeight * 0.26)} /><span style={{ fontSize: '3em' }} className="muted">+</span><Photo src={p?.photo_url} name={p?.name} /></div>
      <div><b style={{ fontFamily: 'var(--display)', fontSize: '3.4em', lineHeight: 1 }}>{w?.full_name}</b><p style={{ fontSize: '1.7em' }}>levou <b>{p?.name}</b> por <span className="num coin">{pts(a.final_price)} pts</span></p></div>
    </div>
  )
}

function History({ done, d }) {
  return (
    <div className="stack" style={{ alignContent: 'start', minHeight: 0 }}><h2>Prêmios arrematados</h2>
      {done.length === 0 ? <div className="t-msg"><h1>Ainda não saiu nenhum prêmio</h1></div>
        : <div className="t-grid">{done.slice(0, 8).map((a) => { const p = d.prizeMap.get(a.prize_id); const w = d.pmap.get(a.winner_id); const donor = p?.donor_name || d.pmap.get(p?.donor_id)?.full_name; return (
          <div key={a.id} className="t-card"><Photo src={p?.photo_url} name={p?.name} /><div className="b stack tight"><b style={{ fontSize: '1.15em' }}>{p?.name}</b><div className="row"><Avatar p={w} size={36} /><span className="grow ellipsis">{w?.full_name}</span><span className="num coin">{pts(a.final_price)}</span></div>{donor && <span className="muted small">Oferecido por {donor}</span>}</div></div>) })}</div>}
    </div>
  )
}
