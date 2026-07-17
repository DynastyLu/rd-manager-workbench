import { create } from 'zustand'
import { configureRequest } from '@/lib/request'
import type { UserInfo } from '@/types/user'

interface AuthState {
  user: UserInfo | null
  accessToken: string | null
  isLoading: boolean
  setAuth: (user: UserInfo, token: string) => void
  clearAuth: () => void
  setLoading: (loading: boolean) => void
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshAccessToken: () => Promise<string | null>
}

// Module-level deduplication ref (equivalent to refreshPromiseRef in AuthContext)
let _refreshPromise: Promise<string | null> | null = null

const BACKEND_UNAVAILABLE_STATUSES = new Set([502, 503, 504])

async function readJsonOrNull<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  accessToken: null,
  isLoading: true,

  setAuth: (user, accessToken) => set({ user, accessToken }),
  clearAuth: () => set({ user: null, accessToken: null }),
  setLoading: (isLoading) => set({ isLoading }),

  login: async (username, password) => {
    let res: Response
    try {
      res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
    } catch {
      throw new Error('BACKEND_UNAVAILABLE')
    }

    const data = await readJsonOrNull<{ accessToken: string; user: UserInfo; error?: string }>(res)
    if (!res.ok) {
      if (BACKEND_UNAVAILABLE_STATUSES.has(res.status)) throw new Error('BACKEND_UNAVAILABLE')
      if (res.status === 401) throw new Error('INVALID_CREDENTIALS')
      throw new Error(data?.error ?? 'LOGIN_FAILED')
    }
    if (!data?.accessToken || !data.user) throw new Error('LOGIN_FAILED')
    set({ user: data.user, accessToken: data.accessToken })
  },

  logout: async () => {
    const { accessToken } = get()
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    })
    set({ user: null, accessToken: null })
  },

  refreshAccessToken: async () => {
    if (_refreshPromise) return _refreshPromise
    _refreshPromise = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
        if (!res.ok) {
          set({ user: null, accessToken: null })
          return null
        }
        const { accessToken: token } = (await res.json()) as { accessToken: string }
        set({ accessToken: token })
        const meRes = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (meRes.ok) set({ user: (await meRes.json()) as UserInfo })
        return token
      } finally {
        _refreshPromise = null
      }
    })()
    return _refreshPromise
  },
}))

// Wire up request layer once — getters always read latest store state
configureRequest({
  getToken: () => useAuthStore.getState().accessToken,
  refresh: () => useAuthStore.getState().refreshAccessToken(),
})

// 注意：刻意不使用 persist 中间件，accessToken 不落盘（XSS 防护）
