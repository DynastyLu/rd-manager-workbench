import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import { Client } from 'pg'

import { bootstrapDatabase } from '../../src/infrastructure/database/bootstrap-database'
import {
  APPROVED_DATABASE_ROLE,
  type ApprovedDatabaseName,
} from '../../src/infrastructure/database/bootstrap-plan'

const TEST_DATABASE_NAME: ApprovedDatabaseName = 'rd_manager_workbench_test'
const ADMIN_URL = 'postgresql://dynastylu@127.0.0.1:5432/postgres?connect_timeout=5'
const TEST_DATABASE_URL =
  'postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench_test?schema=app&connect_timeout=5&connection_limit=5'

const adminClient = new Client({ connectionString: ADMIN_URL })
const databaseClient = new Client({
  connectionString: TEST_DATABASE_URL,
  application_name: 'rd_manager_workbench_bootstrap_test',
})

describe('bootstrapDatabase', () => {
  beforeAll(async () => {
    expect(TEST_DATABASE_NAME).toBe('rd_manager_workbench_test')
    expect(TEST_DATABASE_NAME.endsWith('_test')).toBe(true)

    await bootstrapDatabase({
      databaseAdminUrl: ADMIN_URL,
      databaseUrl: TEST_DATABASE_URL,
      databaseName: TEST_DATABASE_NAME,
      roleName: APPROVED_DATABASE_ROLE,
    })
    await bootstrapDatabase({
      databaseAdminUrl: ADMIN_URL,
      databaseUrl: TEST_DATABASE_URL,
      databaseName: TEST_DATABASE_NAME,
      roleName: APPROVED_DATABASE_ROLE,
    })

    await adminClient.connect()
    await databaseClient.connect()
  })

  afterAll(async () => {
    await Promise.allSettled([adminClient.end(), databaseClient.end()])
  })

  it('creates a constrained login role without administrative capabilities', async () => {
    const result = await adminClient.query<{
      rolcanlogin: boolean
      rolconnlimit: number
      rolcreatedb: boolean
      rolcreaterole: boolean
      rolsuper: boolean
    }>(
      `select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolconnlimit
         from pg_roles
        where rolname = $1`,
      [APPROVED_DATABASE_ROLE],
    )

    expect(result.rows).toEqual([
      {
        rolcanlogin: true,
        rolconnlimit: 10,
        rolcreatedb: false,
        rolcreaterole: false,
        rolsuper: false,
      },
    ])
  })

  it('owns the test database with the approved app role', async () => {
    const result = await adminClient.query<{ owner_name: string }>(
      `select pg_get_userbyid(datdba) as owner_name
         from pg_database
        where datname = $1`,
      [TEST_DATABASE_NAME],
    )

    expect(result.rows).toEqual([{ owner_name: APPROVED_DATABASE_ROLE }])
  })

  it('owns the app schema and removes public create access in the target database', async () => {
    const result = await databaseClient.query<{
      owner_name: string
      public_can_create: boolean
    }>(
      `select pg_get_userbyid(nspowner) as owner_name,
              has_schema_privilege('public', nspname, 'CREATE') as public_can_create
         from pg_namespace
        where nspname = 'app'`,
    )

    expect(result.rows).toEqual([
      {
        owner_name: APPROVED_DATABASE_ROLE,
        public_can_create: false,
      },
    ])
  })

  it('deploys the baseline metadata table and records its migration', async () => {
    const result = await databaseClient.query<{
      app_metadata: string | null
      migration_count: string
      migrations_table: string | null
    }>(
      `select to_regclass('app.app_metadata')::text as app_metadata,
              to_regclass('app._prisma_migrations')::text as migrations_table,
              (select count(*)::text from app._prisma_migrations where finished_at is not null and rolled_back_at is null) as migration_count`,
    )

    expect(result.rows).toEqual([
      {
        app_metadata: 'app.app_metadata',
        migration_count: '1',
        migrations_table: 'app._prisma_migrations',
      },
    ])
  })
})
