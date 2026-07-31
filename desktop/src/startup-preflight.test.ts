import { describe, expect, it, vi } from 'vitest'
import {
  inspectStartupEnvironment,
  postgresToolCandidates,
  type StartupProbe,
} from './startup-preflight.js'

function probe(overrides: Partial<StartupProbe> = {}): StartupProbe {
  return {
    canConnectDatabase: vi.fn().mockResolvedValue(true),
    canWriteStorage: vi.fn().mockResolvedValue(true),
    isPortAvailable: vi.fn().mockResolvedValue(true),
    migrationState: vi.fn().mockResolvedValue({ current: '20260729000000_latest', pending: [] }),
    findExecutable: vi.fn().mockResolvedValue('/opt/postgres/bin/pg_dump'),
    ...overrides,
  }
}

describe('startup preflight', () => {
  it('reports a port conflict before starting the managed backend', async () => {
    const result = await inspectStartupEnvironment(
      {
        databaseUrl: 'postgresql://app@127.0.0.1:5432/rd_manager_workbench?schema=app',
        storageRoot: '/tmp/rd-workbench-storage',
        backendPort: 4311,
        expectedMigrationHead: '20260729000000_latest',
        platform: 'darwin',
      },
      probe({ isPortAvailable: vi.fn().mockResolvedValue(false) }),
    )

    expect(result.ready).toBe(false)
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'BACKEND_PORT_IN_USE', repair: 'CHANGE_OR_RELEASE_PORT' }),
    )
  })

  it('distinguishes unreachable database, pending migrations, unwritable storage and missing tools', async () => {
    const result = await inspectStartupEnvironment(
      {
        databaseUrl: 'postgresql://app@127.0.0.1:5432/rd_manager_workbench?schema=app',
        storageRoot: 'C:\\RDWorkbench\\storage',
        backendPort: 4311,
        expectedMigrationHead: '20260729000000_latest',
        platform: 'win32',
      },
      probe({
        canConnectDatabase: vi.fn().mockResolvedValue(false),
        canWriteStorage: vi.fn().mockResolvedValue(false),
        migrationState: vi
          .fn()
          .mockResolvedValue({ current: '20260728000000_previous', pending: ['20260729000000_latest'] }),
        findExecutable: vi.fn().mockResolvedValue(null),
      }),
    )

    expect(result.ready).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'DATABASE_UNREACHABLE',
      'MIGRATIONS_PENDING',
      'STORAGE_NOT_WRITABLE',
      'PG_DUMP_MISSING',
      'PG_RESTORE_MISSING',
    ])
  })

  it('returns ready only when database, migration, storage, port and tools are healthy', async () => {
    const result = await inspectStartupEnvironment(
      {
        databaseUrl: 'postgresql://app@127.0.0.1:5432/rd_manager_workbench?schema=app',
        storageRoot: '/tmp/rd-workbench-storage',
        backendPort: 4311,
        expectedMigrationHead: '20260729000000_latest',
        platform: 'linux',
      },
      probe(),
    )

    expect(result).toMatchObject({ ready: true, issues: [] })
  })
})

describe('postgres tool candidates', () => {
  it('includes Windows installer locations and PATH names without shell expansion', () => {
    expect(
      postgresToolCandidates('pg_dump', {
        platform: 'win32',
        programFiles: 'C:\\Program Files',
        programFilesX86: 'C:\\Program Files (x86)',
      }),
    ).toEqual(
      expect.arrayContaining([
        'pg_dump.exe',
        'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
        'C:\\Program Files (x86)\\PostgreSQL\\17\\bin\\pg_dump.exe',
      ]),
    )
  })
})
