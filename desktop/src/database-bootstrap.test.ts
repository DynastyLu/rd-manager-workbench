import { describe, expect, it, vi } from 'vitest'
import {
  bootstrapLocalDatabase,
  deployLocalMigrations,
  validateLocalDatabaseUrl,
} from './database-bootstrap.js'

describe('database bootstrap', () => {
  it('rejects remote, credential-bearing or unexpected database targets', () => {
    expect(() =>
      validateLocalDatabaseUrl('postgresql://app:secret@example.com:5432/rd_manager_workbench'),
    ).toThrow('LOCAL_DATABASE_URL_INVALID')
    expect(() =>
      validateLocalDatabaseUrl('postgresql://app@127.0.0.1:5432/another_database'),
    ).toThrow('LOCAL_DATABASE_URL_INVALID')
  })

  it('deploys Prisma migrations with an explicit schema and minimal child environment', async () => {
    const run = vi.fn().mockResolvedValue({ stdout: 'Applied', stderr: '' })

    await deployLocalMigrations(
      {
        databaseUrl: 'postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench?schema=app',
        nodeExecutable: '/Applications/RD Workbench.app/Contents/MacOS/RD Workbench',
        prismaCliPath: '/app/backend/node_modules/prisma/build/index.js',
        schemaPath: '/app/backend/prisma/schema.prisma',
      },
      run,
    )

    expect(run).toHaveBeenCalledWith({
      executable: '/Applications/RD Workbench.app/Contents/MacOS/RD Workbench',
      args: [
        '/app/backend/node_modules/prisma/build/index.js',
        'migrate',
        'deploy',
        '--schema',
        '/app/backend/prisma/schema.prisma',
      ],
      env: {
        DATABASE_URL:
          'postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench?schema=app',
        ELECTRON_RUN_AS_NODE: '1',
      },
    })
  })

  it('idempotently creates the approved local role and database through a local admin connection', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'CREATE ROLE', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'CREATE DATABASE', stderr: '' })

    await bootstrapLocalDatabase(
      {
        databaseUrl:
          'postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench?schema=app',
        adminDatabaseUrl: 'postgresql://local_admin@127.0.0.1:5432/postgres',
        psqlExecutable: 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe',
      },
      run,
    )

    expect(run).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        args: expect.arrayContaining([
          'CREATE ROLE rd_manager_workbench_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE',
        ]),
      }),
    )
    expect(run).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        args: expect.arrayContaining([
          'CREATE DATABASE rd_manager_workbench OWNER rd_manager_workbench_app',
        ]),
      }),
    )
  })
})
