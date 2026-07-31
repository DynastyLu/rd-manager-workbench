import { request } from '@/lib/http'
import type {
  AdminUser,
  AssignableEmployee,
  BulkOwnershipAssignment,
  CopyRoleInput,
  CreateRoleInput,
  CreateUserInput,
  DeleteUserInput,
  ListAuditsQuery,
  ListUsersQuery,
  OwnershipMigrationStatus,
  OwnershipMigrationRecord,
  PageResult,
  PermissionCatalogEntry,
  PermissionGrantInput,
  ResetPasswordInput,
  Role,
  SecurityAuditEvent,
  UpdateRoleInput,
  UpdateUserInput,
} from './types'

function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    query.set(key, String(value))
  }
  const rendered = query.toString()
  return rendered ? `?${rendered}` : ''
}

function userPath(userId: string): string {
  return `/admin/users/${encodeURIComponent(userId)}`
}

function rolePath(roleId: string): string {
  return `/admin/roles/${encodeURIComponent(roleId)}`
}

export function listUsers(query: ListUsersQuery = {}): Promise<PageResult<AdminUser>> {
  return request(`/admin/users${queryString(query)}`)
}

export function listAssignableEmployees(): Promise<AssignableEmployee[]> {
  return request('/admin/users/assignable-employees')
}

export function createUser(input: CreateUserInput): Promise<AdminUser> {
  return request('/admin/users', { method: 'POST', body: JSON.stringify(input) })
}

export function getUser(userId: string): Promise<AdminUser> {
  return request(userPath(userId))
}

export function updateUser(userId: string, input: UpdateUserInput): Promise<AdminUser> {
  return request(userPath(userId), { method: 'PATCH', body: JSON.stringify(input) })
}

export function enableUser(userId: string): Promise<AdminUser> {
  return request(`${userPath(userId)}/enable`, { method: 'POST' })
}

export function disableUser(userId: string): Promise<AdminUser & { sessionsRevoked: number }> {
  return request(`${userPath(userId)}/disable`, { method: 'POST' })
}

export function resetUserPassword(
  userId: string,
  temporaryPassword: string
): Promise<AdminUser & { sessionsRevoked: number }> {
  return resetPassword(userId, { temporaryPassword })
}

export function resetPassword(
  userId: string,
  input: ResetPasswordInput
): Promise<AdminUser & { sessionsRevoked: number }> {
  return request(`${userPath(userId)}/reset-password`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function revokeUserSessions(userId: string): Promise<{ sessionsRevoked: number }> {
  return request(`${userPath(userId)}/revoke-sessions`, { method: 'POST' })
}

export function deleteUser(
  userId: string,
  input: DeleteUserInput
): Promise<{ id: string; deleted: true; resourceProfileId: string }> {
  return request(userPath(userId), { method: 'DELETE', body: JSON.stringify(input) })
}

export function listRoles(): Promise<Role[]> {
  return request('/admin/roles')
}

export function createRole(input: CreateRoleInput): Promise<Role> {
  return request('/admin/roles', { method: 'POST', body: JSON.stringify(input) })
}

export function copyRole(roleId: string, input: CopyRoleInput): Promise<Role> {
  return request(`${rolePath(roleId)}/copy`, { method: 'POST', body: JSON.stringify(input) })
}

export function updateRole(roleId: string, input: UpdateRoleInput): Promise<Role> {
  return request(rolePath(roleId), { method: 'PATCH', body: JSON.stringify(input) })
}

export function replaceRolePermissions(
  roleId: string,
  permissions: PermissionGrantInput[]
): Promise<Role> {
  return request(`${rolePath(roleId)}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permissions }),
  })
}

export function deleteRole(roleId: string): Promise<{ deleted: true }> {
  return request(rolePath(roleId), { method: 'DELETE' })
}

export function listPermissions(): Promise<PermissionCatalogEntry[]> {
  return request('/admin/permissions')
}

export function listSecurityAudits(query: ListAuditsQuery = {}): Promise<PageResult<SecurityAuditEvent>> {
  return request(`/admin/security-audits${queryString(query)}`)
}

export function getOwnershipMigrationStatus(): Promise<OwnershipMigrationStatus> {
  return request('/admin/ownership-migration/status')
}

export function analyzeOwnershipMigration(
  cursor?: string,
  batchSize?: number,
): Promise<{ cursor: string | null; items: OwnershipMigrationRecord[] }> {
  return request('/admin/ownership-migration/analyze', {
    method: 'POST',
    body: JSON.stringify({ cursor, batchSize }),
  })
}

export function applyOwnershipMigration(
  idempotencyKey: string,
): Promise<{ appliedCount: number; unresolvedCount: number }> {
  return request('/admin/ownership-migration/apply', {
    method: 'POST',
    body: JSON.stringify({ idempotencyKey }),
  })
}

export function listUnresolvedOwnership(
  cursor?: string,
  batchSize?: number,
): Promise<{ cursor: string | null; items: OwnershipMigrationRecord[] }> {
  return request(`/admin/ownership-migration/unresolved${queryString({ cursor, batchSize })}`)
}

export function bulkAssignOwnership(
  assignments: BulkOwnershipAssignment[],
): Promise<{ updatedCount: number }> {
  return request('/admin/ownership-migration/assignments', {
    method: 'PUT',
    body: JSON.stringify({ assignments }),
  })
}

export function completeOwnershipMigration(): Promise<{ completed: boolean }> {
  return request('/admin/ownership-migration/complete', { method: 'POST' })
}
