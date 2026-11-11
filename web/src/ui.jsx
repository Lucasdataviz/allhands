import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { initials, pts, uploadPhoto, useTick } from './lib'

export function Avatar({ p, size = 40 }) {
  const style = { width: size, height: size, fontSize: size * 0.38 }
  return <span className="avatar" style={style} aria-hidden="true">{p?.photo_url ? <img src={p.photo_url} alt="" /> : initials(p?.full_name)}</span>
}
export const Coin = ({ n, className = '' }) => <span className={`num coin ${className}`}>{pts(n)}<small>pts</small></span>
export const Photo = ({ src, name, className = '', style }) => (
  <div className={`photo ${className}`} style={style}>{src ? <img src={src} alt={name ?? ''} /> : initials(name)}</div>
)
export const Demo = ({ on }) => (on ? <span className="chip demo" title="Dado fictício de demonstração">DEMO</span> : null)
export const Loading = () => <p className="muted" style={{ padding: 24, textAlign: 'center' }}>Carregando…</p>
export const Empty = ({ children }) => <div className="empty">{children}</div>

// Avisos rápidos no topo da tela.
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)
export function Toasts({ children }) {
  const [items, set] = useState([])
  const push = useCallback((text, kind = '') => {
    const id = Math.random()
    set((x) => [...x.slice(-2), { id, text, kind }])
    setTimeout(() => set((x) => x.filter((t) => t.id !== id)), 3800)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">{items.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}</div>
    </ToastCtx.Provider>
  )
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal stack ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between"><h2>{title}</h2>{onClose && <button className="btn ghost sm" onClick={onClose} aria-label="Fechar">Fechar</button>}</div>
        {children}
      </div>
    </div>
  )
}

// Botão que mostra "aguarde" e nunca dispara duas vezes.
export function Act({ onClick, children, className = 'btn', ...rest }) {
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const run = async (e) => {
    if (busy) return
    setBusy(true)
    try { await onClick(e) } catch (err) { toast(err.message || 'Algo deu errado.', 'bad') } finally { setBusy(false) }
  }
  return <button className={className} onClick={run} disabled={busy || rest.disabled} {...rest}>{busy ? 'Aguarde…' : children}</button>
}

export function Confirm({ title, children, confirmLabel = 'Confirmar', danger, onConfirm, onClose, needReason }) {
  const [reason, setReason] = useState('')
  return (
    <Modal title={title} onClose={onClose}>
      {children}
      {needReason && <label className="field"><span>Motivo (obrigatório)</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></label>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Voltar</button>
        <Act className={`btn ${danger ? 'danger' : 'primary'}`} disabled={needReason && !reason.trim()} onClick={async () => { await onConfirm(reason.trim()); onClose() }}>{confirmLabel}</Act>
      </div>
    </Modal>
  )
}

export function ImageInput({ value, onChange, folder, label = 'Foto' }) {
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const ref = useRef()
  const pick = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    setBusy(true)
    try { onChange(await uploadPhoto(f, folder)) } catch (err) { toast(err.message, 'bad') } finally { setBusy(false); e.target.value = '' }
  }
  return (
    <div className="field"><span>{label}</span>
      <div className="row">
        <Photo src={value} name="?" style={{ width: 92, aspectRatio: '1', flex: 'none' }} />
        <div className="stack tight">
          <button type="button" className="btn sm" onClick={() => ref.current.click()} disabled={busy}>{busy ? 'Enviando…' : value ? 'Trocar foto' : 'Enviar foto'}</button>
          {value && <button type="button" className="btn ghost sm" onClick={() => onChange(null)}>Remover</button>}
          <span className="muted small">JPG, PNG ou WebP, até 10 MB.</span>
        </div>
        <input ref={ref} type="file" accept="image/*" hidden onChange={pick} />
      </div>
    </div>
  )
}

// Formulário genérico para os cadastros do admin.
export function FormModal({ title, fields, initial, onSave, onClose, saveLabel = 'Salvar' }) {
  const [v, setV] = useState(() => ({ ...Object.fromEntries(fields.map((f) => [f.name, f.default ?? (f.type === 'checkbox' ? false : '')])), ...initial }))
  const [err, setErr] = useState('')
  const set = (k, val) => setV((x) => ({ ...x, [k]: val }))
  const submit = async () => {
    setErr('')
    const out = {}
    for (const f of fields) {
      if (f.when && !f.when(v)) { out[f.name] = f.type === 'number' ? null : v[f.name] || null; continue }
      let val = v[f.name]
      if (f.type === 'number') val = val === '' || val == null ? null : Number(val)
      if (f.type === 'datetime') val = val ? new Date(val).toISOString() : null
      if (typeof val === 'string') val = val.trim() || null
      if (f.required && (val == null || val === '')) throw new Error(`Preencha "${f.label}".`)
      if (f.type === 'number' && val != null && f.min != null && val < f.min) throw new Error(`"${f.label}" deve ser no mínimo ${f.min}.`)
      out[f.name] = val
    }
    await onSave(out)
    onClose()
  }
  const toLocal = (iso) => { if (!iso) return ''; const d = new Date(iso); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
  return (
    <Modal title={title} onClose={onClose}>
      {fields.filter((f) => !f.when || f.when(v)).map((f) => {
        if (f.type === 'image') return <ImageInput key={f.name} label={f.label} folder={f.folder} value={v[f.name] || null} onChange={(u) => set(f.name, u)} />
        if (f.type === 'checkbox') return <label key={f.name} className="check"><input type="checkbox" checked={!!v[f.name]} onChange={(e) => set(f.name, e.target.checked)} />{f.label}</label>
        return (
          <label key={f.name} className="field"><span>{f.label}{f.required ? ' *' : ''}</span>
            {f.type === 'textarea' ? <textarea className="input" value={v[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)} />
              : f.type === 'select' ? <select className="input" value={v[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)}>{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              : f.type === 'datetime' ? <input className="input" type="datetime-local" value={toLocal(v[f.name])} onChange={(e) => set(f.name, e.target.value)} />
              : <input className="input" type={f.type || 'text'} inputMode={f.type === 'number' ? 'numeric' : undefined} min={f.min} value={v[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)} />}
            {f.hint && <span className="muted small" style={{ fontWeight: 400 }}>{f.hint}</span>}
          </label>
        )
      })}
      {err && <p className="err">{err}</p>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Cancelar</button>
        <Act className="btn primary" onClick={() => submit().catch((e) => { setErr(e.message); })}>{saveLabel}</Act>
      </div>
    </Modal>
  )
}

export const clockText = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
// Cronômetro do leilão; ao zerar pede ao servidor para fechar (quem decide é o servidor).
export function AuctionClock({ a, className = '', onZero }) {
  const now = useTick(200)
  const fired = useRef(null)
  if (a.mode !== 'tempo') return <span className={`clock ${className}`}>{a.status === 'pausado' ? 'Pausado' : 'Ao vivo'}</span>
  const left = a.status === 'pausado' ? Number(a.remaining_seconds) * 1000 : new Date(a.ends_at).getTime() - now
  if (a.status === 'aberto' && left <= 0 && fired.current !== a.ends_at) { fired.current = a.ends_at; setTimeout(() => onZero?.(), 0) }
  return <span className={`clock ${className} ${left <= 10000 && a.status === 'aberto' ? 'low' : ''}`}>{clockText(left)}</span>
}
