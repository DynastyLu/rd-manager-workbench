import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuditLog } from '../domain/audit-log.entity';
import type { AuditLogRepository } from '../domain/audit-log.repository';

@Injectable()
export class InMemoryAuditLogRepository implements AuditLogRepository {
  private readonly auditLogs = new Map<string, AuditLog>();

  async create(input: Omit<AuditLog, 'id' | 'createdAt'>): Promise<AuditLog> {
    const auditLog: AuditLog = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.auditLogs.set(auditLog.id, auditLog);
    return auditLog;
  }

  async list(): Promise<AuditLog[]> {
    return Array.from(this.auditLogs.values());
  }
}
