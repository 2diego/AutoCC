import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import styles from './LoginPage.module.css'

export function LoginPage() {
  const { login, bootstrapAdmin, token } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')

  const [showBootstrap, setShowBootstrap] = useState(false)
  const [bName, setBName] = useState('')
  const [bEmail, setBEmail] = useState('')
  const [bPassword, setBPassword] = useState('')
  const [bootstrapError, setBootstrapError] = useState('')
  const [bootstrapOk, setBootstrapOk] = useState('')

  useEffect(() => {
    if (token) {
      navigate('/', { replace: true })
    }
  }, [token, navigate])

  const onLogin = async (e: FormEvent) => {
    e.preventDefault()
    setLoginError('')
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Error en login')
    }
  }

  const onBootstrap = async (e: FormEvent) => {
    e.preventDefault()
    setBootstrapError('')
    setBootstrapOk('')
    try {
      await bootstrapAdmin({
        name: bName,
        email: bEmail,
        password: bPassword,
      })
      setBootstrapOk('Administrador creado. Entrando…')
      navigate('/', { replace: true })
    } catch (err) {
      setBootstrapError(
        err instanceof Error ? err.message : 'Error al crear administrador',
      )
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>AutoCC</h1>
        <p className={styles.lead}>
          Plataforma de gestión de cuentas corrientes. Iniciá sesión para usar
          el asistente, consolidación y exportaciones.
        </p>
      </header>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Ingresar a tu cuenta</h2>
        <p className={styles.cardHint}>
          Usá tu email corporativo y contraseña para continuar.
        </p>
        <form className="formGrid" onSubmit={onLogin}>
          <label className="fieldLabel">
            Email
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="fieldLabel">
            Contraseña
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" className="btn">
            Ingresar
          </button>
        </form>
        {loginError ? <p className="error">{loginError}</p> : null}
      </section>

      <section className={styles.card}>
        <button
          type="button"
          className={styles.toggleBootstrap}
          onClick={() => setShowBootstrap((v) => !v)}
          aria-expanded={showBootstrap}
        >
          {showBootstrap
            ? 'Ocultar creación de administrador'
            : 'Configuración inicial: crear administrador'}
        </button>

        {showBootstrap ? (
          <>
            <p className="muted" style={{ marginTop: '0.75rem' }}>
              Solo funciona si aún no hay usuarios en el sistema.
            </p>
            <form className="formGrid" onSubmit={onBootstrap}>
              <label className="fieldLabel">
                Nombre
                <input
                  className="input"
                  value={bName}
                  onChange={(e) => setBName(e.target.value)}
                  required
                />
              </label>
              <label className="fieldLabel">
                Email
                <input
                  className="input"
                  type="email"
                  value={bEmail}
                  onChange={(e) => setBEmail(e.target.value)}
                  required
                />
              </label>
              <label className="fieldLabel">
                Contraseña
                <input
                  className="input"
                  type="password"
                  value={bPassword}
                  onChange={(e) => setBPassword(e.target.value)}
                  required
                />
              </label>
              <button type="submit" className="btn btnSecondary">
                Crear administrador
              </button>
            </form>
            {bootstrapOk ? <p className="ok">{bootstrapOk}</p> : null}
            {bootstrapError ? (
              <p className="error">{bootstrapError}</p>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  )
}
