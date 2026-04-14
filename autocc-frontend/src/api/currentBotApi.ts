import { getApiBaseUrl } from './config'
import type {
  BotCurrentDocument,
  BotDeudasSinObservacionesResponse,
  ErpSource,
} from './types'

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

export async function fetchBotPendientes(
  token: string,
  erpSource: ErpSource,
  opts: { clienteId?: string; q?: string },
): Promise<BotCurrentDocument[]> {
  const params = new URLSearchParams()
  if (opts.clienteId?.trim()) params.set('clienteId', opts.clienteId.trim())
  if (opts.q?.trim()) params.set('q', opts.q.trim())
  const qs = params.toString()
  const url = `${getApiBaseUrl()}/current/${erpSource}/bot/pendientes${qs ? `?${qs}` : ''}`
  const res = await fetch(url, { headers: authHeaders(token) })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Error ${res.status} al cargar pendientes`)
  }
  return (await res.json()) as BotCurrentDocument[]
}

export async function fetchBotDeudasSinObservaciones(
  token: string,
  erpSource: ErpSource,
  minAtrasoDias: number,
): Promise<BotDeudasSinObservacionesResponse> {
  const params = new URLSearchParams()
  params.set('minAtrasoDias', String(minAtrasoDias))
  const url = `${getApiBaseUrl()}/current/${erpSource}/bot/deudas-sin-observaciones?${params}`
  const res = await fetch(url, { headers: authHeaders(token) })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Error ${res.status} al cargar deudas`)
  }
  return (await res.json()) as BotDeudasSinObservacionesResponse
}

export async function patchDocumentObservaciones(
  token: string,
  erpSource: ErpSource,
  documentKey: string,
  observaciones: string,
  changedByUserId?: number,
): Promise<void> {
  const enc = encodeURIComponent(documentKey)
  const url = `${getApiBaseUrl()}/current/${erpSource}/documents/${enc}/notes`
  const body: { observaciones: string; changedByUserId?: number } = {
    observaciones,
  }
  if (changedByUserId != null) body.changedByUserId = changedByUserId
  const res = await fetch(url, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Error ${res.status} al guardar observación`)
  }
}
