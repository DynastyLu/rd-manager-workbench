import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { WorkspaceHeader } from '../WorkspaceHeader'

describe('WorkspaceHeader', () => {
  it('exposes the workspace search and global actions without the retired theme switcher', () => {
    render(
      <MemoryRouter>
        <WorkspaceHeader />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: '搜索工作台' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '全局新建' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '最近访问' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '通知中心' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '设置' })).toHaveAttribute('href', '/settings')
    expect(screen.queryByRole('button', { name: '切换主题' })).not.toBeInTheDocument()
  })
})
