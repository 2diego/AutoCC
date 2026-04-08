import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { bootstrapAdminRequest, loginRequest } from '../api/authApi'
import type { AuthUser } from '../api/types'
import { AuthContext, type AuthContextValue } from './auth-context'
import { loadInitialAuth, writeStoredAuth } from './auth-storage'

type AuthState = {
  token: string | null
  user: AuthUser | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(() => loadInitialAuth())

  const login = useCallback(async (email: string, password: string) => {
    const data = await loginRequest(email, password)
    const next = { token: data.accessToken, user: data.user }
    setAuth(next)
    writeStoredAuth({ token: data.accessToken, user: data.user })
  }, [])

  const bootstrapAdmin = useCallback(
    async (body: { name: string; email: string; password: string }) => {
      const data = await bootstrapAdminRequest(body)
      setAuth({ token: data.accessToken, user: data.user })
      writeStoredAuth({ token: data.accessToken, user: data.user })
    },
    [],
  )

  const logout = useCallback(() => {
    setAuth({ token: null, user: null })
    writeStoredAuth(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      token: auth.token,
      user: auth.user,
      login,
      bootstrapAdmin,
      logout,
    }),
    [auth.token, auth.user, login, bootstrapAdmin, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
