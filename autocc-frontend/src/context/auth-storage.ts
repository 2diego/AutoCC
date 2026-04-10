import type { AuthUser } from '../api/types'

const STORAGE_KEY = 'autocc_auth_v1'

type StoredAuth = {
  token: string
  user: AuthUser
}

export function readStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredAuth
    if (
      typeof parsed?.token === 'string' &&
      parsed.user &&
      typeof parsed.user.id === 'number'
    ) {
      return parsed
    }
  } catch {
    /* ignore */
  }
  return null
}

export function writeStoredAuth(data: StoredAuth | null) {
  if (!data) {
    localStorage.removeItem(STORAGE_KEY)
    return
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function loadInitialAuth(): {
  token: string | null
  user: AuthUser | null
} {
  if (typeof window === 'undefined') {
    return { token: null, user: null }
  }
  const s = readStoredAuth()
  return { token: s?.token ?? null, user: s?.user ?? null }
}
