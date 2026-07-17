import type { ReactNode } from 'react'
import { usePermission } from '@/hooks/usePermission'
import type { Permission } from '@/constants/roles'

interface Props {
  permission: Permission
  fallback?: ReactNode
  children: ReactNode
}

/**
 * Renders children only if the current user has the required permission.
 * Shows fallback (default: null) when permission is denied.
 *
 * Example:
 *   <PermissionGate permission="admin:users">
 *     <AdminPanel />
 *   </PermissionGate>
 */
export function PermissionGate({ permission, fallback = null, children }: Props) {
  const allowed = usePermission(permission)
  return <>{allowed ? children : fallback}</>
}
