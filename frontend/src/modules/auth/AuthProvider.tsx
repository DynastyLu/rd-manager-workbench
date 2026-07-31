import { useEffect, useRef, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { getCsrfToken, getMe, refreshSession } from '@/modules/auth/api'
import { useAuthStore } from '@/modules/auth/store'
import { subscribeToNotifications } from '@/modules/workbench/realtime/notificationSocket'

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient()
  const status = useAuthStore((state) => state.status)
  const userId = useAuthStore((state) => state.user?.id)
  const previousIdentity = useRef<string | undefined>(undefined)

  useEffect(() => {
    let active = true

    async function bootstrapSession() {
      try {
        const { csrfToken } = await getCsrfToken()
        const session = await refreshSession(csrfToken)
        if (active) useAuthStore.getState().setSession(session)
      } catch {
        if (active) useAuthStore.getState().clearSession()
      }
    }

    void bootstrapSession()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (status === 'BOOTSTRAPPING') return

    const identity = status === 'AUTHENTICATED' ? userId : undefined
    if (previousIdentity.current !== identity && previousIdentity.current !== undefined) {
      queryClient.clear()
    }
    previousIdentity.current = identity
  }, [queryClient, status, userId])

  useEffect(() => {
    if (status !== 'AUTHENTICATED' || !userId) return

    let active = true

    const cleanup = subscribeToNotifications({
      onPermissionChange: () => {
        if (!active) return
        void getMe()
          .then((user) => {
            if (!active) return
            useAuthStore.getState().updateUser(user)
            void queryClient.invalidateQueries()
          })
          .catch(() => {
            /* invalidation will be handled by the failing request */
          })
      },
      onSessionRevoked: () => {
        if (!active) return
        useAuthStore.getState().clearSession()
        queryClient.clear()
      },
    })

    return () => {
      active = false
      cleanup()
    }
  }, [queryClient, status, userId])

  if (status === 'BOOTSTRAPPING') {
    return (
      <div
        className="min-h-screen bg-[var(--semi-color-bg-0)]"
        aria-busy="true"
        aria-label="正在恢复会话"
      />
    )
  }
  return children
}
