import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type LoginResponse = {
  accessToken: string
  user: {
    id: number
    name: string
    email: string
    role: 'admin' | 'operator'
  }
}

type ConsolidationResponse = {
  consolidationId: number
  erpSource: 'CEOS' | 'TOTVS'
  status: string
  stats: {
    baseDocs: number
    erpDocs: number
    keptDocs: number
    addedDocs: number
    errors: number
  }
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
}

function App() {
  const apiBaseUrl = useMemo(
    () => import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api',
    [],
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [loginError, setLoginError] = useState('')
  const [bootstrapName, setBootstrapName] = useState('')
  const [bootstrapEmail, setBootstrapEmail] = useState('')
  const [bootstrapPassword, setBootstrapPassword] = useState('')
  const [bootstrapError, setBootstrapError] = useState('')
  const [bootstrapOk, setBootstrapOk] = useState('')
  const [erpSource, setErpSource] = useState<'CEOS' | 'TOTVS'>('CEOS')
  const [baseFile, setBaseFile] = useState<File | null>(null)
  const [erpFile, setErpFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [consolidation, setConsolidation] = useState<ConsolidationResponse | null>(
    null,
  )
  const [consolidationError, setConsolidationError] = useState('')

  const isLoggedIn = token.length > 0

  const onLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoginError('')
    try {
      const response = await fetch(`${apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!response.ok) {
        throw new Error('Credenciales inválidas o usuario inexistente')
      }
      const data = (await response.json()) as LoginResponse
      setToken(data.accessToken)
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Error en login')
    }
  }

  const onBootstrapAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBootstrapError('')
    setBootstrapOk('')
    try {
      const response = await fetch(`${apiBaseUrl}/auth/bootstrap-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: bootstrapName,
          email: bootstrapEmail,
          password: bootstrapPassword,
        }),
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(
          text ||
            'No se pudo bootstrapear admin (si ya existe usuario, usar login normal)',
        )
      }
      const data = (await response.json()) as LoginResponse
      setToken(data.accessToken)
      setBootstrapOk(
        'Admin creado correctamente. Ya quedaste logueado con ese usuario.',
      )
    } catch (error) {
      setBootstrapError(
        error instanceof Error ? error.message : 'Error creando admin',
      )
    }
  }

  const onConsolidate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!baseFile || !erpFile) {
      setConsolidationError('Debes seleccionar baseFile y erpFile')
      return
    }
    setIsSubmitting(true)
    setConsolidationError('')
    setConsolidation(null)
    try {
      const formData = new FormData()
      formData.append('erpSource', erpSource)
      formData.append('baseFile', baseFile)
      formData.append('erpFile', erpFile)

      const response = await fetch(`${apiBaseUrl}/consolidations/run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'No se pudo ejecutar la consolidación')
      }
      const data = (await response.json()) as ConsolidationResponse
      setConsolidation(data)
    } catch (error) {
      setConsolidationError(
        error instanceof Error ? error.message : 'Error de consolidación',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const onDownloadExcel = async () => {
    try {
      const response = await fetch(
        `${apiBaseUrl}/exports/${erpSource}/current.xlsx`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      )
      if (!response.ok) {
        throw new Error('No se pudo descargar el excel')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${erpSource.toLowerCase()}-current.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setConsolidationError(
        error instanceof Error ? error.message : 'Error descargando excel',
      )
    }
  }

  return (
    <main className="page">
      <header className="header">
        <h1>AutoCC - Prueba de Consolidación</h1>
        <p>UI mínima para validar login, consolidación y descarga de excel</p>
      </header>

      <section className="card">
        <h2>1) Login</h2>
        <form onSubmit={onLogin} className="form">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit">Ingresar</button>
        </form>
        {isLoggedIn && <p className="ok">Login OK</p>}
        {loginError && <p className="error">{loginError}</p>}
      </section>

      <section className="card">
        <h2>1.b) Bootstrap admin (solo primera vez)</h2>
        <form onSubmit={onBootstrapAdmin} className="form">
          <label>
            Nombre
            <input
              type="text"
              value={bootstrapName}
              onChange={(e) => setBootstrapName(e.target.value)}
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={bootstrapEmail}
              onChange={(e) => setBootstrapEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={bootstrapPassword}
              onChange={(e) => setBootstrapPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit">Crear admin inicial</button>
        </form>
        {bootstrapOk && <p className="ok">{bootstrapOk}</p>}
        {bootstrapError && <p className="error">{bootstrapError}</p>}
      </section>

      <section className="card">
        <h2>2) Consolidar archivos</h2>
        <form onSubmit={onConsolidate} className="form">
          <label>
            ERP
            <select
              value={erpSource}
              onChange={(e) => setErpSource(e.target.value as 'CEOS' | 'TOTVS')}
            >
              <option value="CEOS">CEOS</option>
              <option value="TOTVS">TOTVS</option>
            </select>
          </label>
          <label>
            baseFile (.csv)
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setBaseFile(e.target.files?.[0] ?? null)}
              required
            />
          </label>
          <label>
            erpFile (.csv)
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setErpFile(e.target.files?.[0] ?? null)}
              required
            />
          </label>
          <button type="submit" disabled={!isLoggedIn || isSubmitting}>
            {isSubmitting ? 'Consolidando...' : 'Consolidar'}
          </button>
        </form>

        {consolidationError && <p className="error">{consolidationError}</p>}
        {consolidation && (
          <>
            <div className="stats">
              <p>baseDocs: {consolidation.stats.baseDocs}</p>
              <p>erpDocs: {consolidation.stats.erpDocs}</p>
              <p>keptDocs: {consolidation.stats.keptDocs}</p>
              <p>addedDocs: {consolidation.stats.addedDocs}</p>
              <p>errors: {consolidation.stats.errors}</p>
            </div>

            <h3>Preview (primeros agregados)</h3>
            <pre>{JSON.stringify(consolidation.previewAdded, null, 2)}</pre>

            <button type="button" onClick={onDownloadExcel} disabled={!isLoggedIn}>
              Descargar excel actualizado
            </button>
          </>
        )}
      </section>
    </main>
  )
}

export default App
