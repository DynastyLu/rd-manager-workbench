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
});
