import { BackupKind, BackupStatus } from '@prisma/client';
import { BackupsService } from '../../../../src/modules/workbench/governance/application/backups.service';

describe('BackupsService', () => {
  const databaseUrl =
    'postgresql://rd_manager_workbench_app:top-secret@127.0.0.1:5432/rd_manager_workbench?schema=app';

  function fixture(overrides: Record<string, unknown> = {}) {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ acquired: true }]),
      backupRecord: {
        create: jest.fn().mockResolvedValue({ id: 'backup-1' }),
        delete: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'backup-1', kind: BackupKind.MANUAL, byteSize: 15n, ...data }),
        ),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
      backupRecord: {
        create: jest.fn().mockResolvedValue({ id: 'backup-1' }),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 'backup-1' }),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ migration_name: '20260720020000_data_governance' }]),
    };
    const filesystem = {
      validateManifestPaths: jest.fn((paths: string[]) => paths),
      createDirectory: jest.fn().mockResolvedValue(undefined),
      absolutePath: jest.fn((key: string) => `/storage/${key}`),
      listFiles: jest.fn().mockResolvedValue([
        { key: 'files/a.bin', byteSize: 3, kind: 'FILE' },
      ]),
      copyFileWithHash: jest.fn().mockResolvedValue({ byteSize: 3, sha256: 'a'.repeat(64) }),
      hashFile: jest.fn().mockImplementation((key: string) =>
        Promise.resolve({
          byteSize: key.endsWith('database.dump') ? 12 : 3,
          sha256: key.endsWith('database.dump') ? 'd'.repeat(64) : 'a'.repeat(64),
        }),
      ),
      writeJsonAtomic: jest.fn().mockResolvedValue({ byteSize: 100, sha256: 'm'.repeat(64) }),
      readJson: jest.fn().mockResolvedValue({
        value: {
          formatVersion: 1,
          appVersion: '0.1.0',
          schemaVersion: '20260720020000_data_governance',
          createdAt: '2026-07-20T00:00:00.000Z',
          database: { path: 'database.dump', byteSize: 12, sha256: 'd'.repeat(64) },
          files: [{ path: 'files/a.bin', byteSize: 3, sha256: 'a'.repeat(64) }],
        },
        byteSize: 100,
        sha256: 'm'.repeat(64),
      }),
      atomicRename: jest.fn().mockResolvedValue(undefined),
      removeTree: jest.fn().mockResolvedValue(undefined),
    };
    const runner = { run: jest.fn().mockResolvedValue({ stdout: '', stderr: '' }) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new BackupsService(
      prisma as never,
      filesystem as never,
      runner as never,
      audit as never,
      { databaseUrl, appVersion: '0.1.0' },
    );
    return { service, prisma, tx, filesystem, runner, audit, ...overrides };
  }

  it('uses a fixed custom-format pg_dump invocation and only verifies after the second hash pass', async () => {
    const f = fixture();
    const result = await f.service.createManual();

    expect(f.runner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        executable: 'pg_dump',
        args: expect.arrayContaining([
          '--format=custom',
          '--no-owner',
          '--no-privileges',
          '--host=127.0.0.1',
          '--port=5432',
          '--username=rd_manager_workbench_app',
          '--dbname=rd_manager_workbench',
          '--file=database.dump',
        ]),
        cwd: expect.stringMatching(/\.tmp$/),
        env: expect.objectContaining({ PGPASSWORD: 'top-secret' }),
      }),
    );
    expect(f.filesystem.hashFile).toHaveBeenCalledTimes(5);
    expect(f.tx.backupRecord.update.mock.calls.map((call) => call[0].data.status)).toEqual([
      BackupStatus.CREATED,
      BackupStatus.VERIFIED,
    ]);
    expect(result.status).toBe(BackupStatus.VERIFIED);
  });

  it.each([
    ['dump failure', 'runner', new Error('postgresql://user:secret@127.0.0.1/db token=abc')],
    ['copy failure', 'copy', new Error('copy failed /private/storage')],
  ])('marks a failed record and never exposes sensitive error data on %s', async (_label, source, error) => {
    const f = fixture();
    if (source === 'runner') f.runner.run.mockRejectedValue(error);
    else f.filesystem.copyFileWithHash.mockRejectedValue(error);

    await expect(f.service.createManual()).rejects.toMatchObject({ code: 'BACKUP_CREATE_FAILED' });
    expect(f.prisma.backupRecord.update).toHaveBeenCalledWith({
      where: { id: expect.any(String) },
      data: expect.objectContaining({
        status: BackupStatus.FAILED,
        failureCode: 'BACKUP_CREATE_FAILED',
        failureMessage: 'Backup creation failed',
      }),
    });
    expect(JSON.stringify(f.prisma.backupRecord.update.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(f.prisma.backupRecord.update.mock.calls)).not.toContain('/private');
  });

  it('rejects a tampered manifest or payload without changing it to verified', async () => {
    const f = fixture();
    f.prisma.backupRecord.findUnique.mockResolvedValue({
      id: 'backup-1',
      status: BackupStatus.CREATED,
      relativeDirectory: 'backups/final',
      manifestSha256: 'm'.repeat(64),
    });
    f.filesystem.readJson.mockResolvedValue({
      value: {
        formatVersion: 1,
        database: { path: 'database.dump', byteSize: 12, sha256: 'd'.repeat(64) },
        files: [],
      },
      byteSize: 99,
      sha256: 'x'.repeat(64),
    });

    await expect(f.service.verify('backup-1')).rejects.toMatchObject({
      code: 'BACKUP_MANIFEST_INVALID',
    });
    expect(f.prisma.backupRecord.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: BackupStatus.VERIFIED }) }),
    );
  });

  it('rejects concurrent work before invoking pg_dump', async () => {
    const f = fixture();
    let release!: () => void;
    f.runner.run.mockImplementation(
      () => new Promise((resolve) => (release = () => resolve({ stdout: '', stderr: '' }))),
    );
    const first = f.service.createManual();
    await new Promise((resolve) => setImmediate(resolve));
    await expect(f.service.createManual()).rejects.toMatchObject({ code: 'BACKUP_BUSY' });
    release();
    await first;
    expect(f.runner.run).toHaveBeenCalledTimes(1);
  });

  it('uses the PostgreSQL advisory lock and rejects another process before pg_dump', async () => {
    const f = fixture();
    f.tx.$queryRawUnsafe.mockResolvedValue([{ acquired: false }]);
    await expect(f.service.createManual()).rejects.toMatchObject({ code: 'BACKUP_BUSY' });
    expect(f.runner.run).not.toHaveBeenCalled();
  });

  it('reuses the unique failed scheduled record for a bounded retry', async () => {
    const f = fixture();
    f.prisma.backupRecord.findFirst.mockResolvedValue({
      id: 'scheduled-1',
      kind: BackupKind.SCHEDULED,
      status: BackupStatus.FAILED,
      byteSize: 0n,
    });
    await expect(
      f.service.createScheduled(new Date('2026-07-20T00:00:00.000Z')),
    ).resolves.toMatchObject({ status: BackupStatus.VERIFIED });
    expect(f.prisma.backupRecord.create).not.toHaveBeenCalled();
    expect(f.prisma.backupRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'scheduled-1' },
        data: expect.objectContaining({ status: BackupStatus.CREATING }),
      }),
    );
  });

  it('retains the latest success and PRE_RESTORE evidence while deleting eligible old backups', async () => {
    const f = fixture();
    f.prisma.backupRecord.findFirst.mockResolvedValue({ id: 'latest' });
    f.prisma.backupRecord.findMany.mockResolvedValue([
      {
        id: 'old',
        kind: BackupKind.MANUAL,
        status: BackupStatus.VERIFIED,
        relativeDirectory: 'backups/old',
      },
    ]);
    await expect(f.service.applyRetention(30, new Date('2026-07-20'))).resolves.toEqual({ deleted: 1 });
    expect(f.prisma.backupRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          kind: { not: BackupKind.PRE_RESTORE },
          id: { not: 'latest' },
        }),
      }),
    );
    expect(f.filesystem.removeTree).toHaveBeenCalledWith('backups/old');
    expect(f.tx.backupRecord.delete).toHaveBeenCalledWith({ where: { id: 'old' } });
  });
});
