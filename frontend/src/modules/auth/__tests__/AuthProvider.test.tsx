import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '@/modules/auth/AuthProvider'
import { useAuthStore } from '@/modules/auth/store'
import type { CurrentUser, LoginResponse } from '@/modules/auth/types'

const { getCsrfToken, refreshSession } = vi.hoisted(() => ({
  getCsrfToken: vi.fn(),
  refreshSession: vi.fn(),
}))

vi.mock('@/modules/auth/api', () => ({
  getCsrfToken,
  refreshSession,
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

describe('AuthProvider', () => {
  beforeEach(() => {
    getCsrfToken.mockReset()
    refreshSession.mockReset()
    useAuthStore.setState({
      status: 'BOOTSTRAPPING',
      authEpoch: 0,
      accessToken: undefined,
      csrfToken: undefined,
      user: undefined,
    })
  })

  it('fetches CSRF before refreshing and keeps children hidden until bootstrap finishes', async () => {
    let resolveRefresh: ((value: LoginResponse) => void) | undefined
    const pendingRefresh = new Promise<LoginResponse>((resolve) => {
      resolveRefresh = resolve
    })
    getCsrfToken.mockResolvedValue({ csrfToken: 'csrf-bootstrap' })
    refreshSession.mockReturnValue(pendingRefresh)
    const queryClient = new QueryClient()

    renderProvider(queryClient)

    expect(screen.queryByText('受保护的工作台')).not.toBeInTheDocument()
    await waitFor(() => expect(getCsrfToken).toHaveBeenCalledTimes(1))
    expect(refreshSession).toHaveBeenCalledWith('csrf-bootstrap')

    await act(async () => {
      resolveRefresh?.(session)
      await pendingRefresh
    })

    expect(await screen.findByText('受保护的工作台')).toBeInTheDocument()
    expect(useAuthStore.getState()).toMatchObject({
      status: 'AUTHENTICATED',
      accessToken: 'access-token-1',
      csrfToken: 'csrf-token-rotated',
      user: firstUser,
    })
  })

  it('becomes anonymous when startup refresh cannot restore a session', async () => {
    getCsrfToken.mockResolvedValue({ csrfToken: 'csrf-bootstrap' })
    refreshSession.mockRejectedValue(new Error('refresh cookie is unavailable'))
    const queryClient = new QueryClient()

    renderProvider(queryClient)

    expect(await screen.findByText('受保护的工作台')).toBeInTheDocument()
    expect(useAuthStore.getState()).toMatchObject({
      status: 'ANONYMOUS',
      accessToken: undefined,
      csrfToken: undefined,
      user: undefined,
    })
  })

  it('clears user-bound query data when the authenticated identity changes or logs out', async () => {
    getCsrfToken.mockResolvedValue({ csrfToken: 'csrf-bootstrap' })
    refreshSession.mockResolvedValue(session)
    const queryClient = new QueryClient()
    const clear = vi.spyOn(queryClient, 'clear')

    renderProvider(queryClient)
    expect(await screen.findByText('受保护的工作台')).toBeInTheDocument()
    clear.mockClear()

    act(() => {
      useAuthStore.getState().setSession({
        ...session,
        accessToken: 'access-token-2',
        user: {
          ...firstUser,
          id: 'user-2',
          username: 'employee',
          resourceProfileId: 'employee-2',
          displayName: '普通员工',
          roleCodes: ['EMPLOYEE'],
        },
      })
    })
    await waitFor(() => expect(clear).toHaveBeenCalledTimes(1))

    act(() => {
      useAuthStore.getState().clearSession()
    })
    await waitFor(() => expect(clear).toHaveBeenCalledTimes(2))
  })
})
