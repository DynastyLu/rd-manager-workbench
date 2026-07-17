import { useAuthStore } from '@/stores/auth'
import { ROLES, PERMISSIONS, ROLE_PERMISSIONS, isAdmin, isAuthenticated } from '@/constants/roles'
import type { Role, Permission } from '@/constants/roles'

/**
 * Check if the current user has a specific permission.
 *
 * Example:
 *   const canUpload = usePermission('ocr:upload')
 */
export function usePermission(permission: Permission): boolean {
  const user = useAuthStore((s) => s.user)
  if (!user) return false
  const role = user.role
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

/**
 * Check multiple permissions at once.
 */
export function usePermissions(permissions: Permission[]): Record<Permission, boolean> {
  const user = useAuthStore((s) => s.user)
  const role = user?.role
  const rolePerms = role ? (ROLE_PERMISSIONS[role] ?? []) : []
  return Object.fromEntries(permissions.map((p) => [p, rolePerms.includes(p)])) as Record<
    Permission,
    boolean
  >
}

/**
 * Check if current user has a specific role.
 */
export function useHasRole(role: Role): boolean {
  const user = useAuthStore((s) => s.user)
  return user?.role === role
}

/**
 * Legacy-compatible hook for components still using the old API.
 * @deprecated Use usePermission / useHasRole instead.
 */
export function usePermissionLegacy() {
  const user = useAuthStore((s) => s.user)
  return {
    user,
    authenticated: isAuthenticated(user),
    admin: isAdmin(user),
    hasRole: (role: string) => user?.role === role,
    can: (role: string) => user?.role === role,
    ROLES,
    PERMISSIONS,
  }
}
