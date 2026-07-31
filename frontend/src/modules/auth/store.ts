import { create } from 'zustand'

import type { AuthStatus, CurrentUser, LoginResponse } from '@/modules/auth/types'

interface AuthState {
  status: AuthStatus
  authEpoch: number
  accessToken?: string
  csrfToken?: string
  user?: CurrentUser
  setSession: (session: LoginResponse) => void
  applyRefresh: (
    session: LoginResponse,
    expected: {
      authEpoch: number
      accessToken?: string
      userId?: string
    }
  ) => boolean
  clearSession: () => void
  clearSessionIfEpoch: (authEpoch: number) => void
  updateUser: (user: CurrentUser) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'BOOTSTRAPPING',
  authEpoch: 0,
  accessToken: undefined,
  csrfToken: undefined,
  user: undefined,
  setSession: (session) =>
    set((state) => ({
      status: 'AUTHENTICATED',
      authEpoch: state.authEpoch + 1,
      accessToken: session.accessToken,
      csrfToken: session.csrfToken,
      user: session.user,
    })),
  applyRefresh: (session, expected) => {
    let applied = false
    set((state) => {
      if (
        state.authEpoch !== expected.authEpoch ||
        state.accessToken !== expected.accessToken ||
        state.user?.id !== expected.userId ||
        session.user.id !== expected.userId
      ) {
        return state
      }
      applied = true
      return {
        ...state,
        status: 'AUTHENTICATED',
        accessToken: session.accessToken,
        csrfToken: session.csrfToken,
        user: session.user,
      }
    })
    return applied
  },
  clearSession: () =>
    set((state) => ({
      status: 'ANONYMOUS',
      authEpoch: state.authEpoch + 1,
      accessToken: undefined,
      csrfToken: undefined,
      user: undefined,
    })),
  clearSessionIfEpoch: (authEpoch) =>
    set((state) =>
      state.authEpoch === authEpoch
        ? {
            status: 'ANONYMOUS',
            authEpoch: state.authEpoch + 1,
            accessToken: undefined,
            csrfToken: undefined,
            user: undefined,
          }
        : state
    ),
  updateUser: (user) =>
    set((state) => ({
      ...state,
      user,
    })),
}))
