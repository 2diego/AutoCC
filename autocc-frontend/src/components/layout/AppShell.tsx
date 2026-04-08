import { type ReactNode, useState } from 'react'
import styles from './AppShell.module.css'

type AppShellProps = {
  userName: string
  children: ReactNode
  onOpenSettings: () => void
  onOpenConsolidation: () => void
  onLogout: () => void
}

export function AppShell({
  userName,
  children,
  onOpenSettings,
  onOpenConsolidation,
  onLogout,
}: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = () => setMenuOpen(false)

  const openSettings = () => {
    onOpenSettings()
    closeMenu()
  }

  const openConsolidation = () => {
    onOpenConsolidation()
    closeMenu()
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <div className={styles.brand}>
          <strong className={styles.logo}>AutoCC</strong>
          <span className={styles.userDesktop} aria-hidden>
            {userName}
          </span>
        </div>

        <nav className={styles.navDesktop} aria-label="Principal">
          <button type="button" className={styles.navBtn} onClick={openConsolidation}>
            Consolidación
          </button>
          <button type="button" className={styles.navBtn} onClick={openSettings}>
            Ajustes
          </button>
          <button type="button" className={styles.logout} onClick={onLogout}>
            Salir
          </button>
        </nav>

        <button
          type="button"
          className={styles.burger}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span className={styles.burgerLine} />
          <span className={styles.burgerLine} />
          <span className={styles.burgerLine} />
        </button>
      </header>

      {menuOpen ? (
        <div
          id="mobile-menu"
          className={styles.mobileDrawer}
          role="dialog"
          aria-modal="true"
          aria-label="Menú"
        >
          <p className={styles.mobileUser}>{userName}</p>
          <button
            type="button"
            className={styles.mobileLink}
            onClick={openConsolidation}
          >
            Consolidación
          </button>
          <button
            type="button"
            className={styles.mobileLink}
            onClick={openSettings}
          >
            Ajustes
          </button>
          <button type="button" className={styles.mobileLogout} onClick={onLogout}>
            Cerrar sesión
          </button>
          <button type="button" className={styles.mobileClose} onClick={closeMenu}>
            Cerrar menú
          </button>
        </div>
      ) : null}

      <main className={styles.main}>{children}</main>
    </div>
  )
}
