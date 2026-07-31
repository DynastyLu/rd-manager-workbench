import type { ReactNode } from 'react'

import { useAuthStore } from '@/modules/auth/store'

interface PermissionProps {
  code: string
  children: ReactNode
  fallback?: ReactNode
}

export function Permission({ children, code, fallback = null }: PermissionProps) {
  const allowed = useAuthStore((state) => {
    const user = state.user
    if (!user) return false
    if (user.roleCodes.includes('SUPER_ADMIN')) return true
    return user.permissions.some((permission) => permission.code === code)
  })

  return allowed ? children : fallback
}

