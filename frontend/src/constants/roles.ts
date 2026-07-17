/** User role constants */
export const ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  GUEST: 'guest',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

/** Fine-grained permission points */
export const PERMISSIONS = {
  OCR_UPLOAD: 'ocr:upload',
  OCR_EXPORT: 'ocr:export',
  HISTORY_VIEW: 'history:view',
  HISTORY_DELETE: 'history:delete',
  ADMIN_USERS: 'admin:users',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

/** Role → Permission mapping */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: Object.values(PERMISSIONS) as Permission[],
  user: ['ocr:upload', 'ocr:export', 'history:view'],
  guest: [],
}

/** Helper predicates (preserved from original roles.js) */
export const isAdmin = (user: { role: Role } | null | undefined): boolean =>
  user?.role === ROLES.ADMIN
export const isAuthenticated = (user: unknown): boolean => !!user
