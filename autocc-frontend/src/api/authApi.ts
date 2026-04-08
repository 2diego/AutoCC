import { getApiBaseUrl } from './config'
import type { LoginResponse } from './types'

export async function loginRequest(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) {
    throw new Error('Credenciales inválidas o usuario inexistente')
  }
  return (await response.json()) as LoginResponse
}

export async function bootstrapAdminRequest(body: {
  name: string
  email: string
  password: string
}): Promise<LoginResponse> {
  const response = await fetch(`${getApiBaseUrl()}/auth/bootstrap-admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      text ||
        'No se pudo crear el administrador inicial (si ya existe un usuario, iniciá sesión).',
    )
  }
  return (await response.json()) as LoginResponse
}
