import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceHeader } from '../WorkspaceHeader'

const { listNotifications, subscribeToNotifications } = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  subscribeToNotifications: vi.fn(),
}))

vi.mock('@/modules/workbench/api/notifications', () => ({
  listNotifications,
  markNotificationRead: vi.fn(),
  dismissNotification: vi.fn(),
  snoozeNotification: vi.fn(),
}))

vi.mock('@/modules/workbench/realtime/notificationSocket', () => ({
  subscribeToNotifications,
}))

function renderHeader() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <WorkspaceHeader />
        <output aria-label="当前路由">{<LocationProbe />}</output>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function LocationProbe() {
  return useLocation().pathname
}

describe('WorkspaceHeader', () => {
  beforeEach(() => {
    localStorage.clear()
    listNotifications.mockReset()
    subscribeToNotifications.mockReset()
    listNotifications.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    })
    subscribeToNotifications.mockReturnValue(vi.fn())
  })

  it('opens the available global search and exposes the real notification center', async () => {
    const user = userEvent.setup()
    renderHeader()

    const searchEntry = screen.getByRole('button', { name: '全局搜索' })
    expect(searchEntry).toBeEnabled()
    await user.click(searchEntry)
    expect(screen.getByRole('status', { name: '当前路由' })).toHaveTextContent('/search')
    await user.click(screen.getByRole('button', { name: '通知中心' }))
    expect(await screen.findByText('没有未读通知')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '切换主题' })).not.toBeInTheDocument()
  })

  it('opens and focuses global search with Cmd+K', async () => {
    const focusSearch = vi.fn()
    window.addEventListener('rd-workbench:focus-search', focusSearch)
    renderHeader()

    fireEvent.keyDown(window, { key: 'k', metaKey: true })

    await waitFor(() =>
      expect(screen.getByRole('status', { name: '当前路由' })).toHaveTextContent('/search')
    )
    expect(screen.getByRole('button', { name: '全局搜索' })).toHaveFocus()
    await waitFor(() => expect(focusSearch).toHaveBeenCalled())
    window.removeEventListener('rd-workbench:focus-search', focusSearch)
  })

  it('does not navigate merely because keyboard focus reaches the search entry', () => {
    renderHeader()

    screen.getByRole('button', { name: '全局搜索' }).focus()

    expect(screen.getByRole('status', { name: '当前路由' })).toHaveTextContent('/')
  })

  it('opens a real project creation form from the keyboard-safe create menu', async () => {
    const user = userEvent.setup()
    renderHeader()

    await user.click(screen.getByRole('button', { name: '全局新建' }))
    const projectItem = await screen.findByRole('menuitem', { name: '新建项目' })
    projectItem.focus()
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('项目编号')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument()
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

  it('refreshes recent projects when a project is opened without a route change', async () => {
    const user = userEvent.setup()
    renderHeader()
    localStorage.setItem('rd-workbench:recent-projects', JSON.stringify(['project-live']))
    window.dispatchEvent(new Event('rd-workbench:recent-projects-changed'))

    await user.click(screen.getByRole('button', { name: '最近访问' }))

    expect(await screen.findByRole('link', { name: '打开最近访问的项目' })).toHaveAttribute(
      'href',
      '/spaces/projects/project-live/overview'
    )
  })
})
