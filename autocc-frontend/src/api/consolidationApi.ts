import { getApiBaseUrl } from './config'
import type {
  AddDocumentsFromErpResponse,
  ErpSource,
  RemoveDocumentsWithMatrixResponse,
} from './types'

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

export async function removeDocumentsWithMatrixRequest(
  token: string,
  erpSource: ErpSource,
  baseFile: File,
  matrixFile: File,
): Promise<RemoveDocumentsWithMatrixResponse> {
  const formData = new FormData()
  formData.append('erpSource', erpSource)
  formData.append('baseFile', baseFile)
  formData.append('matrixFile', matrixFile)

  const response = await fetch(
    `${getApiBaseUrl()}/consolidations/remove-documents-with-matrix`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    },
  )
  if (!response.ok) {
    await readApiError(
      response,
      'No se pudieron eliminar documentos según la casa matriz',
    )
  }
  return (await response.json()) as RemoveDocumentsWithMatrixResponse
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
