import { getApiBaseUrl } from './config'
import type {
  AddDocumentsFromErpResponse,
  ErpSource,
  FullConsolidationFromErpResponse,
  RemoveDocumentsFromErpResponse,
} from './types'

export type ApiErrorPayload = {
  statusCode?: number
  message?: string | string[]
  code?: string
}

export class ConsolidationRequestError extends Error {
  readonly payload: ApiErrorPayload | undefined

  constructor(message: string, payload?: ApiErrorPayload) {
    super(message)
    this.name = 'ConsolidationRequestError'
    this.payload = payload
  }
}

async function readApiError(
  response: Response,
  fallback: string,
): Promise<never> {
  let message = fallback
  let payload: ApiErrorPayload | undefined
  try {
    const text = await response.text()
    if (text) {
      try {
        const parsed = JSON.parse(text) as ApiErrorPayload
        payload = parsed
        if (Array.isArray(parsed.message)) {
          message = parsed.message.join(', ')
        } else if (typeof parsed.message === 'string') {
          message = parsed.message
        } else {
          message = text
        }
      } catch {
        message = text
      }
    }
  } catch {
    /* ignore */
  }

  if (response.status === 401) {
    throw new ConsolidationRequestError(
      'Sesión vencida o inválida. Volvé a iniciar sesión.',
      payload,
    )
  }
  throw new ConsolidationRequestError(message, payload)
}

export async function addDocumentsFromErpRequest(
  token: string,
  erpSource: ErpSource,
  baseFile: File,
  erpFile: File,
): Promise<AddDocumentsFromErpResponse> {
  const formData = new FormData()
  formData.append('erpSource', erpSource)
  formData.append('baseFile', baseFile)
  formData.append('erpFile', erpFile)

  const response = await fetch(
    `${getApiBaseUrl()}/consolidations/add-documents-from-erp`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    },
  )
  if (!response.ok) {
    await readApiError(response, 'No se pudieron agregar documentos desde el ERP')
  }
  return (await response.json()) as AddDocumentsFromErpResponse
}

export async function removeDocumentsFromErpRequest(
  token: string,
  erpSource: ErpSource,
  fechaCorteEliminacion: string,
  baseFile: File,
  erpFile: File,
): Promise<RemoveDocumentsFromErpResponse> {
  const formData = new FormData()
  formData.append('erpSource', erpSource)
  formData.append('fechaCorteEliminacion', fechaCorteEliminacion)
  formData.append('baseFile', baseFile)
  formData.append('erpFile', erpFile)

  const response = await fetch(
    `${getApiBaseUrl()}/consolidations/remove-documents-from-erp`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    },
  )
  if (!response.ok) {
    await readApiError(
      response,
      'No se pudieron eliminar documentos según el listado ERP',
    )
  }
  return (await response.json()) as RemoveDocumentsFromErpResponse
}

export async function fullConsolidationFromErpRequest(
  token: string,
  erpSource: ErpSource,
  fechaCorteEliminacion: string,
  baseFile: File,
  erpFile: File,
): Promise<FullConsolidationFromErpResponse> {
  const formData = new FormData()
  formData.append('erpSource', erpSource)
  formData.append('fechaCorteEliminacion', fechaCorteEliminacion)
  formData.append('baseFile', baseFile)
  formData.append('erpFile', erpFile)

  const response = await fetch(
    `${getApiBaseUrl()}/consolidations/full-consolidation-from-erp`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    },
  )
  if (!response.ok) {
    await readApiError(
      response,
      'No se pudo completar la consolidación (agregar y eliminar)',
    )
  }
  return (await response.json()) as FullConsolidationFromErpResponse
}

export async function downloadCurrentExcel(
  token: string,
  erpSource: ErpSource,
): Promise<Blob> {
  const bust = Date.now()
  const response = await fetch(
    `${getApiBaseUrl()}/exports/${erpSource}/current.xlsx?t=${bust}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    },
  )
  if (!response.ok) {
    await readApiError(response, 'No se pudo descargar el Excel actual')
  }
  return response.blob()
}

export async function downloadBackupExcel(
  token: string,
  erpSource: ErpSource,
): Promise<Blob> {
  const bust = Date.now()
  const response = await fetch(
    `${getApiBaseUrl()}/exports/${erpSource}/backup.xlsx?t=${bust}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    },
  )
  if (!response.ok) {
    await readApiError(response, 'No se pudo descargar el backup')
  }
  return response.blob()
}
