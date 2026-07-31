import { Readable } from 'node:stream';
import { DataHealthService } from '../../../../src/modules/workbench/governance/application/data-health.service';

describe('DataHealthService', () => {
  function fixture() {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ migration_name: '20260720020000_data_governance' }]),
      fileVersion: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'v1', storageKey: 'files/present', size: 3, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' },
          { id: 'v2', storageKey: 'files/missing', size: 4, sha256: 'b'.repeat(64) },
        ]),
        count: jest.fn().mockResolvedValue(2),
      },
      restorePreflight: { count: jest.fn().mockResolvedValue(1) },
      backupRecord: {
        count: jest.fn().mockResolvedValue(2),
        findFirst: jest.fn().mockResolvedValue({ id: 'backup-1', verifiedAt: new Date('2026-07-19') }),
      },
      governanceSetting: { findUnique: jest.fn().mockResolvedValue({ autoBackupEnabled: true }) },
      notification: { count: jest.fn().mockResolvedValue(5) },
      reminderRule: { count: jest.fn().mockResolvedValue(0) },
      fileAsset: { count: jest.fn().mockResolvedValue(0) },
    };
    const storage = {
      checkHealth: jest.fn().mockResolvedValue(undefined),
      statfs: jest.fn().mockResolvedValue({ availableBytes: 10n, totalBytes: 100n }),
      stat: jest.fn(),
      openReadStream: jest.fn().mockResolvedValue(Readable.from(Buffer.from('abc'))),
    };
    storage.stat.mockImplementation((key: string) =>
      key === 'files/missing'
        ? Promise.reject(Object.assign(new Error('missing'), { code: 'ENOENT' }))
        : Promise.resolve({ byteSize: 3, kind: 'FILE' }),
    );
    const tools = {
      inspect: jest.fn().mockResolvedValue({
        pgDump: { available: true, executable: 'pg_dump', version: 17 },
        pgRestore: { available: true, executable: 'pg_restore', version: 17 },
      }),
    };
    return {
      service: new DataHealthService(prisma as never, storage as never, tools as never),
      prisma,
      storage,
      tools,
    };
  }

  it('reports schema drift, missing files, failed jobs and recent backup without mutating state', async () => {
    const f = fixture();
    const result = await f.service.check({ deep: true, expectedMigrationHead: 'expected-head' });
    expect(result.status).toBe('UNHEALTHY');
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'database.schema', status: 'FAIL' }),
        expect.objectContaining({ key: 'storage.files', status: 'FAIL', details: { checked: 2, missing: 1, mismatched: 0 } }),
        expect.objectContaining({ key: 'backup.recent', status: 'PASS' }),
        expect.objectContaining({ key: 'postgres.tools', status: 'PASS' }),
      ]),
    );
    expect(f.prisma.fileVersion.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: undefined }));
    expect(f.prisma).not.toHaveProperty('$executeRaw');
  });

  it('reports missing or incompatible PostgreSQL client tools before a backup is attempted', async () => {
    const f = fixture();
    f.tools.inspect.mockResolvedValue({
      pgDump: { available: false, executable: null, version: null },
      pgRestore: { available: true, executable: 'C:\\PostgreSQL\\17\\bin\\pg_restore.exe', version: 14 },
    });

    const result = await f.service.check({
      expectedMigrationHead: '20260720020000_data_governance',
    });

    expect(result.checks).toContainEqual(
      expect.objectContaining({
        key: 'postgres.tools',
        status: 'FAIL',
        details: expect.objectContaining({
          pgDump: expect.objectContaining({ available: false }),
          pgRestore: expect.objectContaining({ version: 14 }),
        }),
      }),
    );
  });

  it('uses a bounded sample in fast mode', async () => {
    const f = fixture();
    await f.service.check({ deep: false, expectedMigrationHead: '20260720020000_data_governance' });
    expect(f.prisma.fileVersion.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });

  it('includes partner and non-project R&D ownership when detecting multiply-associated attachments', async () => {
    const f = fixture();
    await f.service.check({ expectedMigrationHead: '20260720020000_data_governance' });

    expect(f.prisma.fileAsset.count).toHaveBeenCalledWith({
      where: {
        OR: expect.arrayContaining([
          { documentId: { not: null }, partnerId: { not: null } },
          { projectId: { not: null }, partnerId: { not: null } },
          { meetingId: { not: null }, partnerId: { not: null } },
          { partnerId: { not: null }, nonProjectRdItemId: { not: null } },
          { nonProjectRdItemId: { not: null }, nonProjectRdOutcomeId: { not: null } },
        ]),
      },
    });
    expect(f.prisma.fileAsset.count).toHaveBeenCalledWith({
      where: {
        documentId: null,
        projectId: null,
        meetingId: null,
        partnerId: null,
        nonProjectRdItemId: null,
        nonProjectRdOutcomeId: null,
      },
    });
  });
});
