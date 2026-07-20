import { request } from '@/lib/http'

export type BackupKind = 'MANUAL' | 'SCHEDULED' | 'PRE_RESTORE'
export type BackupStatus =
  | 'CREATING'
  | 'CREATED'
  | 'VERIFIED'
  | 'RESTORING'
  | 'RESTORED'
  | 'FAILED'

export interface GovernanceSettings {
  autoBackupEnabled: boolean
  autoBackupTimeLocal: string
  retentionDays: number
  lastAutoBackupLocalDate: string | null
}

export interface BackupRecord {
  id: string
  kind: BackupKind
  status: BackupStatus
  fileCount: number
  byteSize: number
  failureCode?: string | null
  failureMessage?: string | null
  createdAt: string
  verifiedAt?: string | null
  restoredAt?: string | null
}

export interface BackupList {
  data: BackupRecord[]
  meta: { page: number; pageSize: number; total: number }
}

export interface RestorePreflight {
  id: string
  backupId: string
  manifestSha256: string
  confirmationToken: string
  expiresAt: string
  warnings: string[]
  summary: { fileCount?: number; byteSize?: number; [key: string]: unknown }
}

export type HealthCheckStatus = 'PASS' | 'WARN' | 'FAIL'

export interface DataHealthReport {
  status: 'HEALTHY' | 'WARNING' | 'UNHEALTHY'
  checkedAt: string
  checks: Array<{ key: string; label: string; status: HealthCheckStatus; detail: string }>
}

export interface AuditLog {
  id: string
  action: string
  entityType: string
  entityId: string | null
  outcome: 'SUCCEEDED' | 'FAILED'
  changedFields: string[]
  metadata: Record<string, unknown>
  occurredAt: string
}

export interface AuditLogQuery {
  action?: string
  entityType?: string
  outcome?: AuditLog['outcome']
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

function queryString(params: object) {
  const search = new URLSearchParams()
  Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
    if ((typeof value === 'string' && value !== '') || typeof value === 'number') {
      search.set(key, String(value))
    }
  })
  const value = search.toString()
  return value ? `?${value}` : ''
}

export function getGovernanceSettings(): Promise<GovernanceSettings> {
  return request('/governance/settings')
}

export function updateGovernanceSettings(
  input: Partial<GovernanceSettings>,
): Promise<GovernanceSettings> {
  return request('/governance/settings', { method: 'PATCH', body: JSON.stringify(input) })
}

export function listBackups(page = 1, pageSize = 20): Promise<BackupList> {
  return request(`/governance/backups${queryString({ page, pageSize })}`)
}

export function createBackup(): Promise<BackupRecord> {
  return request('/governance/backups', { method: 'POST' })
}

export function verifyBackup(id: string): Promise<BackupRecord> {
  return request(`/governance/backups/${encodeURIComponent(id)}/verify`, { method: 'POST' })
}

export function deleteBackup(id: string): Promise<void> {
  return request(`/governance/backups/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function createRestorePreflight(id: string): Promise<RestorePreflight> {
  return request(`/governance/backups/${encodeURIComponent(id)}/preflight`, { method: 'POST' })
}

export function getDataHealth(deep = false): Promise<DataHealthReport> {
  return request(`/governance/health${queryString({ deep: deep ? 'true' : undefined })}`)
}

export function listAuditLogs(params: AuditLogQuery = {}): Promise<{
  data: AuditLog[]
  meta: { page: number; pageSize: number; total: number }
}> {
  return request(`/governance/audit-logs${queryString(params)}`)
}
