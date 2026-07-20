import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { BackupsService } from '../../../../src/modules/workbench/governance/application/backups.service';
import { BackupFilesystem } from '../../../../src/modules/workbench/governance/infrastructure/backup-filesystem';
import { ProcessRunner } from '../../../../src/modules/workbench/governance/infrastructure/process-runner';

describe('BackupsService real pg_dump', () => {
  const prisma = new PlatformPrismaService();
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'rd-governance-real-backup-'));
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await rm(root, { recursive: true, force: true });
  });

  it('creates and re-verifies a PostgreSQL custom dump in an isolated storage root', async () => {
    const filesystem = new BackupFilesystem(root);
    const service = new BackupsService(
      prisma,
      filesystem,
      new ProcessRunner({ allowedExecutables: ['pg_dump'], defaultTimeoutMs: 120_000 }),
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      { databaseUrl: process.env.DATABASE_URL!, appVersion: 'test' },
    );

    const created = await service.createManual();
    try {
      expect(created).toMatchObject({ status: 'VERIFIED', fileCount: 0 });
      expect(Number(created.byteSize)).toBeGreaterThan(0);
      await expect(service.verify(created.id)).resolves.toMatchObject({ status: 'VERIFIED' });
      await expect(
        filesystem.hashFile(`${created.relativeDirectory}/database.dump`),
      ).resolves.toMatchObject({ byteSize: expect.any(Number), sha256: created.databaseSha256 });
    } finally {
      await prisma.backupRecord.delete({ where: { id: created.id } });
    }
  }, 150_000);
});
