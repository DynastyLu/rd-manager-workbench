import { spawn } from 'node:child_process'
import path from 'node:path'

import { Client } from 'pg'

import {
  createBootstrapPlan,
  quoteIdentifier,
  type ApprovedDatabaseName,
  type BootstrapPlan,
} from './bootstrap-plan'

const ROLE_CONNECTION_LIMIT = 10
const ADVISORY_LOCK_NAMESPACE = 1_837_434_449
const ADVISORY_LOCK_RESOURCE = 1_658_538_864

export interface BootstrapDatabaseOptions {
  databaseAdminUrl: string
  databaseUrl: string
  databaseName: ApprovedDatabaseName
  roleName: string
  schemaPath?: string
}

interface RoleState {
  rolcanlogin: boolean
  rolconnlimit: number
  rolcreatedb: boolean
  rolcreaterole: boolean
  rolsuper: boolean
}

export async function bootstrapDatabase(options: BootstrapDatabaseOptions): Promise<void> {
  const plan = createBootstrapPlan({
    databaseName: options.databaseName,
    roleName: options.roleName,
  })
  assertBootstrapUrls(options, plan)

  const adminClient = new Client({
    application_name: 'rd_manager_workbench_bootstrap',
    connectionString: options.databaseAdminUrl,
  })
  let lockAcquired = false

  try {
    await adminClient.connect()
    await adminClient.query('select pg_advisory_lock($1::integer, $2::integer)', [
      ADVISORY_LOCK_NAMESPACE,
      ADVISORY_LOCK_RESOURCE,
    ])
    lockAcquired = true

    await ensureRole(adminClient, plan)
    await ensureDatabase(adminClient, plan)
    await ensureTargetSchema(options.databaseAdminUrl, plan)
    await deployMigrations(options.databaseUrl, options.schemaPath ?? defaultSchemaPath())
  } finally {
    if (lockAcquired) {
      await adminClient
        .query('select pg_advisory_unlock($1::integer, $2::integer)', [
          ADVISORY_LOCK_NAMESPACE,
          ADVISORY_LOCK_RESOURCE,
        ])
        .catch(() => undefined)
    }

    await adminClient.end().catch(() => undefined)
  }
}

async function ensureRole(client: Client, plan: BootstrapPlan): Promise<void> {
  const result = await client.query<RoleState>(
    `select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolconnlimit
       from pg_roles
      where rolname = $1`,
    [plan.roleName],
  )

  if (result.rowCount === 0) {
    await client.query(
      `CREATE ROLE ${quoteIdentifier(plan.roleName)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT ${ROLE_CONNECTION_LIMIT}`,
    )
    return
  }

  const role = result.rows[0]
  if (
    result.rowCount !== 1 ||
    !role?.rolcanlogin ||
    role.rolsuper ||
    role.rolcreatedb ||
    role.rolcreaterole ||
    role.rolconnlimit !== ROLE_CONNECTION_LIMIT
  ) {
    throw new Error('Existing database role does not match the approved security profile')
  }
}

async function ensureDatabase(client: Client, plan: BootstrapPlan): Promise<void> {
  const result = await client.query<{ owner_name: string }>(
    `select pg_get_userbyid(datdba) as owner_name
       from pg_database
      where datname = $1`,
    [plan.databaseName],
  )

  if (result.rowCount === 0) {
    await client.query(
      `CREATE DATABASE ${quoteIdentifier(plan.databaseName)} OWNER ${quoteIdentifier(plan.roleName)}`,
    )
    return
  }

  if (result.rowCount !== 1 || result.rows[0]?.owner_name !== plan.roleName) {
    throw new Error('Existing database owner does not match the approved application role')
  }
}

async function ensureTargetSchema(databaseAdminUrl: string, plan: BootstrapPlan): Promise<void> {
  const targetAdminUrl = new URL(databaseAdminUrl)
  targetAdminUrl.pathname = `/${plan.databaseName}`

  const targetClient = new Client({
    application_name: 'rd_manager_workbench_schema_bootstrap',
    connectionString: targetAdminUrl.toString(),
  })

  try {
    await targetClient.connect()
    const result = await targetClient.query<{ owner_name: string }>(
      `select pg_get_userbyid(nspowner) as owner_name
         from pg_namespace
        where nspname = $1`,
      [plan.schemaName],
    )

    if (result.rowCount === 0) {
      await targetClient.query(
        `CREATE SCHEMA ${quoteIdentifier(plan.schemaName)} AUTHORIZATION ${quoteIdentifier(plan.roleName)}`,
      )
    } else if (result.rowCount !== 1 || result.rows[0]?.owner_name !== plan.roleName) {
      throw new Error('Existing schema owner does not match the approved application role')
    }

    await targetClient.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC')
  } finally {
    await targetClient.end().catch(() => undefined)
  }
}

function assertBootstrapUrls(options: BootstrapDatabaseOptions, plan: BootstrapPlan): void {
  const adminUrl = parsePostgresUrl(options.databaseAdminUrl, 'database admin URL')
  const databaseUrl = parsePostgresUrl(options.databaseUrl, 'database URL')

  if (adminUrl.hostname !== '127.0.0.1' || decodeURIComponent(adminUrl.pathname) !== '/postgres') {
    throw new Error('Database admin URL must target the local postgres maintenance database')
  }

  if (
    databaseUrl.hostname !== '127.0.0.1' ||
    decodeURIComponent(databaseUrl.pathname) !== `/${plan.databaseName}` ||
    decodeURIComponent(databaseUrl.username) !== plan.roleName ||
    databaseUrl.searchParams.get('schema') !== plan.schemaName
  ) {
    throw new Error('Database URL does not match the approved bootstrap plan')
  }
}

function parsePostgresUrl(value: string, label: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`Invalid ${label}`)
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error(`Invalid ${label}`)
  }

  return url
}

function defaultSchemaPath(): string {
  return path.resolve(__dirname, '../../../prisma/schema.prisma')
}

async function deployMigrations(databaseUrl: string, schemaPath: string): Promise<void> {
  const prismaCliPath = require.resolve('prisma/build/index.js')

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [prismaCliPath, 'migrate', 'deploy', '--schema', schemaPath],
      {
        cwd: path.resolve(path.dirname(schemaPath), '..'),
        env: { DATABASE_URL: databaseUrl },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )

    child.once('error', () => reject(new Error('Unable to start the database migration process')))
    child.once('close', (exitCode) => {
      if (exitCode === 0) {
        resolve()
        return
      }

      reject(new Error(`Database migration process failed with exit code ${exitCode ?? 'unknown'}`))
    })
  })
}
