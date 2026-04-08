import { Modal } from '../../components/ui/Modal'
import { getApiBaseUrl } from '../../api/config'
import { useAuth } from '../../context/useAuth'
import { useTheme } from '../../theme/useTheme'

type SettingsSheetProps = {
  open: boolean
  onClose: () => void
}

export function SettingsSheet({ open, onClose }: SettingsSheetProps) {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const apiUrl = getApiBaseUrl()

  return (
    <Modal
      open={open}
      title="Ajustes"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn"
          style={{ width: '100%' }}
          onClick={() => {
            onClose()
            logout()
          }}
        >
          Cerrar sesión
        </button>
      }
    >
      <section className="surfaceSection">
        <p className="muted">Usuario conectado</p>
        <p className="profileName">{user?.name}</p>
        <p className="muted profileMeta">
          {user?.email} · {user?.role}
        </p>
      </section>

      <section className="surfaceSection">
        <h3 className="sectionTitle">Apariencia</h3>
        <label className="themeSwitch">
          <input
            type="checkbox"
            className="themeSwitchInput"
            checked={theme === 'dark'}
            onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')}
          />
          <span className="themeSwitchTrack" aria-hidden />
          <span className="themeSwitchLabel">Modo oscuro</span>
        </label>
        <p className="muted sectionHint">
          Por defecto la app inicia en modo oscuro. La preferencia se guarda en
          este navegador.
        </p>
      </section>

      <section className="surfaceSection">
        <h3 className="sectionTitle">API</h3>
        <p className="muted">
          URL base usada por el navegador (variable <code>VITE_API_URL</code> o
          valor por defecto):
        </p>
        <pre className="preJson preJsonCompact">{apiUrl}</pre>
      </section>
    </Modal>
  )
}
