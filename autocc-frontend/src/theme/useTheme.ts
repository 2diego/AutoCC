import { useCallback, useSyncExternalStore } from 'react'
import {
  applyTheme,
  defaultTheme,
  getStoredTheme,
  setStoredTheme,
  type ThemeMode,
} from './theme'

let current: ThemeMode = getStoredTheme()
const listeners = new Set<() => void>()

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getSnapshot(): ThemeMode {
  return current
}

function getServerSnapshot(): ThemeMode {
  return defaultTheme
}

function setMode(mode: ThemeMode) {
  current = mode
  setStoredTheme(mode)
  applyTheme(mode)
  listeners.forEach((l) => l())
}

export function useTheme() {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setTheme = useCallback((next: ThemeMode) => {
    setMode(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setMode(mode === 'dark' ? 'light' : 'dark')
  }, [mode])

  return { theme: mode, setTheme, toggleTheme }
}
