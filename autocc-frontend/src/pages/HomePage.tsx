import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { ChatPanel } from '../components/chat/ChatPanel'
import { ConsolidationSheet } from '../features/consolidation/ConsolidationSheet'
import { SettingsSheet } from '../features/settings/SettingsSheet'
import { useAuth } from '../context/useAuth'
import styles from './HomePage.module.css'

export function HomePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [consolidationOpen, setConsolidationOpen] = useState(false)

  const displayName = user?.name?.trim() || user?.email || 'Usuario'

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <AppShell
        userName={displayName}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenConsolidation={() => setConsolidationOpen(true)}
        onLogout={handleLogout}
      >
        <div className={styles.page}>
          <div className={styles.chatSlot}>
            <ChatPanel userName={displayName} />
          </div>
        </div>
      </AppShell>
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <ConsolidationSheet
        open={consolidationOpen}
        onClose={() => setConsolidationOpen(false)}
      />
    </>
  )
}
