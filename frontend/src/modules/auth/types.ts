export type AuthStatus = 'BOOTSTRAPPING' | 'AUTHENTICATED' | 'ANONYMOUS'

export type DataScope = 'SELF' | 'INVOLVED' | 'DEPARTMENT' | 'PROJECT' | 'ALL'

export interface PermissionGrant {
  code: string
  dataScope: DataScope
  scopeConfig?: Record<string, unknown> | null
}

export interface CurrentUser {
  id: string
  username: string
  employeeNo?: string | null
  status: string
  mustChangePassword: boolean
  permissionVersion: number
  resourceProfileId: string
  displayName: string
  department?: string | null
  roleTitle?: string | null
  roleCodes: string[]
  permissions: PermissionGrant[]
}

export interface LoginResponse {
  accessToken: string
  csrfToken: string
  user: CurrentUser
  mustChangePassword: boolean
}

export type ConnectionTicketAudience = 'knowledge-sse' | 'notification-socket'

export interface ConnectionTicketResponse {
  ticket: string
}

export interface CsrfResponse {
  csrfToken: string
}

export interface LoginInput {
  identifier: string
  password: string
  rememberMe: boolean
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

export interface ChangePasswordResponse {
  passwordChanged: boolean
  sessionsRevoked: number
  user: CurrentUser
}

export interface AuthSession {
  id: string
  deviceName?: string | null
  userAgent?: string | null
  ipAddress?: string | null
  createdAt?: string
  lastUsedAt: string
  expiresAt: string
  revokedAt?: string | null
}
