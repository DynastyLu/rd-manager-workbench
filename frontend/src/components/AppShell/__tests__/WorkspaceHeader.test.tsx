import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { WorkspaceHeader } from '../WorkspaceHeader'

const appShellStyles = readFileSync(
  resolve(process.cwd(), 'src/components/AppShell/AppShell.less'),
  'utf8'
)

describe('WorkspaceHeader', () => {
  it('uses readable theme tokens for local status, planned labels, and breadcrumbs', () => {
    expect(appShellStyles).toMatch(/&__status,\s*&__planned\s*{\s*color: var\(--text-secondary\)/)
    expect(appShellStyles).toMatch(/&__route\s*{[\s\S]*?color: var\(--text-secondary\)/)
    expect(appShellStyles).toMatch(/&-label\s*{\s*color: var\(--text-secondary\)/)
  })

  it('marks search and theme captions for narrow-screen hiding while preserving button names', () => {
    render(
      <MemoryRouter>
        <WorkspaceHeader />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: /搜索本地工作台/ })).toHaveAttribute(
      'aria-describedby',
      'planned-search-feedback'
    )
    expect(screen.getByText('搜索本地工作台')).toHaveClass('workspace-header__search-label')
    expect(screen.getByText('世界杯')).toHaveClass('workspace-header__theme-label')
    expect(appShellStyles).toMatch(
      /@media \(max-width: 900px\)[\s\S]*?&__search-label,[\s\S]*?&__theme-label/
    )
  })
})
