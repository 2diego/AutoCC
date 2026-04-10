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

export type AddDocumentsFromErpStats = {
  baseDocs: number
  erpDocs: number
  keptDocs: number
  addedDocs: number
  removedDocs?: number
  errors: number
}

export type AddDocumentsFromErpResponse = {
  consolidationId: number
  erpSource: ErpSource
  status: string
  stats: AddDocumentsFromErpStats
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
  previewRemoved?: Array<{
    clienteId: string
    tienda: string
    tipoDocumento: string
    numeroDocumento: string
    fechaDoc: string | null
  }>
  previewErrors?: Array<{
    sourceFile: string
    lineNumber: number
    errorCode: string
    message: string
  }>
}

export type RemoveDocumentsWithMatrixResponse = {
  consolidationId: number
  erpSource: ErpSource
  status: string
  matrixCutoffDate: string
  stats: {
    baseDocs: number
    erpDocs: number
    keptDocs: number
    removedDocs: number
    errors: number
  }
  previewRemoved: Array<{
    clienteId: string
    tienda: string
    tipoDocumento: string
    numeroDocumento: string
    fechaDoc: string | null
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
