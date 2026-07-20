import { BackupStatus, RestorePreflightStatus } from '@prisma/client';
import { RestorePreflightService } from '../../../../src/modules/workbench/governance/application/restore-preflight.service';

describe('RestorePreflightService', () => {
  const now = new Date('2026-07-20T10:00:00.000Z');
  const manifest = {
    formatVersion: 1 as const,
    appVersion: '0.1.0',
    schemaVersion: '20260720020000_data_governance',
    createdAt: '2026-07-20T09:00:00.000Z',
    database: { path: 'database.dump', byteSize: 12, sha256: 'd'.repeat(64) },
    files: [{ path: 'files/a.bin', byteSize: 3, sha256: 'a'.repeat(64) }],
  };

  function fixture() {
    const backup = {
      id: 'backup-1',
      kind: 'MANUAL',
      status: BackupStatus.VERIFIED,
      relativeDirectory: 'backups/backup-1',
      manifestSha256: 'm'.repeat(64),
      schemaVersion: manifest.schemaVersion,
      fileCount: 1,
      byteSize: 15n,
    };
    const prisma = {
      backupRecord: { findUnique: jest.fn().mockResolvedValue(backup) },
      restorePreflight: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'preflight-1', ...data })),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ migration_name: manifest.schemaVersion }]),
      $transaction: jest.fn((callback) => callback(prisma)),
    };
    const filesystem = {
      readJson: jest.fn().mockResolvedValue({ value: manifest, byteSize: 200, sha256: 'm'.repeat(64) }),
      validateManifestPaths: jest.fn((paths: string[]) => paths),
      hashFile: jest.fn().mockImplementation((path: string) => Promise.resolve(
        path.endsWith('database.dump')
          ? { byteSize: 12, sha256: 'd'.repeat(64) }
          : { byteSize: 3, sha256: 'a'.repeat(64) },
      )),
      absolutePath: jest.fn().mockResolvedValue('/safe/backups/backup-1'),
      filesystemStats: jest.fn().mockResolvedValue({ availableBytes: 1_000n, totalBytes: 10_000n }),
    };
    const runner = {
      run: jest.fn().mockImplementation(({ args }: { args: string[] }) => Promise.resolve(
        args[0] === '--version'
          ? { stdout: 'pg_restore (PostgreSQL) 15.8', stderr: '' }
          : { stdout: 'TOC', stderr: '' },
      )),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new RestorePreflightService(
      prisma as never,
      filesystem as never,
      runner as never,
      audit as never,
      { databaseUrl: 'postgresql://app:secret@127.0.0.1:5432/workbench?schema=app', appVersion: '0.1.0' },
      () => now,
      () => 'one-time-confirmation-token',
    );
    return { service, prisma, filesystem, runner, audit, backup };
  }

  it('validates every hash and pg_restore catalog before issuing a ten-minute one-time token', async () => {
    const f = fixture();

    await expect(f.service.create('backup-1')).resolves.toEqual(expect.objectContaining({
      id: 'preflight-1',
      backupId: 'backup-1',
      manifestSha256: 'm'.repeat(64),
      confirmationToken: 'one-time-confirmation-token',
      expiresAt: new Date('2026-07-20T10:10:00.000Z'),
      warnings: [],
      summary: expect.objectContaining({ fileCount: 1, byteSize: 15 }),
    }));
    expect(f.filesystem.hashFile).toHaveBeenCalledTimes(2);
    expect(f.runner.run).toHaveBeenCalledWith(expect.objectContaining({
      executable: 'pg_restore',
      args: ['--list', 'database.dump'],
      cwd: '/safe/backups/backup-1',
    }));
    expect(f.prisma.restorePreflight.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      confirmationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      status: RestorePreflightStatus.READY,
    }) });
  });

  it.each([
    ['manifest changed', (f: ReturnType<typeof fixture>) => {
      f.filesystem.readJson.mockResolvedValue({ value: manifest, byteSize: 200, sha256: 'x'.repeat(64) });
    }],
    ['payload changed', (f: ReturnType<typeof fixture>) => {
      f.filesystem.hashFile.mockResolvedValueOnce({ byteSize: 12, sha256: 'x'.repeat(64) });
    }],
    ['insufficient free space', (f: ReturnType<typeof fixture>) => {
      f.filesystem.filesystemStats.mockResolvedValue({ availableBytes: 20n, totalBytes: 100n });
    }],
    ['incompatible schema', (f: ReturnType<typeof fixture>) => {
      f.prisma.$queryRawUnsafe.mockResolvedValue([{ migration_name: 'older' }]);
    }],
    ['invalid dump catalog', (f: ReturnType<typeof fixture>) => {
      f.runner.run.mockRejectedValue(new Error('postgresql://secret@host/db'));
    }],
    ['incompatible pg_restore version', (f: ReturnType<typeof fixture>) => {
      f.runner.run.mockImplementation(({ args }: { args: string[] }) => Promise.resolve(
        args[0] === '--version'
          ? { stdout: 'pg_restore (PostgreSQL) 14.12', stderr: '' }
          : { stdout: 'TOC', stderr: '' },
      ));
    }],
  ])('rejects %s without creating a token', async (_label, arrange) => {
    const f = fixture();
    arrange(f);
    await expect(f.service.create('backup-1')).rejects.toMatchObject({ code: 'RESTORE_PREFLIGHT_INVALID' });
    expect(f.prisma.restorePreflight.create).not.toHaveBeenCalled();
  });

  it('expires a token, rejects reuse, and detects manifest TOCTOU changes', async () => {
    const expired = fixture();
    expired.prisma.restorePreflight.findUnique.mockResolvedValue({
      id: 'preflight-1',
      backupId: 'backup-1',
      status: RestorePreflightStatus.READY,
      expiresAt: new Date('2026-07-20T09:59:59.000Z'),
      manifestSha256: 'm'.repeat(64),
      confirmationHash: 'unused',
      backup: expired.backup,
    });
    await expect(expired.service.consume({
      backupId: 'backup-1',
      preflightId: 'preflight-1',
      confirmationToken: 'token',
      expectedHash: 'm'.repeat(64),
    })).rejects.toMatchObject({ code: 'RESTORE_CONFIRMATION_INVALID' });
    expect(expired.prisma.restorePreflight.update).toHaveBeenCalledWith({
      where: { id: 'preflight-1' },
      data: { status: RestorePreflightStatus.EXPIRED },
    });

    const changed = fixture();
    const created = await changed.service.create('backup-1');
    changed.prisma.restorePreflight.findUnique.mockResolvedValue({
      id: created.id,
      backupId: 'backup-1',
      status: RestorePreflightStatus.READY,
      expiresAt: created.expiresAt,
      manifestSha256: created.manifestSha256,
      confirmationHash: changed.prisma.restorePreflight.create.mock.calls[0][0].data.confirmationHash,
      backup: changed.backup,
    });
    changed.filesystem.readJson.mockResolvedValueOnce({
      value: manifest,
      byteSize: 200,
      sha256: 'x'.repeat(64),
    });
    await expect(changed.service.consume({
      backupId: 'backup-1',
      preflightId: created.id,
      confirmationToken: created.confirmationToken,
      expectedHash: created.manifestSha256,
    })).rejects.toMatchObject({ code: 'RESTORE_PREFLIGHT_INVALID' });
    expect(changed.prisma.restorePreflight.update).toHaveBeenCalledWith({
      where: { id: created.id },
      data: { status: RestorePreflightStatus.INVALID },
    });
  });
});
