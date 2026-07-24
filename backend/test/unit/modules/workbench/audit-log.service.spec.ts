import { EmployeeWorkImportStatus } from '@prisma/client';
import { AuditLogService } from '../../../../src/modules/workbench/governance/application/audit-log.service';

describe('AuditLogService', () => {
  it('persists only allowed metadata and field names, never values or credentials', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const service = new AuditLogService({ auditLog: { create } } as never);

    await service.record(
      {
        action: 'PARTNER_UPDATE',
        entityType: 'partner',
        entityId: 'partner-1',
        outcome: 'SUCCEEDED',
        changedFields: ['name', 'phone', 'documentBody'],
        metadata: {
          status: 'ACTIVE',
          itemCount: 2,
          phone: '13800138000',
          url: 'https://example.test?a=secret',
          token: 'abc',
          databaseUrl: 'postgresql://u:p@127.0.0.1/db',
        },
      },
      { auditLog: { create } } as never,
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changedFields: ['documentBody', 'name', 'phone'],
        metadata: { status: 'ACTIVE', itemCount: 2 },
      }),
    });
    expect(JSON.stringify(create.mock.calls)).not.toContain('13800138000');
    expect(JSON.stringify(create.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(create.mock.calls)).not.toContain('postgresql');
  });

  it('does not report success when the immutable audit insert fails', async () => {
    const service = new AuditLogService({
      auditLog: { create: jest.fn().mockRejectedValue(new Error('insert failed')) },
    } as never);
    await expect(
      service.record({
        action: 'WRITE',
        entityType: 'task',
        outcome: 'SUCCEEDED',
        changedFields: [],
        metadata: {},
      }),
    ).rejects.toThrow('insert failed');
  });

  it('preserves safe employee import restore metadata after allowlist filtering', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'audit-restore' });
    const service = new AuditLogService({ auditLog: { create } } as never);

    await service.record({
      action: 'EMPLOYEE_IMPORT_RESTORED',
      entityType: 'employeeWorkImportBatch',
      entityId: 'restored-batch',
      outcome: 'SUCCEEDED',
      changedFields: ['status', 'version', 'restoredFromBatchId'],
      metadata: {
        status: EmployeeWorkImportStatus.COMPLETED,
        version: 3,
        restoredFromBatchId: 'source-batch',
        rowCount: 50_000,
        snapshotStatus: 'READY',
        sourceStorageKey: 'private/source.xlsx',
      },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: {
          status: EmployeeWorkImportStatus.COMPLETED,
          version: 3,
          restoredFromBatchId: 'source-batch',
          rowCount: 50_000,
          snapshotStatus: 'READY',
        },
      }),
    });
  });

  it('keeps only safe employee work export and risk identifiers', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'audit-employee-work' });
    const service = new AuditLogService({ auditLog: { create } } as never);

    await service.record({
      action: 'EMPLOYEE_WORK_RISK_CONVERTED',
      entityType: 'employeeWorkItem',
      entityId: 'work-1',
      outcome: 'SUCCEEDED',
      changedFields: ['riskId'],
      metadata: {
        workItemId: 'work-1',
        riskId: 'risk-1',
        format: 'xlsx',
        rowCount: 20,
        title: '=private title',
        riskText: 'private blocker',
      },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: {
          workItemId: 'work-1',
          riskId: 'risk-1',
          format: 'xlsx',
          rowCount: 20,
        },
      }),
    });
  });
});
