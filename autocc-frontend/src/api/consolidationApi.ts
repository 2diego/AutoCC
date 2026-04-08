import { getApiBaseUrl } from './config'
import type { ConsolidationResponse, ErpSource } from './types'

async function readApiError(response: Response, fallback: string): Promise<never> {
  let message = fallback
  try {
    const text = await response.text()
    if (text) {
      try {
        const parsed = JSON.parse(text) as { message?: string | string[] }
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
    throw new Error('Sesión vencida o inválida. Volvé a iniciar sesión.')
  }
  throw new Error(message)
}

export async function runConsolidationRequest(
  token: string,
  erpSource: ErpSource,
  baseFile: File,
  erpFile: File,
): Promise<ConsolidationResponse> {
  const formData = new FormData()
  formData.append('erpSource', erpSource)
  formData.append('baseFile', baseFile)
  formData.append('erpFile', erpFile)

  const response = await fetch(`${getApiBaseUrl()}/consolidations/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  if (!response.ok) {
    await readApiError(response, 'No se pudo ejecutar la consolidación')
  }
  return (await response.json()) as ConsolidationResponse
}

export async function downloadCurrentExcel(
  token: string,
  erpSource: ErpSource,
): Promise<Blob> {
  const response = await fetch(
    `${getApiBaseUrl()}/exports/${erpSource}/current.xlsx`,
    {
      headers: { Authorization: `Bearer ${token}` },
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
  const response = await fetch(
    `${getApiBaseUrl()}/exports/${erpSource}/backup.xlsx`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  )
  if (!response.ok) {
    await readApiError(response, 'No se pudo descargar el backup')
  }
  return response.blob()
}
