export interface AuditLog {
  id: string;
  traceId: string;
  requestScope: 'platform' | 'tenant';
  tenantId?: string;
  tenantKey?: string;
  operatorId?: string;
  operatorType?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}
