import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '@/modules/auth/AuthProvider'
import { useAuthStore } from '@/modules/auth/store'
import type { CurrentUser, LoginResponse } from '@/modules/auth/types'

const { getCsrfToken, refreshSession, getMe, subscribeToNotifications } = vi.hoisted(() => ({
  getCsrfToken: vi.fn(),
  refreshSession: vi.fn(),
  getMe: vi.fn(),
  subscribeToNotifications: vi.fn(),
}))

vi.mock('@/modules/auth/api', () => ({
  getCsrfToken,
  refreshSession,
  getMe,
}))

vi.mock('@/modules/workbench/realtime/notificationSocket', () => ({
  subscribeToNotifications,
}))

const firstUser: CurrentUser = {
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
  permissions: [{ code: 'project.read', dataScope: 'ALL', scopeConfig: null }],
}

const refreshedUser: CurrentUser = {
  ...firstUser,
  permissionVersion: 2,
  permissions: [
    { code: 'project.read', dataScope: 'ALL', scopeConfig: null },
    { code: 'user.read', dataScope: 'ALL', scopeConfig: null },
  ],
}

const session: LoginResponse = {
  accessToken: 'access-token-1',
  csrfToken: 'csrf-token-rotated',
  user: firstUser,
  mustChangePassword: false,
}

function renderProvider(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <div>受保护的工作台</div>
      </AuthProvider>
    </QueryClientProvider>
  )
}

describe('AuthProvider permission sync', () => {
  let capturedHandlers: Record<string, (() => void) | undefined> = {}

  beforeEach(() => {
    getCsrfToken.mockReset()
    refreshSession.mockReset()
    getMe.mockReset()
    subscribeToNotifications.mockReset()
    capturedHandlers = {}
    subscribeToNotifications.mockImplementation((handlers) => {
      capturedHandlers = {
        onPermissionChange: handlers.onPermissionChange,
        onSessionRevoked: handlers.onSessionRevoked,
      }
      return vi.fn()
    })
    useAuthStore.setState({
      status: 'BOOTSTRAPPING',
      authEpoch: 0,
      accessToken: undefined,
      csrfToken: undefined,
      user: undefined,
    })
  })

  it('refetches /auth/me and invalidates queries when auth.permissions.changed arrives', async () => {
    getCsrfToken.mockResolvedValue({ csrfToken: 'csrf-bootstrap' })
    refreshSession.mockResolvedValue(session)
    getMe.mockResolvedValue(refreshedUser)
    const queryClient = new QueryClient()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')

    renderProvider(queryClient)
    expect(await screen.findByText('受保护的工作台')).toBeInTheDocument()

    act(() => {
      capturedHandlers.onPermissionChange?.()
    })

    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(1))
    expect(useAuthStore.getState().user).toMatchObject({
      id: refreshedUser.id,
      permissionVersion: refreshedUser.permissionVersion,
    })
    expect(invalidateQueries).toHaveBeenCalled()
  })

  it('clears the session and query cache when auth.session.revoked arrives', async () => {
    getCsrfToken.mockResolvedValue({ csrfToken: 'csrf-bootstrap' })
    refreshSession.mockResolvedValue(session)
    const queryClient = new QueryClient()
    const clear = vi.spyOn(queryClient, 'clear')

    renderProvider(queryClient)
    expect(await screen.findByText('受保护的工作台')).toBeInTheDocument()
    expect(useAuthStore.getState().status).toBe('AUTHENTICATED')

    act(() => {
      capturedHandlers.onSessionRevoked?.()
    })

    await waitFor(() => expect(useAuthStore.getState().status).toBe('ANONYMOUS'))
    expect(clear).toHaveBeenCalled()
  })

  it('subscribes to live auth events only while authenticated', async () => {
    getCsrfToken.mockResolvedValue({ csrfToken: 'csrf-bootstrap' })
    refreshSession.mockResolvedValue(session)

    renderProvider(new QueryClient())
    expect(await screen.findByText('受保护的工作台')).toBeInTheDocument()

    expect(subscribeToNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        onPermissionChange: expect.any(Function),
        onSessionRevoked: expect.any(Function),
      })
    )
  })
})
