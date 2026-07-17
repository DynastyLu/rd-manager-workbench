import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME,
  THEME_LABELS,
  THEME_STORAGE_VERSION,
  THEMES,
  resolveStoredTheme,
  useThemeStore,
} from '../theme'

describe('useThemeStore', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    useThemeStore.setState({ theme: 'worldcup' })
  })

  it('ships the World Cup skin as the default app theme', () => {
    expect(THEMES).toContain('worldcup')
    expect(THEME_LABELS.worldcup.label).toBe('世界杯')
    expect(useThemeStore.getState().theme).toBe('worldcup')
  })

  it('updates the html data-theme attribute when switching skins', () => {
    useThemeStore.getState().setTheme('classic')
    expect(document.documentElement).toHaveAttribute('data-theme', 'classic')

    useThemeStore.getState().setTheme('worldcup')
    expect(document.documentElement).toHaveAttribute('data-theme', 'worldcup')
  })

  it('migrates old saved skins to the World Cup default once', () => {
    const oldRecord = JSON.stringify({ state: { theme: 'cyberpunk' }, version: 0 })
    expect(resolveStoredTheme(oldRecord)).toBe(DEFAULT_THEME)
  })

  it('keeps skins explicitly saved with the current storage version', () => {
    const currentRecord = JSON.stringify({
      state: { theme: 'classic' },
      version: THEME_STORAGE_VERSION,
    })
    expect(resolveStoredTheme(currentRecord)).toBe('classic')
  })
})
