import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, type InitialEntry } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/store'
import type { CurrentUser, LoginResponse } from '@/modules/auth/types'
import FirstPasswordChangePage from '@/modules/auth/pages/FirstPasswordChangePage'
import ForbiddenPage from '@/modules/auth/pages/ForbiddenPage'
import LoginPage from '@/modules/auth/pages/LoginPage'
import { LOGIN_GALAXY_PRESET } from '@/modules/auth/pages/loginGalaxyPreset'
import PersonalSecurityPage from '@/modules/auth/pages/PersonalSecurityPage'

const authApi = vi.hoisted(() => ({
  changePassword: vi.fn(),
  login: vi.fn(),
  listSessions: vi.fn(),
  revokeAllSessions: vi.fn(),
  revokeSession: vi.fn(),
}))

vi.mock('@/modules/auth/api', () => authApi)

const currentUser: CurrentUser = {
  id: 'user-1',
  username: 'admin',
  employeeNo: 'RD-001',
  status: 'ACTIVE',
  mustChangePassword: false,
  permissionVersion: 1,
  resourceProfileId: 'employee-1',
  displayName: '系统管理员',
  department: '研发部',
  roleTitle: '研发主管',
  roleCodes: ['SUPER_ADMIN'],
  permissions: [{ code: 'admin.user.read', dataScope: 'ALL', scopeConfig: null }],
}

const loginResponse: LoginResponse = {
  accessToken: 'access-token',
  csrfToken: 'csrf-token',
  user: currentUser,
  mustChangePassword: false,
}

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="当前认证路径">{location.pathname}</output>
}

function renderAuthPage(
  element: React.ReactNode,
  {
    initialEntries = ['/'],
    extraRoutes,
  }: {
    initialEntries?: InitialEntry[]
    extraRoutes?: React.ReactNode
  } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="*" element={element} />
          {extraRoutes}
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('authentication pages', () => {
  beforeEach(() => {
    Object.values(authApi).forEach((mock) => mock.mockReset())
    useAuthStore.setState({
      status: 'ANONYMOUS',
      authEpoch: 0,
      accessToken: undefined,
      csrfToken: 'csrf-token',
      user: undefined,
    })
  })

  it('uses accessible login labels and browser password-manager autocomplete hints', async () => {
    const user = userEvent.setup()
    renderAuthPage(<LoginPage />, { initialEntries: ['/login'] })

    const identifier = screen.getByRole('textbox', { name: '账号或工号' })
    const password = screen.getByLabelText('密码')
    const rememberMe = screen.getByRole('checkbox', { name: '保持登录' })

    expect(identifier).toHaveAttribute('autocomplete', 'username')
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toHaveAttribute('autocomplete', 'current-password')
    expect(rememberMe).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(await screen.findByText('请输入账号或工号')).toBeInTheDocument()
    expect(screen.getByText('请输入密码')).toBeInTheDocument()
    expect(authApi.login).not.toHaveBeenCalled()
  })

  it('presents the login as a branded split workspace with a decorative galaxy', () => {
    renderAuthPage(<LoginPage />, { initialEntries: ['/login'] })

    expect(screen.getByLabelText('研发工作台能力概览')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '把研发计划变成清晰行动' })).toBeInTheDocument()
    expect(screen.getByText('项目全周期可视')).toBeInTheDocument()
    expect(screen.getByText('周计划自动汇总')).toBeInTheDocument()
    expect(screen.getByText('本地知识安全检索')).toBeInTheDocument()
    expect(screen.getByTestId('login-galaxy')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('heading', { name: '登录工作空间' })).toBeInTheDocument()
  })

  it('uses the interactive React Bits galaxy preset instead of a muted star field', () => {
    expect(LOGIN_GALAXY_PRESET).toEqual({
      density: 1.5,
      glowIntensity: 0.5,
      hueShift: 240,
      mouseRepulsion: true,
      rotationSpeed: 0.1,
      saturation: 0.8,
      speed: 1,
      starSpeed: 0.5,
      twinkleIntensity: 0.3,
    })
  })

  it('uses accessible floating labels for only the login inputs', async () => {
    const user = userEvent.setup()
    renderAuthPage(<LoginPage />, { initialEntries: ['/login'] })

    const identifier = screen.getByRole('textbox', { name: '账号或工号' })
    const password = screen.getByLabelText('密码')
    const identifierField = identifier.closest('.aurora-floating-field')
    const passwordField = password.closest('.aurora-floating-field')

    expect(identifierField).toContainElement(screen.getByText('账号或工号'))
    expect(passwordField).toContainElement(screen.getByText('密码'))
    expect(identifier).toHaveAttribute('placeholder', '请输入账号或员工工号')
    expect(password).toHaveAttribute('placeholder', '请输入密码')

    await user.click(identifier)
    expect(identifier).toHaveFocus()
    expect(screen.getByRole('button', { name: '登录' })).not.toHaveClass('aurora-floating-field')
  })

  it('returns to the original protected URL after a successful login', async () => {
    const user = userEvent.setup()
    authApi.login.mockResolvedValue(loginResponse)

    renderAuthPage(<LoginPage />, {
      initialEntries: [
        {
          pathname: '/login',
          state: { from: '/spaces/projects/project-1/tasks?owner=me' },
        },
      ],
      extraRoutes: <Route path="/spaces/projects/project-1/tasks" element={<LocationProbe />} />,
    })

    await user.type(screen.getByRole('textbox', { name: '账号或工号' }), 'RD-001')
    await user.type(screen.getByLabelText('密码'), 'SecurePass123')
    await user.click(screen.getByRole('checkbox', { name: '保持登录' }))
    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(authApi.login).toHaveBeenCalledWith({
      identifier: 'RD-001',
      password: 'SecurePass123',
      rememberMe: true,
    })
    expect(await screen.findByLabelText('当前认证路径')).toHaveTextContent(
      '/spaces/projects/project-1/tasks'
    )
    expect(useAuthStore.getState()).toMatchObject({
      status: 'AUTHENTICATED',
      accessToken: 'access-token',
      user: currentUser,
    })
  })

  it('never exposes whether an account exists when credentials are rejected', async () => {
    const user = userEvent.setup()
    authApi.login.mockRejectedValue(
      new ApiError('Account RD-404 does not exist', 401, 'AUTH_INVALID_CREDENTIALS')
    )

    renderAuthPage(<LoginPage />, { initialEntries: ['/login'] })
    await user.type(screen.getByRole('textbox', { name: '账号或工号' }), 'RD-404')
    await user.type(screen.getByLabelText('密码'), 'WrongPass123')
    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(await screen.findByText('账号或密码错误，请重新输入。')).toBeInTheDocument()
    expect(screen.queryByText(/RD-404|does not exist/i)).not.toBeInTheDocument()
  })

  it('validates first-password-change fields and submits matching strong passwords', async () => {
    const user = userEvent.setup()
    const mustChangeUser = { ...currentUser, mustChangePassword: true }
    useAuthStore.setState({
      status: 'AUTHENTICATED',
      authEpoch: 1,
      accessToken: 'access-token',
      csrfToken: 'csrf-token',
      user: mustChangeUser,
    })
    authApi.changePassword.mockResolvedValue({
      passwordChanged: true,
      sessionsRevoked: 1,
      user: currentUser,
    })

    renderAuthPage(<FirstPasswordChangePage />, {
      initialEntries: ['/change-password'],
    })

    const currentPassword = screen.getByLabelText('当前密码')
    const newPassword = screen.getByLabelText('新密码')
    const confirmation = screen.getByLabelText('确认新密码')
    expect(currentPassword).toHaveAttribute('autocomplete', 'current-password')
    expect(newPassword).toHaveAttribute('autocomplete', 'new-password')
    expect(confirmation).toHaveAttribute('autocomplete', 'new-password')

    await user.type(currentPassword, 'Temporary123')
    await user.type(newPassword, 'NewSecure123')
    await user.type(confirmation, 'NotTheSame123')
    await user.click(screen.getByRole('button', { name: '更新密码' }))
    expect(await screen.findByText('两次输入的新密码不一致')).toBeInTheDocument()
    expect(authApi.changePassword).not.toHaveBeenCalled()

    await user.clear(confirmation)
    await user.type(confirmation, 'NewSecure123')
    await user.click(screen.getByRole('button', { name: '更新密码' }))
    await waitFor(() =>
      expect(authApi.changePassword).toHaveBeenCalledWith({
        currentPassword: 'Temporary123',
        newPassword: 'NewSecure123',
      })
    )
  })

  it('renders a stable accessible forbidden page with a recovery action', () => {
    renderAuthPage(<ForbiddenPage />, { initialEntries: ['/forbidden'] })

    expect(screen.getByRole('heading', { name: '无权访问此页面' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回工作台' })).toHaveAttribute('href', '/')
  })

  it('lists personal sessions and can revoke one selected device', async () => {
    const user = userEvent.setup()
    useAuthStore.setState({
      status: 'AUTHENTICATED',
      authEpoch: 1,
      accessToken: 'access-token',
      csrfToken: 'csrf-token',
      user: currentUser,
    })
    authApi.listSessions.mockResolvedValue([
      {
        id: 'session-2',
        deviceName: 'Windows 11 · Edge',
        userAgent: 'Edge 130',
        ipAddress: '192.168.1.8',
        createdAt: '2026-07-30T08:00:00.000Z',
        lastUsedAt: '2026-07-31T08:00:00.000Z',
        expiresAt: '2026-08-06T08:00:00.000Z',
        revokedAt: null,
      },
    ])
    authApi.revokeSession.mockResolvedValue({ revoked: true })

    renderAuthPage(<PersonalSecurityPage />, {
      initialEntries: ['/settings/security'],
    })

    expect(await screen.findByText('Windows 11 · Edge')).toBeInTheDocument()
    expect(screen.getByText('192.168.1.8')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '退出全部设备' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '退出设备：Windows 11 · Edge' }))
    await waitFor(() => expect(authApi.revokeSession).toHaveBeenCalledWith('session-2'))
  })
})
