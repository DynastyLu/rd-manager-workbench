import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const THEMES = ['classic'] as const
export type Theme = (typeof THEMES)[number]
export const DEFAULT_THEME: Theme = 'classic'
export const THEME_STORAGE_NAME = 'app_theme'
export const THEME_STORAGE_VERSION = 2

export const THEME_LABELS: Record<Theme, { label: string; icon: string; desc: string }> = {
  classic: { label: '工作台浅色', icon: '☀', desc: 'Workspace Light' },
}

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && THEMES.includes(value as Theme)
}

function readPersistedTheme(value: unknown): Theme | null {
  if (typeof value !== 'object' || value === null || !('theme' in value)) return null
  const theme = (value as { theme?: unknown }).theme
  return isTheme(theme) ? theme : null
}

export function resolveStoredTheme(raw: string | null): Theme {
  if (!raw) return DEFAULT_THEME
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || !('state' in parsed)) return DEFAULT_THEME
    const { state, version } = parsed as { state?: unknown; version?: unknown }
    if (version !== THEME_STORAGE_VERSION) return DEFAULT_THEME
    return readPersistedTheme(state) ?? DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: DEFAULT_THEME,
      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme)
        set({ theme })
      },
    }),
    {
      name: THEME_STORAGE_NAME,
      version: THEME_STORAGE_VERSION,
      partialize: (state) => ({ theme: state.theme }),
      migrate: (persistedState, version) => {
        if (version !== THEME_STORAGE_VERSION) return { theme: DEFAULT_THEME }
        return { theme: readPersistedTheme(persistedState) ?? DEFAULT_THEME }
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          document.documentElement.setAttribute('data-theme', state.theme)
        }
      },
    }
  )
)
