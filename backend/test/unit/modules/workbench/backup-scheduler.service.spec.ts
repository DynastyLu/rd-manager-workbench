import { BackupKind, BackupStatus } from '@prisma/client';
import { BackupSchedulerService } from '../../../../src/modules/workbench/governance/application/backup-scheduler.service';

describe('BackupSchedulerService', () => {
  function fixture() {
    const settings = {
      get: jest.fn().mockResolvedValue({
        autoBackupEnabled: true,
        autoBackupTimeLocal: '09:30',
        retentionDays: 30,
        lastAutoBackupLocalDate: null,
      }),
      markAutoBackupSucceeded: jest.fn(),
    };
    const backups = {
      createScheduled: jest.fn().mockResolvedValue({ id: 'scheduled', status: BackupStatus.VERIFIED }),
      applyRetention: jest.fn().mockResolvedValue({ deleted: 0 }),
      scheduledAttemptCount: jest.fn().mockResolvedValue(0),
    };
    const scheduler = new BackupSchedulerService(settings as never, backups as never);
    return { scheduler, settings, backups };
  }

  it('runs once after the local configured time and advances the successful local date', async () => {
    const f = fixture();
    const now = new Date(2026, 6, 20, 9, 31, 0);
    await expect(f.scheduler.scan(now)).resolves.toMatchObject({ created: true });
    expect(f.backups.createScheduled).toHaveBeenCalledWith(
      expect.any(Date),
      expect.objectContaining({ kind: BackupKind.SCHEDULED }),
    );
    expect(f.settings.markAutoBackupSucceeded).toHaveBeenCalledWith(expect.any(Date));
    expect(f.backups.applyRetention).toHaveBeenCalledWith(30, now);
  });

  it('is restart-idempotent when the database says today already succeeded', async () => {
    const f = fixture();
    const now = new Date(2026, 6, 20, 10, 0, 0);
    f.settings.get.mockResolvedValue({
      autoBackupEnabled: true,
      autoBackupTimeLocal: '09:30',
      retentionDays: 30,
      lastAutoBackupLocalDate: new Date('2026-07-20T00:00:00.000Z'),
    });
    await expect(f.scheduler.scan(now)).resolves.toEqual({ created: false, reason: 'ALREADY_DONE' });
    expect(f.backups.createScheduled).not.toHaveBeenCalled();
  });

  it('limits failed automatic attempts to three per local day without advancing the date', async () => {
    const f = fixture();
    f.backups.createScheduled.mockRejectedValue(new Error('failed'));
    const now = new Date(2026, 6, 20, 10, 0, 0);
    for (let index = 0; index < 3; index += 1) {
      await expect(f.scheduler.scan(now)).rejects.toThrow('failed');
    }
    await expect(f.scheduler.scan(now)).resolves.toEqual({ created: false, reason: 'RETRY_LIMIT' });
    expect(f.backups.createScheduled).toHaveBeenCalledTimes(3);
    expect(f.settings.markAutoBackupSucceeded).not.toHaveBeenCalled();
  });

  it('does nothing before the configured local time or while disabled', async () => {
    const f = fixture();
    await expect(f.scheduler.scan(new Date(2026, 6, 20, 9, 29, 0))).resolves.toEqual({
      created: false,
      reason: 'NOT_DUE',
    });
    f.settings.get.mockResolvedValue({ autoBackupEnabled: false });
    await expect(f.scheduler.scan(new Date(2026, 6, 20, 10, 0, 0))).resolves.toEqual({
      created: false,
      reason: 'DISABLED',
    });
  });

  it('honors the persisted daily retry limit after restart', async () => {
    const f = fixture();
    f.backups.scheduledAttemptCount.mockResolvedValue(3);
    await expect(f.scheduler.scan(new Date(2026, 6, 20, 10, 0, 0))).resolves.toEqual({
      created: false,
      reason: 'RETRY_LIMIT',
    });
    expect(f.backups.createScheduled).not.toHaveBeenCalled();
  });

  it('registers one unreferenced interval and clears it during shutdown', () => {
    jest.useFakeTimers();
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'dev';
    const f = fixture();
    f.settings.get.mockResolvedValue({ autoBackupEnabled: false });
    try {
      f.scheduler.onApplicationBootstrap();
      expect(jest.getTimerCount()).toBe(1);
      f.scheduler.onApplicationShutdown();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      jest.useRealTimers();
    }
  });
});
