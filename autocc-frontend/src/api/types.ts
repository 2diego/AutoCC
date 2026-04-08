export type ErpSource = 'CEOS' | 'TOTVS'

export type UserRole = 'admin' | 'operator'

export type AuthUser = {
  id: number
  name: string
  email: string
  role: UserRole
}

export type LoginResponse = {
  accessToken: string
  user: AuthUser
}

export type ConsolidationStats = {
  baseDocs: number
  erpDocs: number
  keptDocs: number
  addedDocs: number
  errors: number
}

export type ConsolidationResponse = {
  consolidationId: number
  erpSource: ErpSource
  status: string
  stats: ConsolidationStats
  previewAdded: Array<{
    clienteId: string
    tienda: string
    tipoDocumento: string
    numeroDocumento: string
  }>
  previewCurrent: Array<{
    clienteId: string
    tienda: string
    tipoDocumento: string
    numeroDocumento: string
    saldo: string | null
    observaciones: string | null
  }>
  previewErrors?: Array<{
    sourceFile: string
    lineNumber: number
    errorCode: string
    message: string
  }>
}
