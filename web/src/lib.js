import { createClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'

const URL = 'https://okttsqsvbltnunvnzksw.supabase.co'
// Chave pública (anon): pode ficar no navegador. Quem protege os dados são as permissões do banco.
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rdHRzcXN2Ymx0bnVudm56a3N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0MDIzMjQsImV4cCI6MjEwOTk3ODMyNH0.s3ywO8AH4A4i2ShjI6V05B4FQASnH_BRvWNKgPHzQFc'
export const sb = createClient(URL, KEY, { realtime: { params: { eventsPerSecond: 20 } } })
export const VERSION = 'v3 · 11/11 15h30'
export const DOMAIN = 'allhands.local'
export const toEmail = (u) => `${String(u).trim().toLowerCase()}@${DOMAIN}`

export const pts = (n) => new Intl.NumberFormat('pt-BR').format(n ?? 0)
export const initials = (name = '') => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
export const firstName = (name = '') => name.trim().split(/\s+/)[0] ?? ''
export const dt = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
export const dOnly = (v) => (v ? new Date(v + (String(v).length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '—')

// RPC que lança erro com a mensagem em português vinda do banco.
export async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args)
  if (error) throw new Error(error.message)
  return data
}
export async function q(builder) {
  const { data, error } = await builder
  if (error) throw new Error(error.message)
  return data
}
export async function fn(body) {
  const { data, error } = await sb.functions.invoke('admin-users', { body })
  if (error) {
    let msg = error.message
    try { const j = await error.context.json(); if (j?.error) msg = j.error } catch { /* resposta sem corpo */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

// Rota por hash: funciona em qualquer endereço onde o arquivo for servido.
export function useRoute() {
  const [r, setR] = useState(() => window.location.hash.replace(/^#\/?/, ''))
  useEffect(() => {
    const h = () => setR(window.location.hash.replace(/^#\/?/, ''))
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])
  return r
}
export const go = (path) => { window.location.hash = '/' + path }

// Relógio do servidor: o cronômetro nunca depende do relógio do celular.
let offset = 0
export async function syncClock() {
  const t0 = Date.now()
  const { data } = await sb.rpc('server_now')
  if (data) offset = new Date(data).getTime() - (t0 + Date.now()) / 2
}
export const serverNow = () => Date.now() + offset
export function useTick(ms = 250) {
  const [, set] = useState(0)
  useEffect(() => { const i = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(i) }, [ms])
  return serverNow()
}

// Consulta + tempo real: recarrega quando a tabela muda, ao reconectar e ao voltar para a aba.
let chSeq = 0
export function useLive(table, build, deps = [], { enabled = true, also = [] } = {}) {
  const [rows, setRows] = useState(null)
  const buildRef = useRef(build); buildRef.current = build
  const load = useCallback(async () => {
    const { data, error } = await buildRef.current(sb.from(table))
    if (!error) setRows(data ?? [])
  }, [table])
  useEffect(() => {
    if (!enabled) { setRows(null); return }
    let timer
    const soon = () => { clearTimeout(timer); timer = setTimeout(load, 60) }
    load()
    let ch = sb.channel(`live-${table}-${++chSeq}`)
    for (const t of [table, ...also]) ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, soon)
    ch.subscribe((s) => { if (s === 'SUBSCRIBED') soon() })
    const vis = () => document.visibilityState === 'visible' && soon()
    document.addEventListener('visibilitychange', vis); window.addEventListener('online', soon)
    return () => { clearTimeout(timer); sb.removeChannel(ch); document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', soon) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, enabled, load, ...deps])
  return [rows, load]
}

export function useOnline() {
  const [on, set] = useState(navigator.onLine)
  useEffect(() => {
    const a = () => set(true), b = () => set(false)
    window.addEventListener('online', a); window.addEventListener('offline', b)
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b) }
  }, [])
  return on
}

// Reduz a foto no próprio aparelho antes de enviar (máx. 1200 px, JPEG).
export async function shrinkImage(file, max = 1200) {
  if (file.size > 10 * 1024 * 1024) throw new Error('A imagem passa de 10 MB.')
  const bmp = await createImageBitmap(file).catch(() => null)
  if (!bmp) throw new Error('Não foi possível ler a imagem. Use JPG, PNG ou WebP.')
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.86))
}
export async function uploadPhoto(file, folder) {
  const blob = await shrinkImage(file)
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  const { error } = await sb.storage.from('fotos').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
  if (error) throw new Error(error.message)
  return sb.storage.from('fotos').getPublicUrl(path).data.publicUrl
}

export const rankSort = (a, b) => b.earned - a.earned || new Date(a.reached_at) - new Date(b.reached_at)
export const STATUS = {
  agendado: 'Na fila', aberto: 'Ao vivo', pausado: 'Pausado', encerrado: 'Encerrado', cancelado: 'Cancelado',
  disponivel: 'Disponível', em_leilao: 'Em leilão', arrematado: 'Arrematado', nao_arrematado: 'Não arrematado',
  rascunho: 'Rascunho', publicado: 'Publicado', ativo: 'Ativo', finalizado: 'Finalizado', sem_lances: 'Sem lances', estornado: 'Estornado',
}
