import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { configureRequest } from '@/lib/request'
import { useAuthStore } from '@/stores/auth'
import type { UserInfo } from '@/types/user'

interface Props {
  children: ReactNode
}

export function AuthProvider({ children }: Props) {
  const { setAuth, clearAuth, setLoading } = useAuthStore()
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null)

  async function refreshAccessToken(): Promise<string | null> {
    // 并发 refresh 去重：多个 401 同时触发时只发一次 refresh 请求
    if (refreshPromiseRef.current) return refreshPromiseRef.current
    refreshPromiseRef.current = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
        if (!res.ok) {
          clearAuth()
          return null
        }
        const { accessToken: newToken } = (await res.json()) as { accessToken: string }
        const meRes = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${newToken}` },
        })
        if (meRes.ok) {
          const user = (await meRes.json()) as UserInfo
          setAuth(user, newToken)
        }
        return newToken
      } finally {
        refreshPromiseRef.current = null
      }
    })()
    return refreshPromiseRef.current
  }

  // 每当 accessToken 变化时，重新配置请求层
  const accessToken = useAuthStore((s) => s.accessToken)
  useEffect(() => {
    configureRequest({
      getToken: () => useAuthStore.getState().accessToken,
      refresh: refreshAccessToken,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  // 初始化时尝试从 httpOnly Cookie 恢复会话
  useEffect(() => {
    void refreshAccessToken().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <>{children}</>
}
