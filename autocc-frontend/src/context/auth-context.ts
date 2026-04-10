import { createContext } from 'react'
import type { AuthUser } from '../api/types'

export type AuthContextValue = {
  token: string | null
  user: AuthUser | null
  login: (email: string, password: string) => Promise<void>
  bootstrapAdmin: (body: {
    name: string
    email: string
    password: string
  }) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
