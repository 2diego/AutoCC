import { getApiBaseUrl } from './config'
import type { ErpSource, FacturasSamsengResponse } from './types'
import {
  ConsolidationRequestError,
  type ApiErrorPayload,
} from './consolidationApi'

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

export async function facturasSamsengRequest(
  token: string,
  erpSource: ErpSource,
  casaCentralFile: File,
  planillaFacturasFile: File,
): Promise<FacturasSamsengResponse> {
  const formData = new FormData()
  formData.append('erpSource', erpSource)
  formData.append('casaCentralFile', casaCentralFile)
  formData.append('planillaFacturasFile', planillaFacturasFile)

  const response = await fetch(
    `${getApiBaseUrl()}/rendicion-cc/facturas-samseng`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    },
  )
  if (!response.ok) {
    await readApiError(
      response,
      'No se pudo completar la rendición de facturas Samseng',
    )
  }
  return (await response.json()) as FacturasSamsengResponse
}

export function downloadBase64File(
  base64: string,
  fileName: string,
  mimeType: string,
) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  const blob = new Blob([bytes], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
