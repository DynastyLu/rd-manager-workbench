import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'aurora' | 'eye-care'

export const THEME_LABELS: Record<Theme, { label: string; icon: string; desc: string }> = {
  aurora: { label: '流光', icon: '✦', desc: 'Luminous Workspace' },
  'eye-care': { label: '护眼', icon: '☀', desc: 'Eye Care' },
}

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'aurora',
      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme)
        set({ theme })
      },
    }),
    {
      name: 'rd-workbench-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          document.documentElement.setAttribute('data-theme', state.theme)
        }
      },
    }
  )
)
