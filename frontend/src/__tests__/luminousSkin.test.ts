import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(process.cwd(), 'src')

describe('Luminous Workspace skin', () => {
  it('loads the skin after the workspace tokens', () => {
    const source = readFileSync(join(ROOT, 'main.tsx'), 'utf8')
    const tokens = source.indexOf("@/styles/workspace-tokens.css")
    const skin = source.indexOf("@/styles/luminous-skin.css")

    expect(tokens).toBeGreaterThan(-1)
    expect(skin).toBeGreaterThan(tokens)
  })

  it('defines semantic surfaces, glow and motion tokens', () => {
    const source = readFileSync(join(ROOT, 'styles/workspace-tokens.css'), 'utf8')

    expect(source).toContain('--workspace-surface-glass:')
    expect(source).toContain('--workspace-glow-brand:')
    expect(source).toContain('--workspace-motion-fast:')
    expect(source).toContain('--workspace-radius-xl:')
  })

  it('skins the key Semi enterprise controls without narrowing the workspace', () => {
    const source = readFileSync(join(ROOT, 'styles/luminous-skin.css'), 'utf8')

    for (const selector of [
      '.semi-button',
      '.semi-input-wrapper',
      '.semi-select',
      '.semi-datepicker',
      '.semi-table-wrapper',
      '.semi-modal-content',
      '.semi-dropdown-menu',
      '.semi-toast-content',
    ]) {
      expect(source).toContain(selector)
    }

    expect(source).toContain('prefers-reduced-motion: reduce')
    expect(source).not.toContain('max-width: 1440px')
    expect(source).not.toContain('transition: all')
  })

  it('provides selectable skin previews instead of a legacy theme toggle', () => {
    const page = readFileSync(join(ROOT, 'pages/WorkbenchSettings.tsx'), 'utf8')
    const skin = readFileSync(join(ROOT, 'styles/luminous-skin.css'), 'utf8')

    expect(page).toContain('workspace-theme-card')
    expect(page).toContain('THEME_LABELS')
    expect(page).not.toContain('>\n          极光\n        </button>')
    expect(skin).toContain(".workspace-theme-card[aria-pressed='true']")
  })
})
