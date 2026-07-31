import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(join(process.cwd(), 'src/pages/KnowledgeHomePage.less'), 'utf8')
const globalAnimations = readFileSync(join(process.cwd(), 'src/animations.css'), 'utf8')
const appEntry = readFileSync(join(process.cwd(), 'src/main.tsx'), 'utf8')

describe('NOVA thinking motion styles', () => {
  it('keeps the robot bounce and thinking dots independent from the visual theme', () => {
    expect(styles).toMatch(
      /\.nova-bot--active\s+\.nova-bot__orb\s*\{[^}]*animation:\s*nova-bot-bounce/s,
    )
    expect(styles).toMatch(
      /\.kb-ai-thinking__ellipsis i\s*\{[^}]*animation:\s*kb-ai-thinking-dot/s,
    )
    expect(styles).toContain('@keyframes nova-bot-bounce')
    expect(styles).toContain('@keyframes kb-ai-thinking-dot')
  })

  it('matches the approved rotating aura and top sweep during retrieval', () => {
    expect(styles).toMatch(
      /\.kb-ai-thinking__search-glow::before\s*\{[^}]*conic-gradient[^}]*animation:\s*kb-ai-search-orbit/s,
    )
    expect(styles).toMatch(
      /\.kb-ai-thinking--searching\s+\.kb-ai-thinking__panel::before\s*\{[^}]*animation:\s*kb-ai-search-sweep/s,
    )
    expect(styles).toContain('@keyframes kb-ai-search-orbit')
    expect(styles).not.toContain('@keyframes kb-ai-border-trace')
  })

  it('does not disable motion just because the white classic theme is active', () => {
    expect(globalAnimations).not.toMatch(
      /\[data-theme=['"]classic['"]\]\s+\*\s*\{[^}]*animation-duration:\s*0\.01ms/s,
    )
    expect(appEntry).not.toContain("theme === 'classic' ? 'always' : 'user'")
    expect(appEntry).toContain('<MotionConfig reducedMotion="user">')
  })
})
