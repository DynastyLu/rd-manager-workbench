import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/modules/auth/store'
import type { CurrentUser, LoginResponse } from '@/modules/auth/types'

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
  csrfToken: 'csrf-token-1',
  user: firstUser,
  mustChangePassword: false,
}

describe('authentication store', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'BOOTSTRAPPING',
      authEpoch: 0,
      accessToken: undefined,
      csrfToken: undefined,
      user: undefined,
    })
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('keeps access and CSRF tokens only in memory', () => {
    const localStorageWrite = vi.spyOn(Storage.prototype, 'setItem')

    useAuthStore.getState().setSession(session)

    expect(useAuthStore.getState()).toMatchObject({
      status: 'AUTHENTICATED',
      accessToken: 'access-token-1',
      csrfToken: 'csrf-token-1',
      user: firstUser,
    })
    expect(localStorageWrite).not.toHaveBeenCalled()
    expect(Object.values(localStorage)).not.toContain('access-token-1')
    expect(Object.values(sessionStorage)).not.toContain('access-token-1')
  })

  it('updates the current user without replacing the active tokens', () => {
    useAuthStore.getState().setSession(session)
    const updatedUser: CurrentUser = {
      ...firstUser,
      displayName: '研发管理员',
      permissionVersion: 2,
    }

    useAuthStore.getState().updateUser(updatedUser)

    expect(useAuthStore.getState()).toMatchObject({
      status: 'AUTHENTICATED',
      accessToken: 'access-token-1',
      csrfToken: 'csrf-token-1',
      user: updatedUser,
    })
  })

  it('removes all session material when the session is cleared', () => {
    useAuthStore.getState().setSession(session)

    useAuthStore.getState().clearSession()

    expect(useAuthStore.getState()).toMatchObject({
      status: 'ANONYMOUS',
      accessToken: undefined,
      csrfToken: undefined,
      user: undefined,
    })
  })
})
