import type { AuditLog } from './audit-log.entity';

export const AUDIT_LOG_REPOSITORY = 'AUDIT_LOG_REPOSITORY';

export interface AuditLogRepository {
  create(input: Omit<AuditLog, 'id' | 'createdAt'>): Promise<AuditLog>;
  list(): Promise<AuditLog[]>;
}
