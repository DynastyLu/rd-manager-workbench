import { act, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from '../AppShell'

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

function CurrentPath() {
  return <output aria-label="当前路径">{useLocation().pathname}</output>
}

function renderShell(initialPath = '/docs') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<AppShell skeleton={<p>加载中</p>} />}>
            <Route
              path="*"
              element={
                <>
                  <CurrentPath />
                  <Outlet />
                </>
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('AppShell', () => {
  beforeEach(() => {
    listNotifications.mockReset()
    subscribeToNotifications.mockReset()
    listNotifications.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    })
    subscribeToNotifications.mockReturnValue(vi.fn())
  })

  afterEach(() => {
    Reflect.deleteProperty(window, 'rdWorkbenchDesktop')
  })

  it('renders semantic primary navigation, active documents app, and the route content area without tabs', () => {
    const { container } = renderShell()

    expect(screen.getByRole('navigation', { name: '主导航' })).toBeInTheDocument()
    expect(screen.getAllByRole('link').length).toBeGreaterThanOrEqual(8)
    expect(screen.getByRole('link', { name: /文档与知识库/ })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByLabelText('当前位置：工作空间，文档与知识库')).toBeInTheDocument()
    expect(screen.getByText('文档与知识库', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(container.querySelector('.tab-bar')).not.toBeInTheDocument()
  })

  it('navigates to settings when its semantic link receives Enter', async () => {
    const user = userEvent.setup()
    renderShell()

    const settings = screen.getByRole('link', { name: /设置/ })
    settings.focus()
    await user.keyboard('{Enter}')

    expect(screen.getByLabelText('当前路径')).toHaveTextContent('/settings')
  })

  it('uses the more specific nested route title in the workspace header', () => {
    renderShell('/library/applications')

    expect(screen.getByLabelText('当前位置：工作空间，申报认定')).toBeInTheDocument()
    expect(screen.getByText('申报认定', { selector: 'strong' })).toBeInTheDocument()
  })

  it.each([
    ['/library/applications/extra', '申报认定'],
    ['/spaces/projects/project-1/overview/extra', '项目空间'],
  ])('does not treat invalid path %s as the specific %s page', (path, specificTitle) => {
    renderShell(path)

    expect(screen.getByLabelText('当前位置：工作空间，工作台')).toBeInTheDocument()
    expect(screen.queryByText(specificTitle, { selector: 'strong' })).not.toBeInTheDocument()
  })

  it('navigates to an internal related object when Electron reports a notification click', () => {
    let notificationClick: ((sourcePath: string) => void) | undefined
    const unsubscribe = vi.fn()
    const onNotificationClicked = vi.fn((callback: (sourcePath: string) => void) => {
      notificationClick = callback
      return unsubscribe
    })
    Object.defineProperty(window, 'rdWorkbenchDesktop', {
      configurable: true,
      value: { onNotificationClicked },
    })

    const view = renderShell()
    act(() => notificationClick?.('/spaces/projects/project-1/overview?from=notification'))

    expect(screen.getByLabelText('当前路径')).toHaveTextContent(
      '/spaces/projects/project-1/overview'
    )
    expect(onNotificationClicked).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it.each([
    'https://evil.example/steal',
    '//evil.example/steal',
    '/\\evil.example/steal',
    'javascript:alert(1)',
    '/not-a-workbench-route',
  ])(
    'ignores unsafe desktop notification path %s',
    (unsafePath) => {
      let notificationClick: ((sourcePath: string) => void) | undefined
      Object.defineProperty(window, 'rdWorkbenchDesktop', {
        configurable: true,
        value: {
          onNotificationClicked(callback: (sourcePath: string) => void) {
            notificationClick = callback
            return vi.fn()
          },
        },
      })

      renderShell('/my-work')
      act(() => notificationClick?.(unsafePath))

      expect(screen.getByLabelText('当前路径')).toHaveTextContent('/my-work')
    }
  )
})
