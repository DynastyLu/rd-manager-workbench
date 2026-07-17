import { Injectable } from '@nestjs/common';
import type { RequestContext } from '../../../../shared/kernel/request-context';
import { requireTrustedTenantContext } from '../../../iam/policy/application/require-trusted-tenant-context';
import type { AuditLogRepository } from '../domain/audit-log.repository';

@Injectable()
export class ListAuditLogsUseCase {
  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  async execute(context: RequestContext) {
    const auditLogs = await this.auditLogRepository.list();

    if (context.requestScope === 'tenant') {
      const trustedContext = requireTrustedTenantContext(context as never);
      return auditLogs.filter(
        (auditLog) =>
          auditLog.requestScope === 'tenant' &&
          auditLog.tenantId === trustedContext.tenantId &&
          auditLog.tenantKey === trustedContext.tenantKey,
      );
    }

    return auditLogs.filter((auditLog) => auditLog.requestScope === 'platform');
  }
}
