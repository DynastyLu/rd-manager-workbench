import { Injectable } from '@nestjs/common';
import type { RequestContext } from '../../../../shared/kernel/request-context';
import { requireTrustedTenantContext } from '../../../iam/policy/application/require-trusted-tenant-context';
import type { AuditLogRepository } from '../domain/audit-log.repository';

export interface RecordAuditLogInput {
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class RecordAuditLogUseCase {
  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  async execute(input: RecordAuditLogInput, context: RequestContext) {
    const requestContext =
      context.requestScope === 'tenant' ? requireTrustedTenantContext(context) : context;

    return this.auditLogRepository.create({
      traceId: requestContext.traceId,
      requestScope: requestContext.requestScope,
      tenantId: requestContext.tenantId,
      tenantKey: requestContext.tenantKey,
      operatorId: requestContext.operatorId,
      operatorType: requestContext.operatorType,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      details: input.details,
    });
  }
}
