import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAuthStore } from '../auth'

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, isLoading: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('has correct initial state', () => {
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.accessToken).toBeNull()
    expect(state.isLoading).toBe(true)
  })

  it('setAuth updates user and token', () => {
    const mockUser = { id: '1', username: 'testuser', role: 'user' as const }
    useAuthStore.getState().setAuth(mockUser, 'access-token-123')
    const state = useAuthStore.getState()
    expect(state.user).toEqual(mockUser)
    expect(state.accessToken).toBe('access-token-123')
  })

  it('clearAuth resets user and token to null', () => {
    useAuthStore.getState().setAuth({ id: '1', username: 'test', role: 'user' as const }, 'token')
    useAuthStore.getState().clearAuth()
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.accessToken).toBeNull()
  })

  it('setLoading updates isLoading', () => {
    useAuthStore.getState().setLoading(false)
    expect(useAuthStore.getState().isLoading).toBe(false)
  })

  it('accessToken is NOT persisted to localStorage (XSS protection)', () => {
    useAuthStore.getState().setAuth({ id: '1', username: 'test', role: 'admin' as const }, 'secret')
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        const value = localStorage.getItem(key) ?? ''
        expect(value).not.toContain('secret')
      }
    }
  })

  it('reports backend availability instead of credentials when login receives a proxy failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('Bad Gateway', { status: 502, statusText: 'Bad Gateway' }))
    )

    await expect(useAuthStore.getState().login('admin', 'changeme123')).rejects.toThrow(
      'BACKEND_UNAVAILABLE'
    )
  })
})
