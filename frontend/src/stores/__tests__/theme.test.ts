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
    useThemeStore.setState({ theme: 'classic' })
  })

  it('ships one stable light workspace theme', () => {
    expect(THEMES).toEqual(['classic'])
    expect(THEME_LABELS.classic.label).toBe('工作台浅色')
    expect(DEFAULT_THEME).toBe('classic')
    expect(useThemeStore.getState().theme).toBe('classic')
  })

  it('keeps the html data-theme attribute on the light workspace theme', () => {
    useThemeStore.getState().setTheme('classic')
    expect(document.documentElement).toHaveAttribute('data-theme', 'classic')
  })

  it('migrates old saved skins to the light workspace default', () => {
    const oldRecord = JSON.stringify({ state: { theme: 'cyberpunk' }, version: 0 })
    expect(resolveStoredTheme(oldRecord)).toBe(DEFAULT_THEME)
  })

  it('ignores a legacy skin saved with the current storage version', () => {
    const currentLegacyRecord = JSON.stringify({
      state: { theme: 'worldcup' },
      version: THEME_STORAGE_VERSION,
    })
    expect(resolveStoredTheme(currentLegacyRecord)).toBe('classic')
  })

  it('keeps skins explicitly saved with the current storage version', () => {
    const currentRecord = JSON.stringify({
      state: { theme: 'classic' },
      version: THEME_STORAGE_VERSION,
    })
    expect(resolveStoredTheme(currentRecord)).toBe('classic')
  })
})
