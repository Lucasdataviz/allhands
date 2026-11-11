import { useEffect, useState } from 'react'
import { fn, go, rpc, sb, syncClock, toEmail, uploadPhoto, useOnline, useRoute } from './lib'
import { Act, Avatar, Loading, Toasts, useToast } from './ui'
import Colab from './Colab.jsx'
import Admin from './Admin.jsx'
import Telao from './Telao.jsx'

export const Wordmark = ({ logo }) => (logo ? <img className="logo" src={logo} alt="Logotipo" /> : <div className="wordmark">All<b>Hands</b><i>.</i></div>)

function Shell() {
  const route = useRoute()
  const online = useOnline()
  const [session, setSession] = useState(undefined)
  const [me, setMe] = useState(undefined)
  const [hasAdmin, setHasAdmin] = useState(null)
  const [event, setEvent] = useState(undefined)

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    syncClock(); const i = setInterval(syncClock, 60000)
    return () => { sub.subscription.unsubscribe(); clearInterval(i) }
  }, [])
  const uid = session?.user?.id
  const loadMe = async () => {
    if (!uid) { setMe(null); return }
    const { data } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle()
    setMe(data ?? null)
  }
  const loadEvent = async () => {
    const { data } = await sb.from('events').select('*').eq('status', 'ativo').maybeSingle()
    setEvent(data ?? null)
  }
  useEffect(() => {
    if (session === undefined) return
    if (!uid) { setMe(null); const probe = () => sb.rpc('has_admin').then(({ data, error }) => setHasAdmin(error ? 'erro' : data === true)); setHasAdmin(null); probe(); return }
    loadMe(); loadEvent()
    const ch = sb.channel('shell').on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, loadEvent)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` }, loadMe).subscribe()
    return () => { sb.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, session === undefined])

  let view
  if (session === undefined || (uid && (me === undefined || event === undefined))) view = <Loading />
  else if (!uid) view = hasAdmin === null ? <Loading /> : hasAdmin === 'erro' ? <NoServer /> : hasAdmin ? <Login /> : <Setup />
  else if (!me) view = <Blocked text="Sua conta não tem cadastro nesta plataforma. Procure o administrador." />
  else if (!me.active) view = <Blocked text="Sua conta está desativada. Procure o administrador." />
  else if (me.must_change_password) view = <FirstAccess me={me} onDone={loadMe} />
  else if (me.role === 'telao' || (me.role === 'admin' && route.startsWith('telao'))) view = <Telao me={me} />
  else if (me.role === 'admin') view = <Admin me={me} activeEvent={event} />
  else view = <Colab me={me} event={event} reloadMe={loadMe} />

  return <>{view}{!online && <div className="offline" role="alert">Sem conexão. Tentando reconectar…</div>}</>
}
export default function App() { return <Toasts><Shell /></Toasts> }

export const logout = async () => { await sb.auth.signOut(); go('') }

function NoServer() {
  return <div className="auth"><div className="auth-card"><Wordmark /><h1>Sem acesso ao servidor</h1>
    <p className="muted">Esta página não conseguiu falar com o servidor do All Hands. Isso acontece quando o arquivo é aberto em uma pré-visualização (como a do chat) ou em uma rede que bloqueia o acesso.</p>
    <p className="muted">Abra o endereço publicado do site, ou baixe o arquivo e abra no Chrome ou Edge.</p>
    <button className="btn primary" onClick={() => window.location.reload()}>Tentar de novo</button></div></div>
}

function Blocked({ text }) {
  return <div className="auth"><div className="auth-card"><Wordmark /><p>{text}</p><button className="btn" onClick={logout}>Sair</button></div></div>
}

function Login() {
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [err, setErr] = useState('')
  const submit = async (e) => {
    e?.preventDefault(); setErr('')
    if (!u.trim() || !p) { setErr('Informe usuário e senha.'); return }
    const { error } = await sb.auth.signInWithPassword({ email: toEmail(u), password: p })
    if (error) setErr(/invalid/i.test(error.message) ? 'Usuário ou senha incorretos.' : 'Não foi possível entrar. Verifique a conexão.')
  }
  return (
    <div className="auth"><form className="auth-card" onSubmit={(e) => e.preventDefault()}>
      <Wordmark />
      <div className="stack tight"><h1>Entre para jogar</h1><p className="muted">Quizzes, pontos e leilões do All Hands.</p></div>
      <label className="field"><span>Usuário</span><input className="input" autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="nome.sobrenome" value={u} onChange={(e) => setU(e.target.value)} /></label>
      <label className="field"><span>Senha</span><input className="input" type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} /></label>
      {err && <p className="err" role="alert">{err}</p>}
      <Act className="btn primary big block" type="submit" onClick={submit}>Entrar</Act>
      <p className="muted small">Esqueceu a senha? Peça ao administrador para redefinir.</p>
    </form></div>
  )
}

// Aparece uma única vez: quando ainda não existe nenhum administrador.
function Setup() {
  const [v, setV] = useState({ full_name: '', username: '', password: '' }); const [err, setErr] = useState('')
  const submit = async () => {
    setErr('')
    try {
      const r = await fn({ action: 'bootstrap', ...v })
      await sb.auth.signInWithPassword({ email: toEmail(r.user.username), password: v.password })
    } catch (e) { setErr(e.message) }
  }
  return (
    <div className="auth"><div className="auth-card">
      <Wordmark />
      <div className="stack tight"><h1>Primeira configuração</h1><p className="muted">Crie a conta do administrador principal. Esta tela some depois disso.</p></div>
      <label className="field"><span>Nome completo</span><input className="input" value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} /></label>
      <label className="field"><span>Usuário</span><input className="input" autoCapitalize="none" placeholder="nome.sobrenome" value={v.username} onChange={(e) => setV({ ...v, username: e.target.value })} /></label>
      <label className="field"><span>Senha (mínimo 8 caracteres)</span><input className="input" type="password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} /></label>
      {err && <p className="err" role="alert">{err}</p>}
      <Act className="btn primary big block" onClick={submit}>Criar administrador</Act>
    </div></div>
  )
}

export async function changePassword(p1, p2) {
  if (p1.length < 8) throw new Error('A nova senha precisa ter ao menos 8 caracteres.')
  if (p1 === 'Mudar@123') throw new Error('Escolha uma senha diferente da senha padrão.')
  if (p1 !== p2) throw new Error('As senhas não conferem.')
  const { error } = await sb.auth.updateUser({ password: p1 })
  if (error) throw new Error(/different/i.test(error.message) ? 'Escolha uma senha diferente da atual.' : error.message)
  await rpc('my_password_changed')
}

function FirstAccess({ me, onDone }) {
  const toast = useToast()
  const [p1, setP1] = useState(''); const [p2, setP2] = useState(''); const [photo, setPhoto] = useState(me.photo_url); const [busy, setBusy] = useState(false)
  const pick = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    setBusy(true)
    try { const url = await uploadPhoto(f, `perfis/${me.id}`); await rpc('set_my_photo', { p_url: url }); setPhoto(url) } catch (err) { toast(err.message, 'bad') } finally { setBusy(false) }
  }
  return (
    <div className="auth"><div className="auth-card">
      <Wordmark />
      <div className="stack tight"><h1>Olá, {me.full_name.split(' ')[0]}!</h1><p className="muted">No primeiro acesso você cria a sua senha. A foto é opcional, mas deixa o ranking e o telão mais divertidos.</p></div>
      <div className="row">
        <Avatar p={{ ...me, photo_url: photo }} size={76} />
        <label className="btn sm">{busy ? 'Enviando…' : photo ? 'Trocar foto' : 'Enviar foto'}<input type="file" accept="image/*" hidden onChange={pick} disabled={busy} /></label>
      </div>
      <label className="field"><span>Nova senha</span><input className="input" type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} /></label>
      <label className="field"><span>Repita a nova senha</span><input className="input" type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} /></label>
      <Act className="btn primary big block" onClick={async () => { await changePassword(p1, p2); toast('Senha criada. Bem-vindo!', 'ok'); onDone() }}>Salvar e entrar</Act>
      <button className="btn ghost" onClick={logout}>Sair</button>
    </div></div>
  )
}
