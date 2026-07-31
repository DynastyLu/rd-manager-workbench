import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import {
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { ROUTES } from '@/constants/routes'
import { Permission } from '@/modules/auth/Permission'
import { RequireAuth } from '@/modules/auth/RequireAuth'
import { useAuthStore } from '@/modules/auth/store'
import type { CurrentUser } from '@/modules/auth/types'
import { protectedRoutes, publicRoutes } from '@/router/routes'

const user: CurrentUser = {
  id: 'user-1',
  username: 'employee',
  employeeNo: 'RD-018',
  status: 'ACTIVE',
  mustChangePassword: false,
  permissionVersion: 1,
  resourceProfileId: 'employee-18',
  displayName: '普通员工',
  department: '研发部',
  roleTitle: '研发工程师',
  roleCodes: ['EMPLOYEE'],
  permissions: [{ code: 'project.read', dataScope: 'SELF', scopeConfig: null }],
}

function RouteStateProbe() {
  const location = useLocation()
  return (
    <>
      <output aria-label="当前路径">{location.pathname}</output>
      <output aria-label="登录后返回路径">
        {(location.state as { from?: string } | null)?.from ?? ''}
      </output>
    </>
  )
}

function ProtectedContent() {
  return (
    <>
      <p>受保护内容</p>
      <Outlet />
    </>
  )
}

function renderProtectedRoute(
  initialPath: string,
  requireAuth = <RequireAuth />
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<RouteStateProbe />} />
          <Route path="/change-password" element={<RouteStateProbe />} />
          <Route path="/forbidden" element={<RouteStateProbe />} />
          <Route element={requireAuth}>
            <Route path="/spaces/projects" element={<ProtectedContent />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('authentication route guards', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'ANONYMOUS',
      authEpoch: 0,
      accessToken: undefined,
      csrfToken: 'csrf-token',
      user: undefined,
    })
  })

  it('sends an anonymous user to login and preserves the original URL', async () => {
    renderProtectedRoute('/spaces/projects?status=ACTIVE')

    expect(await screen.findByLabelText('当前路径')).toHaveTextContent('/login')
    expect(screen.getByLabelText('登录后返回路径')).toHaveTextContent(
      '/spaces/projects?status=ACTIVE'
    )
  })

  it('allows an authenticated user into a protected route', async () => {
    useAuthStore.setState({
      status: 'AUTHENTICATED',
      authEpoch: 1,
      accessToken: 'access-token',
      csrfToken: 'csrf-token',
      user,
    })

    renderProtectedRoute('/spaces/projects')

    expect(await screen.findByText('受保护内容')).toBeInTheDocument()
    expect(screen.queryByLabelText('当前路径')).not.toBeInTheDocument()
  })

  it('forces a user with a temporary password to change it before business routes', async () => {
    useAuthStore.setState({
      status: 'AUTHENTICATED',
      authEpoch: 1,
      accessToken: 'access-token',
      csrfToken: 'csrf-token',
      user: { ...user, mustChangePassword: true },
    })

    renderProtectedRoute('/spaces/projects')

    expect(await screen.findByLabelText('当前路径')).toHaveTextContent(
      '/change-password'
    )
    expect(screen.queryByText('受保护内容')).not.toBeInTheDocument()
  })

  it('lands on a stable forbidden route once when a permission is missing', async () => {
    useAuthStore.setState({
      status: 'AUTHENTICATED',
      authEpoch: 1,
      accessToken: 'access-token',
      csrfToken: 'csrf-token',
      user,
    })

    renderProtectedRoute(
      '/spaces/projects',
      <RequireAuth permission="project.delete" />
    )

    await waitFor(() =>
      expect(screen.getByLabelText('当前路径')).toHaveTextContent('/forbidden')
    )
    expect(screen.queryByText('受保护内容')).not.toBeInTheDocument()
  })

  it('keeps public authentication pages outside the AppShell route group', () => {
    expect(publicRoutes.map((route) => route.path)).toEqual([
      ROUTES.LOGIN,
      ROUTES.CHANGE_PASSWORD,
      ROUTES.FORBIDDEN,
    ])
    expect(protectedRoutes.map((route) => route.path)).toContain(ROUTES.HOME)
    expect(protectedRoutes.map((route) => route.path)).toContain(
      ROUTES.PERSONAL_SECURITY
    )
    expect(protectedRoutes.map((route) => route.path)).not.toEqual(
      expect.arrayContaining(publicRoutes.map((route) => route.path))
    )
  })

  it('uses the same permission grants to hide unauthorized actions', () => {
    useAuthStore.setState({
      status: 'AUTHENTICATED',
      authEpoch: 1,
      accessToken: 'access-token',
      csrfToken: 'csrf-token',
      user,
    })

    const view = render(
      <Permission code="project.delete">
        <button type="button">删除项目</button>
      </Permission>
    )
    expect(screen.queryByRole('button', { name: '删除项目' })).not.toBeInTheDocument()

    useAuthStore.setState({
      user: {
        ...user,
        permissions: [
          ...user.permissions,
          { code: 'project.delete', dataScope: 'SELF', scopeConfig: null },
        ],
      },
    })
    view.rerender(
      <Permission code="project.delete">
        <button type="button">删除项目</button>
      </Permission>
    )
    expect(screen.getByRole('button', { name: '删除项目' })).toBeInTheDocument()
  })
})
