import type { DataScope } from '@/modules/auth/types'

export type UserStatus = 'PENDING' | 'ACTIVE' | 'DISABLED' | 'LOCKED'

export interface PageMeta {
  page: number
  pageSize: number
  total: number
}

export interface PageResult<T> {
  data: T[]
  meta: PageMeta
}

export interface ResourceProfileSummary {
  id: string
  displayName: string
  department: string | null
  roleTitle: string | null
  employmentStatus: string
  archivedAt: string | null
}

export interface AssignableEmployee {
  id: string
  displayName: string
  employeeNo?: string
  department?: string | null
  roleTitle?: string | null
}

export interface RoleSummary {
  id: string
  code: string
  name: string
  isSystem: boolean
  isEnabled: boolean
}

export interface AdminUser {
  id: string
  username: string
  employeeNo: string | null
  status: UserStatus
  mustChangePassword: boolean
  failedLoginCount: number
  lockedUntil: string | null
  passwordChangedAt: string | null
  lastLoginAt: string | null
  permissionVersion: number
  resourceProfileId: string
  resourceProfile: ResourceProfileSummary
  roles: RoleSummary[]
  createdAt: string
  updatedAt: string
}

export interface CreateUserInput {
  resourceProfileId: string
  username: string
  employeeNo?: string
  roleIds: string[]
  temporaryPassword: string
}

export interface UpdateUserInput {
  username?: string
  employeeNo?: string | null
  roleIds?: string[]
}

export interface ResetPasswordInput {
  temporaryPassword: string
}

export interface DeleteUserInput {
  confirmNoOwnershipReferences: boolean
}

export interface PermissionCatalogEntry {
  id: string
  code: string
  module: string
  resource: string
  action: string
  description: string
  isSensitive: boolean
}

export interface RolePermission extends PermissionCatalogEntry {
  dataScope: DataScope
  scopeConfig: Record<string, unknown> | null
}

export interface Role {
  id: string
  code: string
  name: string
  description: string | null
  isSystem: boolean
  isEnabled: boolean
  userCount: number
  permissions: RolePermission[]
  createdAt: string
  updatedAt: string
}

export interface CreateRoleInput {
  code: string
  name: string
  description?: string | null
  isEnabled?: boolean
  permissions?: PermissionGrantInput[]
}

export interface UpdateRoleInput {
  name?: string
  description?: string | null
  isEnabled?: boolean
}

export interface CopyRoleInput {
  code: string
  name: string
  description?: string | null
}

export interface PermissionGrantInput {
  permissionCode: string
  dataScope: DataScope
  scopeConfig?: Record<string, unknown> | null
}

export interface SecurityAuditEvent {
  id: string
  userId: string | null
  username: string | null
  eventType: string
  success: boolean
  failureReason: string | null
  ipAddress: string | null
  userAgent: string | null
  sessionId: string | null
  occurredAt: string
}

export interface ListUsersQuery {
  page?: number
  pageSize?: number
  search?: string
  status?: UserStatus
  department?: string
  roleId?: string
  [key: string]: string | number | boolean | undefined
}

export interface ListAuditsQuery {
  page?: number
  pageSize?: number
  userId?: string
  username?: string
  eventType?: string
  success?: boolean
  from?: string
  to?: string
  [key: string]: string | number | boolean | undefined
}

export type OwnershipConfidence = 'EXACT' | 'UNIQUE_NAME' | 'AMBIGUOUS' | 'MISSING'

export interface OwnershipMigrationUserSuggestion {
  id: string
  username: string
  displayName: string
}

export interface OwnershipMigrationRecord {
  id: string
  module: string
  recordType: string
  recordId: string
  title: string
  legacyOwner: string
  confidence: OwnershipConfidence
  suggestedUser: OwnershipMigrationUserSuggestion | null
}

export interface OwnershipMigrationStatus {
  startedAt: string | null
  lastAnalyzedAt: string | null
  lastAppliedAt: string | null
  completedAt: string | null
  total: number
  assigned: number
  needsReview: number
  isComplete: boolean
}

export interface AnalyzeOwnershipMigrationResponse {
  cursor: string | null
  items: OwnershipMigrationRecord[]
}

export interface ApplyOwnershipMigrationResponse {
  appliedCount: number
  unresolvedCount: number
}

export interface BulkOwnershipAssignment {
  recordType: string
  recordId: string
  ownerUserId: string
}
