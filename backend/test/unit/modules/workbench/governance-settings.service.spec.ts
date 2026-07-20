import { GovernanceSettingsService } from '../../../../src/modules/workbench/governance/application/governance-settings.service';

describe('GovernanceSettingsService', () => {
  it('writes settings and its audit entry in the same transaction', async () => {
    const tx = {
      governanceSetting: {
        upsert: jest.fn().mockResolvedValue({ id: 'singleton', autoBackupEnabled: true }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new GovernanceSettingsService(prisma as never, audit as never);
    await service.update({
      autoBackupEnabled: true,
      autoBackupTimeLocal: '09:30',
      retentionDays: 30,
    });
    expect(tx.governanceSetting.upsert).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'GOVERNANCE_SETTINGS_UPDATE', outcome: 'SUCCEEDED' }),
      tx,
    );
  });
});
