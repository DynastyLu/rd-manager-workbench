import type { RequestContext } from '../../../../../src/shared/kernel/request-context';
import { RecordAuditLogUseCase } from '../../../../../src/modules/system/audit/application/record-audit-log.use-case';
import { ListAuditLogsUseCase } from '../../../../../src/modules/system/audit/application/list-audit-logs.use-case';

describe('RecordAuditLogUseCase', () => {
  it('records platform-scoped and tenant-scoped audit logs', async () => {
    const logs: any[] = [];
    const auditLogRepository = {
      create: jest.fn(async (auditLog) => {
        logs.push(auditLog);
        return auditLog;
      }),
      list: jest.fn(async () => logs),
    };
    const createUseCase = new RecordAuditLogUseCase(auditLogRepository as never);
    const listUseCase = new ListAuditLogsUseCase(auditLogRepository as never);
    const platformContext: RequestContext = {
      traceId: 'trace-platform',
      requestScope: 'platform',
      identitySource: 'provisional',
      provisional: {
        requestHeaders: {},
      },
    };
    const context: RequestContext = {
      traceId: 'trace-1',
      requestScope: 'tenant',
      tenantId: 'tenant_001',
      tenantKey: 'alpha',
      operatorId: 'operator_001',
      operatorType: 'tenant_admin',
      identitySource: 'trusted',
      provisional: {
        requestedScope: 'tenant',
        requestHeaders: {},
      },
    };

    const platformResult = await createUseCase.execute(
      {
        action: 'system.start',
        resourceType: 'system',
      },
      platformContext,
    );

    const tenantResult = await createUseCase.execute(
      {
        action: 'user.create',
        resourceType: 'user',
        resourceId: 'user_001',
        details: {
          actor: 'admin',
        },
      },
      context,
    );

    const platformLogs = await listUseCase.execute(platformContext);
    const tenantLogs = await listUseCase.execute(context);

    expect(platformResult).toMatchObject({
      traceId: 'trace-platform',
      requestScope: 'platform',
      action: 'system.start',
      resourceType: 'system',
    });
    expect(tenantResult).toMatchObject({
      traceId: 'trace-1',
      requestScope: 'tenant',
      tenantId: 'tenant_001',
      tenantKey: 'alpha',
      operatorId: 'operator_001',
      operatorType: 'tenant_admin',
      action: 'user.create',
      resourceType: 'user',
      resourceId: 'user_001',
      details: {
        actor: 'admin',
      },
    });
    expect(platformLogs).toEqual([
      expect.objectContaining({
        requestScope: 'platform',
        action: 'system.start',
      }),
    ]);
    expect(tenantLogs).toEqual([
      expect.objectContaining({
        requestScope: 'tenant',
        tenantId: 'tenant_001',
        tenantKey: 'alpha',
      }),
    ]);
  });
});
