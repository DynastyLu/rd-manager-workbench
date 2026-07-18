import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { WorkspaceHeader } from '../WorkspaceHeader'

function renderHeader() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <WorkspaceHeader />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('WorkspaceHeader', () => {
  beforeEach(() => localStorage.clear())

  it('labels unavailable search and notification capabilities honestly', async () => {
    const user = userEvent.setup()
    renderHeader()

    expect(screen.getByRole('textbox', { name: '全局搜索（P1 开发中）' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '通知中心' }))
    expect(await screen.findByText('通知中心将在 P0-B 接入')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '切换主题' })).not.toBeInTheDocument()
  })

  it('opens a real project creation form from the keyboard-safe create menu', async () => {
    const user = userEvent.setup()
    renderHeader()

    await user.click(screen.getByRole('button', { name: '全局新建' }))
    await user.click(await screen.findByRole('menuitem', { name: '新建项目' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('项目编号')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存项目' })).toBeInTheDocument()
  })

  it('opens a recorded recent project instead of reporting a fake empty state', async () => {
    localStorage.setItem('rd-workbench:recent-projects', JSON.stringify(['project-9']))
    const user = userEvent.setup()
    renderHeader()

    await user.click(screen.getByRole('button', { name: '最近访问' }))

    expect(await screen.findByRole('link', { name: '打开最近访问的项目' })).toHaveAttribute(
      'href',
      '/spaces/projects/project-9/overview'
    )
  })
})
