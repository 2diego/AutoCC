export type ThemeMode = 'dark' | 'light'

const STORAGE_KEY = 'autocc_theme'

export const defaultTheme: ThemeMode = 'dark'

export function getStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* ignore */
  }
  return defaultTheme
}

export function setStoredTheme(mode: ThemeMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute('data-theme', mode)
}

/** Llamar una vez al arranque (antes del primer paint si es posible). */
export function initTheme() {
  applyTheme(getStoredTheme())
}
