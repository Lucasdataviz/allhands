import { useEffect, useState } from 'react'
import { dt, pts, q, rpc, sb, STATUS, useLive } from './lib'
import { Act, AuctionClock, Avatar, Coin, Confirm, Demo, Empty, FormModal, Loading, Modal, Photo, useToast } from './ui'
import { exportXlsx, Head } from './Admin.jsx'

/* ───────── Quizzes ───────── */
export function QuizzesAdmin({ ev, d }) {
  const [edit, setEdit] = useState(null); const [qs, setQs] = useState(null); const [res, setRes] = useState(null); const [del, setDel] = useState(null)
  const count = (id) => d.attempts.filter((a) => a.quiz_id === id)
  const fields = [{ name: 'title', label: 'Título', required: true }, { name: 'description', label: 'Descrição', type: 'textarea' },
    { name: 'opens_at', label: 'Abre em', type: 'datetime', hint: 'Em branco = assim que publicar.' }, { name: 'closes_at', label: 'Prazo final', type: 'datetime', hint: 'Depois do prazo ninguém responde e o gabarito é liberado.' },
    { name: 'seconds_per_question', label: 'Segundos por pergunta', type: 'number', min: 5, default: 30, required: true }]
  const publish = async (z) => {
    const { count: n } = await sb.from('questions').select('id', { count: 'exact', head: true }).eq('quiz_id', z.id)
    if (!n) throw new Error('Adicione ao menos uma pergunta antes de publicar.')
    await q(sb.from('quizzes').update({ status: 'publicado' }).eq('id', z.id))
  }
  return (
    <div className="stack">
      <Head title="Quizzes" sub="Monte em rascunho, publique quando estiver pronto. Cada colaborador responde uma única vez."><button className="btn primary" onClick={() => setEdit({})}>Novo quiz</button></Head>
      {d.quizzes.length === 0 ? <Empty>Nenhum quiz ainda.</Empty> : <div className="tablewrap"><table className="grid"><thead><tr><th>Quiz</th><th>Situação</th><th>Janela</th><th className="r">Respostas</th><th /></tr></thead><tbody>
        {d.quizzes.map((z) => { const at = count(z.id); return (
          <tr key={z.id}><td><b>{z.title}</b><div className="muted small">{z.seconds_per_question}s por pergunta</div></td>
            <td><span className={`chip ${z.status === 'publicado' ? 'ok' : ''}`}>{STATUS[z.status]}</span></td>
            <td className="small">{z.opens_at ? dt(z.opens_at) : 'ao publicar'} → {z.closes_at ? dt(z.closes_at) : 'sem prazo'}</td>
            <td className="r">{at.filter((a) => a.finished_at).length}</td>
            <td className="r"><span className="row wrap" style={{ justifyContent: 'flex-end', gap: 6 }}>
              <button className="btn sm" onClick={() => setQs(z)}>Perguntas</button>
              <button className="btn sm" onClick={() => setEdit(z)}>Editar</button>
              {z.status === 'rascunho' && <Act className="btn sm primary" onClick={() => publish(z)}>Publicar</Act>}
              {z.status === 'publicado' && <Act className="btn sm" onClick={() => q(sb.from('quizzes').update({ status: 'encerrado' }).eq('id', z.id))}>Encerrar</Act>}
              {z.status === 'encerrado' && <Act className="btn sm" onClick={() => q(sb.from('quizzes').update({ status: 'publicado' }).eq('id', z.id))}>Reabrir</Act>}
              {z.status === 'publicado' && at.length === 0 && <Act className="btn sm" onClick={() => q(sb.from('quizzes').update({ status: 'rascunho' }).eq('id', z.id))}>Voltar a rascunho</Act>}
              <button className="btn sm" onClick={() => setRes(z)}>Resultados</button>
              <button className="btn sm" onClick={() => setDel(z)} disabled={at.length > 0} title={at.length ? 'Já tem respostas: encerre em vez de excluir' : ''}>Excluir</button></span></td></tr>) })}
      </tbody></table></div>}
      {edit && <FormModal title={edit.id ? 'Editar quiz' : 'Novo quiz'} initial={edit} fields={fields} onClose={() => setEdit(null)}
        onSave={(v) => { if (v.opens_at && v.closes_at && v.closes_at <= v.opens_at) throw new Error('O prazo final precisa ser depois da abertura.'); return q(edit.id ? sb.from('quizzes').update(v).eq('id', edit.id) : sb.from('quizzes').insert({ ...v, event_id: ev.id })) }} />}
      {qs && <QuestionsEditor quiz={d.quizzes.find((z) => z.id === qs.id) ?? qs} locked={count(qs.id).length > 0} onClose={() => setQs(null)} />}
      {res && <QuizResults quiz={res} attempts={count(res.id)} d={d} onClose={() => setRes(null)} />}
      {del && <Confirm title="Excluir quiz" danger confirmLabel="Excluir" onClose={() => setDel(null)} onConfirm={() => q(sb.from('quizzes').delete().eq('id', del.id))}><p>Excluir “{del.title}” e todas as suas perguntas?</p></Confirm>}
    </div>
  )
}

function QuestionsEditor({ quiz, locked, onClose }) {
  const [rows, reload] = useLive('questions', (t) => t.select('*, options(*, option_keys(is_correct))').eq('quiz_id', quiz.id).order('position'), [quiz.id], { also: ['options', 'option_keys'] })
  const [form, setForm] = useState(null)
  const right = (o) => { const k = o.option_keys; return !!(Array.isArray(k) ? k[0]?.is_correct : k?.is_correct) }
  const blank = (kind = 'multipla') => ({ kind, body: '', points: 10, opts: kind === 'vf' ? ['Verdadeiro', 'Falso'] : ['', '', '', ''], correct: 0 })
  const openEdit = (qq) => { const os = [...qq.options].sort((a, b) => a.position - b.position); setForm({ id: qq.id, kind: qq.kind, body: qq.body, points: qq.points, opts: os.map((o) => o.body), correct: Math.max(0, os.findIndex(right)) }) }
  const save = async () => {
    const opts = form.opts.map((o) => o.trim()); const filled = opts.map((o, i) => ({ o, i })).filter((x) => x.o)
    if (!form.body.trim()) throw new Error('Escreva a pergunta.')
    if (filled.length < 2) throw new Error('Informe ao menos duas alternativas.')
    if (!opts[form.correct]) throw new Error('Marque a alternativa correta.')
    if (!(Number(form.points) >= 0)) throw new Error('Pontos inválidos.')
    const base = { kind: form.kind, body: form.body.trim(), points: Number(form.points) }
    let id = form.id
    if (id) { await q(sb.from('questions').update(base).eq('id', id)); await q(sb.from('options').delete().eq('question_id', id)) }
    else { const [n] = await q(sb.from('questions').insert({ ...base, quiz_id: quiz.id, position: (rows?.length ?? 0) }).select()); id = n.id }
    const os = await q(sb.from('options').insert(filled.map((x, pos) => ({ question_id: id, position: pos, body: x.o }))).select())
    await q(sb.from('option_keys').insert(os.map((o) => ({ option_id: o.id, is_correct: filled[o.position].i === form.correct }))))
    setForm(null); reload()
  }
  const canEdit = quiz.status === 'rascunho' && !locked
  return (
    <Modal title={`Perguntas: ${quiz.title}`} onClose={onClose} wide>
      {!canEdit && <p className="chip gold" style={{ justifySelf: 'start', whiteSpace: 'normal' }}>{locked ? 'Este quiz já tem respostas: as perguntas ficam travadas.' : 'Para editar as perguntas, volte o quiz para rascunho.'}</p>}
      {!rows ? <Loading /> : rows.length === 0 ? <Empty>Nenhuma pergunta ainda.</Empty> : rows.map((qq, i) => (
        <div key={qq.id} className="panel stack tight">
          <div className="row between"><b>{i + 1}. {qq.body}</b><span className="row" style={{ gap: 6 }}><span className="chip gold">{pts(qq.points)} pts</span>
            {canEdit && <><button className="btn sm" onClick={() => openEdit(qq)}>Editar</button><Act className="btn sm" onClick={async () => { await q(sb.from('questions').delete().eq('id', qq.id)); reload() }}>Excluir</Act></>}</span></div>
          {[...qq.options].sort((a, b) => a.position - b.position).map((o) => <div key={o.id} className="small">{right(o) ? <b style={{ color: 'var(--ok)' }}>✓ {o.body}</b> : <span className="muted">○ {o.body}</span>}</div>)}
        </div>))}
      {canEdit && !form && <div className="row wrap"><button className="btn primary" onClick={() => setForm(blank())}>Adicionar múltipla escolha</button><button className="btn" onClick={() => setForm(blank('vf'))}>Adicionar verdadeiro ou falso</button></div>}
      {form && <div className="panel stack" style={{ borderColor: 'var(--brand)' }}>
        <h3>{form.id ? 'Editar pergunta' : 'Nova pergunta'}</h3>
        <label className="field"><span>Pergunta</span><textarea className="input" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} autoFocus /></label>
        <div className="field"><span>Alternativas (marque a correta)</span>{form.opts.map((o, i) => (
          <div key={i} className="row"><input type="radio" name="correct" checked={form.correct === i} onChange={() => setForm({ ...form, correct: i })} aria-label={`Alternativa ${i + 1} é a correta`} style={{ width: 20, height: 20, accentColor: 'var(--ok)' }} />
            <input className="input" value={o} readOnly={form.kind === 'vf'} placeholder={`Alternativa ${i + 1}${i > 1 ? ' (opcional)' : ''}`} onChange={(e) => setForm({ ...form, opts: form.opts.map((x, j) => (j === i ? e.target.value : x)) })} /></div>))}
          {form.kind === 'multipla' && form.opts.length < 6 && <button className="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => setForm({ ...form, opts: [...form.opts, ''] })}>+ alternativa</button>}</div>
        <label className="field" style={{ maxWidth: 200 }}><span>Pontos por acerto</span><input className="input" type="number" min="0" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} /></label>
        <div className="row"><Act className="btn primary" onClick={save}>Salvar pergunta</Act><button className="btn" onClick={() => setForm(null)}>Cancelar</button></div>
      </div>}
    </Modal>
  )
}

function QuizResults({ quiz, attempts, d, onClose }) {
  const [stats, setStats] = useState(null)
  useEffect(() => { (async () => {
    const ids = attempts.map((a) => a.id); if (!ids.length) return setStats([])
    const { data: qs } = await sb.from('questions').select('id,body,position').eq('quiz_id', quiz.id).order('position')
    const { data: ans } = await sb.from('attempt_answers').select('question_id,is_correct').in('attempt_id', ids)
    setStats((qs ?? []).map((qq) => { const a = (ans ?? []).filter((x) => x.question_id === qq.id); return { ...qq, n: a.length, ok: a.filter((x) => x.is_correct).length } }))
  })() }, [quiz.id, attempts.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const rows = [...attempts].sort((a, b) => b.points_earned - a.points_earned)
  return (
    <Modal title={`Resultados: ${quiz.title}`} onClose={onClose} wide>
      {rows.length === 0 ? <Empty>Ninguém respondeu ainda.</Empty> : <>
        <div className="tablewrap"><table className="grid"><thead><tr><th>Colaborador</th><th>Situação</th><th className="r">Acertos</th><th className="r">Erros</th><th className="r">Pontos</th></tr></thead><tbody>
          {rows.map((a) => <tr key={a.id}><td>{d.pmap.get(a.user_id)?.full_name}</td><td>{a.finished_at ? dt(a.finished_at) : <span className="chip">em andamento</span>}</td><td className="r">{a.correct_count}</td><td className="r">{a.wrong_count}</td><td className="r"><Coin n={a.points_earned} /></td></tr>)}</tbody></table></div>
        <h3>Acerto por pergunta</h3>
        {!stats ? <Loading /> : stats.map((s, i) => <div key={s.id} className="row between"><span className="grow ellipsis">{i + 1}. {s.body}</span><b>{s.n ? Math.round((s.ok / s.n) * 100) : 0}%</b><span className="muted small">{s.ok}/{s.n}</span></div>)}
        <button className="btn" onClick={() => exportXlsx(`quiz-${quiz.title}`, rows.map((a) => ({ Colaborador: d.pmap.get(a.user_id)?.full_name, Acertos: a.correct_count, Erros: a.wrong_count, Pontos: a.points_earned, Concluído: a.finished_at ? dt(a.finished_at) : 'Em andamento' })))}>Exportar Excel</button>
      </>}
    </Modal>
  )
}

/* ───────── Prêmios ───────── */
export function Prizes({ ev, d }) {
  const [edit, setEdit] = useState(null); const [del, setDel] = useState(null); const [auc, setAuc] = useState(null)
  const colabs = d.profiles.filter((p) => p.role === 'colaborador' && p.active)
  const fields = [{ name: 'name', label: 'Nome do prêmio', required: true }, { name: 'photo_url', label: 'Foto', type: 'image', folder: 'premios' }, { name: 'description', label: 'Descrição', type: 'textarea' },
    { name: 'category', label: 'Categoria', hint: 'Ex.: Lanches, Brindes, Vales, Experiências.' }, { name: 'quantity', label: 'Quantidade disponível', type: 'number', min: 1, default: 1, required: true, hint: 'Cada unidade vai a leilão separadamente.' },
    { name: 'donor_id', label: 'Colaborador que oferece (não poderá dar lance)', type: 'select', options: [{ value: '', label: 'Ninguém / a empresa' }, ...colabs.map((p) => ({ value: p.id, label: p.full_name }))] },
    { name: 'donor_name', label: 'Ou nome de quem oferece (texto livre)', hint: 'Ex.: Diretoria, Parceiro X.' },
    { name: 'start_price', label: 'Lance inicial (pts)', type: 'number', min: 1, default: 10, required: true }, { name: 'min_increment', label: 'Incremento mínimo (pts)', type: 'number', min: 1, default: 5, required: true }]
  const used = (p) => d.auctions.some((a) => a.prize_id === p.id && !['agendado', 'cancelado'].includes(a.status))
  const save = (v) => { if (v.quantity < (edit.quantity_sold ?? 0)) throw new Error('A quantidade não pode ser menor que as unidades já arrematadas.'); return q(edit.id ? sb.from('prizes').update(v).eq('id', edit.id) : sb.from('prizes').insert({ ...v, event_id: ev.id, position: d.prizes.length })) }
  return (
    <div className="stack">
      <Head title="Prêmios" sub="Qualquer coisa pode ir a leilão: lanches, brindes, vales, experiências."><button className="btn primary" onClick={() => setEdit({})}>Novo prêmio</button></Head>
      {d.prizes.length === 0 ? <Empty>Nenhum prêmio cadastrado.</Empty> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
        {d.prizes.map((p) => <div key={p.id} className="lot">
          <Photo src={p.photo_url} name={p.name} />
          <div className="body" style={{ gap: 8 }}>
            <div className="row between"><b>{p.name}</b><span className={`chip ${p.status === 'arrematado' ? 'ok' : p.status === 'em_leilao' ? 'live' : ''}`}>{STATUS[p.status]}</span></div>
            <div className="muted small">{p.category ?? 'Sem categoria'} · {p.quantity_sold}/{p.quantity} arrematados<br />Inicial {pts(p.start_price)} · incremento {pts(p.min_increment)}{(p.donor_name || p.donor_id) && <><br />Oferecido por {p.donor_name || d.pmap.get(p.donor_id)?.full_name}</>}</div>
            <div className="row wrap" style={{ gap: 6 }}><button className="btn sm primary" disabled={p.quantity_sold >= p.quantity} onClick={() => setAuc(p)}>Criar leilão</button><button className="btn sm" onClick={() => setEdit({ ...p, donor_id: p.donor_id ?? '' })}>Editar</button><button className="btn sm" disabled={used(p)} title={used(p) ? 'Já foi a leilão: fica no histórico' : ''} onClick={() => setDel(p)}>Excluir</button></div>
          </div></div>)}
      </div>}
      {edit && <FormModal title={edit.id ? 'Editar prêmio' : 'Novo prêmio'} initial={edit} fields={fields} onClose={() => setEdit(null)} onSave={save} />}
      {del && <Confirm title="Excluir prêmio" danger confirmLabel="Excluir" onClose={() => setDel(null)} onConfirm={() => q(sb.from('prizes').delete().eq('id', del.id))}><p>Excluir “{del.name}”? Leilões na fila deste prêmio também saem.</p></Confirm>}
      {auc && <AuctionForm ev={ev} d={d} initial={{ prize_id: auc.id }} onClose={() => setAuc(null)} />}
    </div>
  )
}

const DURATIONS = [['30', '30 segundos'], ['60', '1 minuto'], ['120', '2 minutos'], ['300', '5 minutos'], ['custom', 'Tempo personalizado']]
function AuctionForm({ ev, d, initial, onClose }) {
  const toast = useToast()
  const avail = d.prizes.filter((p) => p.quantity_sold < p.quantity || p.id === initial.prize_id)
  const pr = d.prizeMap.get(initial.prize_id)
  const dur = initial.duration_seconds ? (DURATIONS.some(([v]) => v === String(initial.duration_seconds)) ? String(initial.duration_seconds) : 'custom') : '60'
  const fields = [
    { name: 'prize_id', label: 'Prêmio', type: 'select', required: true, options: [{ value: '', label: 'Escolha…' }, ...avail.map((p) => ({ value: p.id, label: p.name }))] },
    { name: 'start_price', label: 'Lance inicial (pts)', type: 'number', min: 1, required: true, default: pr?.start_price ?? 10 }, { name: 'min_increment', label: 'Incremento mínimo (pts)', type: 'number', min: 1, required: true, default: pr?.min_increment ?? 5 },
    { name: 'mode', label: 'Como encerra', type: 'select', default: 'manual', options: [{ value: 'manual', label: 'Manual: o apresentador bate o martelo' }, { value: 'tempo', label: 'Automático: por cronômetro' }] },
    { name: 'dur', label: 'Duração', type: 'select', default: dur, options: DURATIONS.map(([value, label]) => ({ value, label })), when: (v) => v.mode === 'tempo' },
    { name: 'custom', label: 'Duração em segundos (10 a 3600)', type: 'number', min: 10, default: initial.duration_seconds ?? 90, when: (v) => v.mode === 'tempo' && v.dur === 'custom', hint: 'Lance nos 10 s finais devolve o relógio para 10 s.' }]
  const save = async (v) => {
    const duration_seconds = v.mode === 'tempo' ? (v.dur === 'custom' ? Number(v.custom) : Number(v.dur)) : null
    if (v.mode === 'tempo' && !(duration_seconds >= 10 && duration_seconds <= 3600)) throw new Error('Duração entre 10 e 3600 segundos.')
    const row = { prize_id: v.prize_id, start_price: v.start_price, min_increment: v.min_increment, mode: v.mode, duration_seconds }
    await q(initial.id ? sb.from('auctions').update(row).eq('id', initial.id) : sb.from('auctions').insert({ ...row, event_id: ev.id, position: d.auctions.length }))
    toast(initial.id ? 'Leilão atualizado.' : 'Leilão colocado na fila.', 'ok')
  }
  return <FormModal title={initial.id ? 'Editar leilão' : 'Novo leilão'} initial={{ ...initial, dur }} fields={fields} onSave={save} onClose={onClose} saveLabel={initial.id ? 'Salvar' : 'Colocar na fila'} />
}

/* ───────── Leilões ───────── */
export function Auctions({ ev, d }) {
  const toast = useToast()
  const [form, setForm] = useState(null); const [close, setClose] = useState(false); const [ask, setAsk] = useState(null)
  const act = (a, action, reason) => rpc('admin_auction_action', { p_auction: a.id, p_action: action, p_reason: reason ?? null })
  const queue = d.auctions.filter((a) => a.status === 'agendado')
  const past = d.auctions.filter((a) => ['encerrado', 'cancelado'].includes(a.status)).sort((a, b) => new Date(b.closed_at ?? b.created_at) - new Date(a.closed_at ?? a.created_at))
  const move = async (a, dir) => { const i = queue.indexOf(a), b = queue[i + dir]; if (!b) return; const reorder = queue.map((x) => x.id); [reorder[i], reorder[i + dir]] = [reorder[i + dir], reorder[i]]; for (const [pos, id] of reorder.entries()) await q(sb.from('auctions').update({ position: pos }).eq('id', id)) }
  const L = d.live; const lp = L && d.prizeMap.get(L.prize_id); const leader = L && d.pmap.get(L.current_bidder)
  const [bids] = useLive('bids', (t) => t.select('*').eq('auction_id', L?.id).eq('round', L?.round).eq('voided', false).order('id', { ascending: false }).limit(12), [L?.id, L?.round], { enabled: !!L })
  return (
    <div className="stack loose">
      <Head title="Leilões" sub="Um leilão por vez. Ao iniciar, o telão e os celulares mudam para a sala de lances."><button className="btn" onClick={() => window.open('#/telao', '_blank')}>Abrir telão</button><button className="btn primary" onClick={() => setForm({})} disabled={d.prizes.length === 0}>Novo leilão</button></Head>

      {L ? (
        <section className="console" aria-label="Leilão em andamento">
          <div className="row between"><span className={`chip ${L.status === 'aberto' ? 'live' : ''}`}>{L.status === 'aberto' ? 'Ao vivo' : 'Pausado'}</span><span className="muted small">{L.mode === 'tempo' ? 'Encerra sozinho no cronômetro' : 'Encerramento manual'}</span></div>
          <div className="big">
            <Photo src={lp?.photo_url} name={lp?.name} />
            <div className="stack tight"><h2 style={{ fontSize: '1.7rem' }}>{lp?.name}</h2>
              <div><span className="eyebrow">{L.current_bid ? 'Maior lance' : 'Lance inicial'}</span><div className="num coin" style={{ fontSize: '3.2rem', lineHeight: 1 }}>{pts(L.current_bid ?? L.start_price)}</div></div>
              {leader ? <div className="row"><Avatar p={leader} size={34} /><b>{leader.full_name}</b><span className="muted small">lidera · {L.participant_count} participantes · {L.bid_count} lances</span></div> : <span className="muted">Sem lances ainda.</span>}</div>
            <div style={{ textAlign: 'right' }}><div className="eyebrow">{L.mode === 'tempo' ? 'Tempo' : 'Estado'}</div><AuctionClock a={L} className="num" onZero={() => sb.rpc('close_expired_auctions')} /><style>{'.console .clock{font-size:2.6rem}'}</style></div>
          </div>
          <div className="row wrap">
            <button className="btn danger big" onClick={() => setClose(true)}>ENCERRAR LEILÃO</button>
            {L.status === 'aberto' ? <Act className="btn" onClick={() => act(L, 'pausar')}>Pausar</Act> : <Act className="btn primary" onClick={() => act(L, 'retomar')}>Retomar</Act>}
            <button className="btn" onClick={() => setAsk({ a: L, action: 'reiniciar', title: 'Reiniciar leilão', text: 'Zera os lances, devolve os pontos reservados e volta o leilão para a fila.' })}>Reiniciar</button>
            <button className="btn" onClick={() => setAsk({ a: L, action: 'cancelar', title: 'Cancelar leilão', text: 'Devolve os pontos reservados e cancela este leilão. O prêmio volta a ficar disponível.', danger: true })}>Cancelar</button>
          </div>
          {bids?.length > 0 && <div className="stack tight"><h3>Lances</h3><div className="bidfeed">{bids.map((b) => <div key={b.id} className="row between"><span className="row"><Avatar p={d.pmap.get(b.user_id)} size={24} />{d.pmap.get(b.user_id)?.full_name}</span><span><span className="muted small">+{pts(b.amount)} → </span><Coin n={b.total ?? b.amount} /> <span className="muted small">{new Date(b.created_at).toLocaleTimeString('pt-BR')}</span></span></div>)}</div></div>}
        </section>
      ) : <Empty>Nenhum leilão em andamento. Inicie o próximo da fila.</Empty>}

      <section className="stack"><h2>Fila</h2>
        {queue.length === 0 ? <p className="muted">Fila vazia. Crie leilões a partir dos prêmios.</p> : <div className="tablewrap"><table className="grid"><thead><tr><th>#</th><th>Prêmio</th><th className="r">Inicial</th><th className="r">Incremento</th><th>Encerramento</th><th /></tr></thead><tbody>
          {queue.map((a, i) => { const p = d.prizeMap.get(a.prize_id); return (
            <tr key={a.id}><td>{i + 1}</td><td><span className="row"><Photo src={p?.photo_url} name={p?.name} style={{ width: 44, flex: 'none' }} /><b>{p?.name}</b></span></td><td className="r">{pts(a.start_price)}</td><td className="r">{pts(a.min_increment)}</td><td>{a.mode === 'tempo' ? `Cronômetro de ${a.duration_seconds}s` : 'Manual'}</td>
              <td className="r"><span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                <Act className="btn sm primary" disabled={!!L || ev.status !== 'ativo'} title={ev.status !== 'ativo' ? 'Ative o evento primeiro' : L ? 'Encerre o leilão atual primeiro' : ''} onClick={async () => { await act(a, 'iniciar'); toast('Leilão no ar!', 'ok') }}>Iniciar</Act>
                <Act className="btn sm" disabled={i === 0} onClick={() => move(a, -1)} aria-label="Subir na fila">↑</Act><Act className="btn sm" disabled={i === queue.length - 1} onClick={() => move(a, 1)} aria-label="Descer na fila">↓</Act>
                <button className="btn sm" onClick={() => setForm(a)}>Editar</button><Act className="btn sm" onClick={() => q(sb.from('auctions').delete().eq('id', a.id))}>Excluir</Act></span></td></tr>) })}
        </tbody></table></div>}
      </section>

      <section className="stack"><h2>Histórico</h2>
        {past.length === 0 ? <p className="muted">Os leilões encerrados aparecem aqui.</p> : <div className="tablewrap"><table className="grid"><thead><tr><th>Prêmio</th><th>Resultado</th><th>Vencedor</th><th className="r">Lance final</th><th>Quando</th><th /></tr></thead><tbody>
          {past.map((a) => { const p = d.prizeMap.get(a.prize_id); const w = d.pmap.get(a.winner_id); const r = a.result ?? a.status; return (
            <tr key={a.id}><td><b>{p?.name}</b></td><td><span className={`chip ${r === 'arrematado' ? 'ok' : r === 'estornado' || r === 'cancelado' ? 'bad' : ''}`}>{STATUS[r]}</span></td>
              <td>{w ? <span className="row"><Avatar p={w} size={26} />{w.full_name}<Demo on={w.is_demo} /></span> : '—'}</td><td className="r">{a.final_price ? <Coin n={a.final_price} /> : '—'}</td><td>{dt(a.closed_at)}</td>
              <td className="r"><span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                {a.result === 'arrematado' && <><Act className={`btn sm ${a.delivered ? '' : 'primary'}`} onClick={() => act(a, 'entregar')}>{a.delivered ? 'Entregue ✓' : 'Marcar entregue'}</Act><button className="btn sm" onClick={() => setAsk({ a, action: 'estornar', title: 'Estornar arremate', text: `Devolve ${pts(a.final_price)} pts para ${w?.full_name} e libera o prêmio de novo.`, needReason: true, danger: true })}>Estornar</button></>}
                {(a.result === 'sem_lances' || (a.status === 'cancelado' && a.result !== 'estornado')) && <Act className="btn sm" onClick={() => act(a, 'reiniciar')}>Voltar para a fila</Act>}</span></td></tr>) })}
        </tbody></table></div>}
      </section>

      {form && <AuctionForm ev={ev} d={d} initial={form} onClose={() => setForm(null)} />}
      {ask && <Confirm title={ask.title} danger={ask.danger} needReason={ask.needReason} onClose={() => setAsk(null)} onConfirm={(reason) => act(ask.a, ask.action, reason)}><p>{ask.text}</p></Confirm>}
      {close && L && (
        <Modal title="Encerrar este leilão?" onClose={() => setClose(false)}>
          <div className="row"><Photo src={lp?.photo_url} name={lp?.name} style={{ width: 120, flex: 'none' }} /><div className="stack tight"><span className="eyebrow">Prêmio</span><h2>{lp?.name}</h2><span className="muted small">{L.participant_count} participantes · {L.bid_count} lances</span></div></div>
          {leader ? <div className="panel row"><Avatar p={leader} size={64} /><div className="grow"><span className="eyebrow">Vai levar</span><div><b style={{ fontSize: '1.2rem' }}>{leader.full_name}</b></div></div><Coin n={L.current_bid} className="" /></div>
            : <div className="panel"><b>Nenhum lance.</b> O prêmio será marcado como não arrematado.</div>}
          <p className="muted small">Se entrar um lance entre agora e a confirmação, vale o maior lance registrado no servidor no momento do encerramento.</p>
          <Act className="btn danger big block" onClick={async () => { await act(L, 'encerrar'); setClose(false) }}>Dou-lhe três! Confirmar encerramento</Act>
          <button className="btn block" onClick={() => setClose(false)}>Voltar</button>
        </Modal>
      )}
    </div>
  )
}

/* ───────── Relatórios ───────── */
const REPORTS = [['pontuacao', 'Pontuação por colaborador'], ['desempenho', 'Desempenho geral'], ['participacao', 'Participação nos quizzes'], ['extrato', 'Extrato de pontos'], ['lances', 'Histórico de lances'], ['premios', 'Prêmios arrematados e vencedores']]
export function Reports({ ev, d }) {
  const [type, setType] = useState('pontuacao'); const [f, setF] = useState({ user: '', quiz: '', prize: '', from: '', to: '' })
  const [ledger] = useLive('wallet_ledger', (t) => t.select('*').eq('event_id', ev.id).order('id', { ascending: false }).limit(5000), [ev.id])
  const [bids] = useLive('bids', (t) => t.select('*, auctions!inner(event_id, prize_id)').eq('auctions.event_id', ev.id).order('id', { ascending: false }).limit(5000), [ev.id])
  const name = (id) => d.pmap.get(id)?.full_name ?? '—'
  const inRange = (v) => (!f.from || new Date(v) >= new Date(f.from)) && (!f.to || new Date(v) <= new Date(f.to + 'T23:59:59'))
  const people = d.profiles.filter((p) => d.inEvent.has(p.id) && (!f.user || p.id === f.user))
  const qname = (id) => d.quizzes.find((z) => z.id === id)?.title ?? '—'
  let rows = []
  if (type === 'pontuacao') rows = people.map((p) => { const w = d.wmap.get(p.id) ?? {}; const s = d.smap.get(p.id) ?? {}; return { Colaborador: p.full_name, Setor: p.sector ?? '', Filial: p.branch ?? '', Conquistado: s.earned ?? 0, Disponível: (w.balance ?? 0) - (w.reserved ?? 0), Reservado: w.reserved ?? 0, 'Usado em prêmios': w.spent ?? 0 } }).sort((a, b) => b.Conquistado - a.Conquistado)
  if (type === 'desempenho') rows = people.map((p) => { const at = d.attempts.filter((a) => a.user_id === p.id && a.finished_at); const ok = at.reduce((s, a) => s + a.correct_count, 0), all = at.reduce((s, a) => s + a.correct_count + a.wrong_count, 0); const s = d.smap.get(p.id) ?? {}; return { Colaborador: p.full_name, Setor: p.sector ?? '', 'Quizzes respondidos': at.length, 'Aproveitamento': all ? Math.round((ok / all) * 100) + '%' : '—', Tarefas: d.completions.filter((c) => c.user_id === p.id).length, 'Pontos conquistados': s.earned ?? 0, Lances: (bids ?? []).filter((b) => b.user_id === p.id).length, 'Prêmios': s.prizes_won ?? 0 } }).sort((a, b) => b['Pontos conquistados'] - a['Pontos conquistados'])
  if (type === 'participacao') rows = d.attempts.filter((a) => (!f.user || a.user_id === f.user) && (!f.quiz || a.quiz_id === f.quiz) && inRange(a.started_at)).map((a) => ({ Quiz: qname(a.quiz_id), Colaborador: name(a.user_id), Início: dt(a.started_at), Conclusão: a.finished_at ? dt(a.finished_at) : 'Em andamento', Acertos: a.correct_count, Erros: a.wrong_count, Pontos: a.points_earned }))
  if (type === 'extrato') rows = (ledger ?? []).filter((l) => (!f.user || l.user_id === f.user) && inRange(l.created_at)).map((l) => ({ Quando: dt(l.created_at), Colaborador: name(l.user_id), Tipo: l.kind, Descrição: l.reason, Pontos: l.amount, 'Feito por': d.pmap.get(l.created_by)?.full_name ?? 'Sistema' }))
  if (type === 'lances') rows = (bids ?? []).filter((b) => (!f.user || b.user_id === f.user) && (!f.prize || b.auctions?.prize_id === f.prize) && inRange(b.created_at)).map((b) => ({ Quando: new Date(b.created_at).toLocaleString('pt-BR'), Prêmio: d.prizeMap.get(b.auctions?.prize_id)?.name ?? '—', Colaborador: name(b.user_id), 'Valor somado': b.amount, 'Total da pessoa': b.total ?? b.amount, Situação: b.voided ? 'Anulado (leilão reiniciado/cancelado)' : 'Válido' }))
  if (type === 'premios') rows = d.auctions.filter((a) => a.status === 'encerrado' && (!f.prize || a.prize_id === f.prize) && (!f.user || a.winner_id === f.user) && inRange(a.closed_at)).map((a) => { const p = d.prizeMap.get(a.prize_id); return { Prêmio: p?.name, 'Oferecido por': p?.donor_name || name(p?.donor_id), Resultado: STATUS[a.result], Vencedor: a.winner_id ? name(a.winner_id) : '—', 'Lance final': a.final_price ?? '', Lances: a.bid_count, Participantes: a.participant_count, Encerrado: dt(a.closed_at), Entregue: a.result === 'arrematado' ? (a.delivered ? 'Sim' : 'Não') : '' } })
  const cols = rows.length ? Object.keys(rows[0]) : []
  const uses = { user: true, quiz: type === 'participacao', prize: ['lances', 'premios'].includes(type), period: !['pontuacao', 'desempenho'].includes(type) }
  const title = REPORTS.find(([k]) => k === type)[1]
  return (
    <div className="stack">
      <Head title="Relatórios" sub={`${title} · ${ev.name}`}><button className="btn" onClick={() => window.print()}>Imprimir / salvar PDF</button><button className="btn primary" onClick={() => exportXlsx(`${type}-${ev.name}`, rows)}>Exportar Excel</button></Head>
      <div className="row wrap noprint">
        <select className="input" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Relatório">{REPORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {uses.user && <select className="input" style={{ width: 'auto' }} value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })} aria-label="Colaborador"><option value="">Todos os colaboradores</option>{d.profiles.filter((p) => d.inEvent.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>}
        {uses.quiz && <select className="input" style={{ width: 'auto' }} value={f.quiz} onChange={(e) => setF({ ...f, quiz: e.target.value })} aria-label="Quiz"><option value="">Todos os quizzes</option>{d.quizzes.map((z) => <option key={z.id} value={z.id}>{z.title}</option>)}</select>}
        {uses.prize && <select className="input" style={{ width: 'auto' }} value={f.prize} onChange={(e) => setF({ ...f, prize: e.target.value })} aria-label="Prêmio"><option value="">Todos os prêmios</option>{d.prizes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        {uses.period && <><input className="input" style={{ width: 'auto' }} type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="De" /><input className="input" style={{ width: 'auto' }} type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="Até" /></>}
      </div>
      {rows.length === 0 ? <Empty>Sem dados para este filtro.</Empty> : <div className="tablewrap"><table className="grid"><thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.slice(0, 500).map((r, i) => <tr key={i}>{cols.map((c) => <td key={c}>{typeof r[c] === 'number' ? pts(r[c]) : r[c]}</td>)}</tr>)}</tbody></table>{rows.length > 500 && <p className="muted small">Mostrando 500 de {rows.length}. O Excel traz tudo.</p>}</div>}
    </div>
  )
}
