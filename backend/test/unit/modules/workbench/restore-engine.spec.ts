import { RestoreEngine } from '../../../../src/modules/workbench/governance/infrastructure/restore-engine';

describe('RestoreEngine', () => {
  function fixture() {
    const events: string[] = [];
    const prisma = {
      $queryRawUnsafe: jest.fn().mockImplementation(async (sql: string) => {
        events.push(sql.includes('pg_try_advisory_lock') ? 'lock' : 'health');
        if (sql.includes('pg_try_advisory_lock')) return [{ acquired: true }];
        if (sql.includes('_prisma_migrations')) return [{ migration_name: 'schema-1' }];
        return [{ result: 1 }];
      }),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $disconnect: jest.fn().mockImplementation(async () => { events.push('disconnect'); }),
      $connect: jest.fn().mockImplementation(async () => { events.push('connect'); }),
      backupRecord: {
        update: jest.fn().mockImplementation(async ({ data }) => { events.push(`status:${data.status}`); }),
      },
    };
    const preflight = {
      consume: jest.fn().mockImplementation(async () => {
        events.push('consume');
        return {
          id: 'target-1',
          relativeDirectory: 'backups/target-1',
          manifestSha256: 'm'.repeat(64),
          schemaVersion: 'schema-1',
        };
      }),
    };
    const backups = {
      createPreRestore: jest.fn().mockImplementation(async () => {
        events.push('protect');
        return { id: 'protect-1', relativeDirectory: 'backups/protect-1', schemaVersion: 'schema-1' };
      }),
    };
    const filesystem = {
      createDirectory: jest.fn().mockImplementation(async () => { events.push('stage'); }),
      copyTree: jest.fn().mockImplementation(async () => { events.push('copy'); }),
      atomicRename: jest.fn().mockImplementation(async (source: string, destination: string) => {
        events.push(`rename:${source}->${destination}`);
      }),
      removeTree: jest.fn().mockResolvedValue(undefined),
      absolutePath: jest.fn().mockImplementation(async (value: string) => `/storage/${value}`),
      readJson: jest.fn().mockResolvedValue({
        sha256: 'm'.repeat(64),
        value: {
          formatVersion: 1,
          appVersion: '0.1.0',
          schemaVersion: 'schema-1',
          createdAt: '2026-07-20T00:00:00.000Z',
          database: { path: 'database.dump', byteSize: 10, sha256: 'd'.repeat(64) },
          files: [],
        },
      }),
      hashFile: jest.fn().mockResolvedValue({ byteSize: 1, sha256: 'a'.repeat(64) }),
    };
    const runner = {
      run: jest.fn().mockImplementation(async ({ cwd }) => {
        events.push(cwd.includes('protect-1') ? 'restore-protect' : 'restore-target');
        return { stdout: '', stderr: '' };
      }),
    };
    const journal = {
      begin: jest.fn().mockImplementation(async () => { events.push('journal:begin'); }),
      mark: jest.fn().mockImplementation(async (phase: string) => { events.push(`journal:${phase}`); }),
      complete: jest.fn().mockImplementation(async () => { events.push('journal:complete'); }),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const engine = new RestoreEngine(
      prisma as never,
      preflight as never,
      backups as never,
      filesystem as never,
      runner as never,
      journal as never,
      audit as never,
      { databaseUrl: 'postgresql://app:secret@127.0.0.1:5432/workbench?schema=app', appVersion: '0.1.0' },
      () => 'job-1',
    );
    return { engine, prisma, preflight, backups, filesystem, runner, journal, audit, events };
  }

  const input = {
    backupId: 'target-1',
    preflightId: 'preflight-1',
    confirmationToken: 'confirmation-token',
    expectedHash: 'm'.repeat(64),
  };

  it('protects current state, restores with fixed flags, swaps staged files and validates before success', async () => {
    const f = fixture();

    await expect(f.engine.restore(input)).resolves.toEqual({ backupId: 'target-1', restored: true });
    expect(f.events).toEqual(expect.arrayContaining([
      'lock', 'protect', 'consume', 'stage', 'copy', 'journal:begin', 'disconnect',
      'restore-target', 'rename:files->restore-journal/job-1/files-before',
      'rename:restore-staging/job-1/files->files', 'connect', 'health',
      'status:RESTORED', 'journal:complete',
    ]));
    expect(f.events.indexOf('protect')).toBeLessThan(f.events.indexOf('consume'));
    expect(f.events.indexOf('protect')).toBeLessThan(f.events.indexOf('restore-target'));
    expect(f.events.indexOf('restore-target')).toBeLessThan(f.events.indexOf('status:RESTORED'));
    expect(f.runner.run).toHaveBeenCalledWith(expect.objectContaining({
      executable: 'pg_restore',
      args: expect.arrayContaining([
        '--single-transaction', '--exit-on-error', '--clean', '--if-exists', '--no-owner', '--no-privileges',
      ]),
    }));
  });

  it('does not consume the one-time confirmation when the protective snapshot fails', async () => {
    const f = fixture();
    f.backups.createPreRestore.mockRejectedValueOnce(new Error('snapshot failed'));

    await expect(f.engine.restore(input)).rejects.toMatchObject({ code: 'RESTORE_FAILED' });
    expect(f.preflight.consume).not.toHaveBeenCalled();
    expect(f.runner.run).not.toHaveBeenCalled();
  });

  it('restores the protected database and original files when target file exchange fails', async () => {
    const f = fixture();
    f.filesystem.atomicRename
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('file exchange failed'))
      .mockResolvedValueOnce(undefined);

    await expect(f.engine.restore(input)).rejects.toMatchObject({ code: 'RESTORE_FAILED' });
    expect(f.events).toContain('restore-protect');
    expect(f.filesystem.atomicRename).toHaveBeenLastCalledWith(
      'restore-journal/job-1/files-before',
      'files',
    );
    expect(f.journal.mark).toHaveBeenCalledWith('ROLLED_BACK');
  });

  it('returns the dedicated stable error and preserves evidence when rollback also fails', async () => {
    const f = fixture();
    f.runner.run
      .mockRejectedValueOnce(new Error('target restore failed postgresql://secret@host/db'))
      .mockRejectedValueOnce(new Error('rollback failed /private/storage'));

    await expect(f.engine.restore(input)).rejects.toMatchObject({ code: 'RESTORE_ROLLBACK_FAILED' });
    expect(f.filesystem.removeTree).not.toHaveBeenCalledWith('restore-staging/job-1');
    expect(f.journal.mark).toHaveBeenCalledWith('ROLLBACK_FAILED');
  });

  it('checks restored migration and live file hashes before reporting success', async () => {
    const f = fixture();
    f.filesystem.readJson
      .mockResolvedValueOnce({
        sha256: 'm'.repeat(64),
        value: {
          formatVersion: 1,
          appVersion: '0.1.0',
          schemaVersion: 'schema-1',
          createdAt: '2026-07-20T00:00:00.000Z',
          database: { path: 'database.dump', byteSize: 10, sha256: 'd'.repeat(64) },
          files: [{ path: 'files/a.bin', byteSize: 3, sha256: 'a'.repeat(64) }],
        },
      })
      .mockResolvedValueOnce({
        sha256: 'p'.repeat(64),
        value: {
          formatVersion: 1,
          appVersion: '0.1.0',
          schemaVersion: 'schema-1',
          createdAt: '2026-07-20T00:00:00.000Z',
          database: { path: 'database.dump', byteSize: 10, sha256: 'd'.repeat(64) },
          files: [],
        },
      });
    f.filesystem.hashFile.mockResolvedValueOnce({ byteSize: 3, sha256: 'x'.repeat(64) });

    await expect(f.engine.restore(input)).rejects.toMatchObject({ code: 'RESTORE_FAILED' });
    expect(f.events).toContain('restore-protect');
  });

  it('rolls back when the restored catalog contains an unvalidated foreign key', async () => {
    const f = fixture();
    let foreignKeyChecks = 0;
    f.prisma.$queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes('pg_try_advisory_lock')) return [{ acquired: true }];
      if (sql.includes('_prisma_migrations')) return [{ migration_name: 'schema-1' }];
      if (sql.includes("contype = 'f'")) {
        foreignKeyChecks += 1;
        return [{ invalid_count: foreignKeyChecks === 1 ? 1 : 0 }];
      }
      return [{ result: 1 }];
    });

    await expect(f.engine.restore(input)).rejects.toMatchObject({ code: 'RESTORE_FAILED' });
    expect(f.events).toContain('restore-protect');
  });
});
