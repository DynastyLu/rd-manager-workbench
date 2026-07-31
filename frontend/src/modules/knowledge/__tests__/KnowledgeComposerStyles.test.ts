import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(join(process.cwd(), 'src/pages/KnowledgeHomePage.less'), 'utf8')

describe('NOVA composer focus styles', () => {
  it('keeps the textarea focus free from a native rectangular outline', () => {
    expect(styles).toMatch(
      /\.kb-chat-composer__textarea:focus,\s*\.kb-chat-composer__textarea:focus-visible\s*\{[^}]*outline:\s*unset;[^}]*box-shadow:\s*none;[^}]*animation:\s*none;/s,
    )
  })

  it('keeps the composer focus treatment neutral instead of blue', () => {
    const focusRule = styles.match(/\.kb-chat-composer:focus-within\s*\{([^}]*)\}/s)?.[1] ?? ''

    expect(focusRule).not.toContain('rgba(20, 86, 240')
    expect(focusRule).toContain('border-color: #c5cad2')
  })
})
