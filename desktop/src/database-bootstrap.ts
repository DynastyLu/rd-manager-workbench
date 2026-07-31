export interface MigrationDeploymentInput {
  databaseUrl: string
  nodeExecutable: string
  prismaCliPath: string
  schemaPath: string
}

export interface DatabaseBootstrapInput {
  databaseUrl: string
  adminDatabaseUrl: string
  psqlExecutable: string
}

export interface ProcessInvocation {
  executable: string
  args: string[]
  env: NodeJS.ProcessEnv
}

export type RunMigrationProcess = (
  invocation: ProcessInvocation,
) => Promise<{ stdout: string; stderr: string }>

export function validateLocalDatabaseUrl(source: string): URL {
  let url: URL
  try {
    url = new URL(source)
  } catch {
    throw new Error('LOCAL_DATABASE_URL_INVALID')
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''))
  const localHost = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  const allowedProtocol = url.protocol === 'postgresql:' || url.protocol === 'postgres:'
  if (
    !allowedProtocol ||
    !localHost ||
    database !== 'rd_manager_workbench' ||
    url.username !== 'rd_manager_workbench_app'
  ) {
    throw new Error('LOCAL_DATABASE_URL_INVALID')
  }
  return url
}

function validateLocalAdminUrl(source: string): URL {
  let url: URL
  try {
    url = new URL(source)
  } catch {
    throw new Error('LOCAL_DATABASE_ADMIN_URL_INVALID')
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (
    (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:')
    || (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')
    || database !== 'postgres'
  ) {
    throw new Error('LOCAL_DATABASE_ADMIN_URL_INVALID')
  }
  return url
}

function postgresAdminEnvironment(url: URL): NodeJS.ProcessEnv {
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')),
    ...(url.username ? { PGUSER: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { PGPASSWORD: decodeURIComponent(url.password) } : {}),
    PGCONNECT_TIMEOUT: '5',
  }
}

export async function bootstrapLocalDatabase(
  input: DatabaseBootstrapInput,
  run: RunMigrationProcess,
): Promise<void> {
  validateLocalDatabaseUrl(input.databaseUrl)
  const adminUrl = validateLocalAdminUrl(input.adminDatabaseUrl)
  const env = postgresAdminEnvironment(adminUrl)
  const execute = (sql: string) => run({
    executable: input.psqlExecutable,
    args: ['--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--command', sql],
    env,
  })

  const role = await execute(
    "SELECT 1 FROM pg_roles WHERE rolname = 'rd_manager_workbench_app'",
  )
  if (role.stdout.trim() !== '1') {
    await execute(
      'CREATE ROLE rd_manager_workbench_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE',
    )
  }
  const database = await execute(
    "SELECT 1 FROM pg_database WHERE datname = 'rd_manager_workbench'",
  )
  if (database.stdout.trim() !== '1') {
    await execute('CREATE DATABASE rd_manager_workbench OWNER rd_manager_workbench_app')
  }
}

export async function deployLocalMigrations(
  input: MigrationDeploymentInput,
  run: RunMigrationProcess,
): Promise<void> {
  validateLocalDatabaseUrl(input.databaseUrl)
  await run({
    executable: input.nodeExecutable,
    args: [
      input.prismaCliPath,
      'migrate',
      'deploy',
      '--schema',
      input.schemaPath,
    ],
    env: {
      DATABASE_URL: input.databaseUrl,
      ELECTRON_RUN_AS_NODE: '1',
    },
  })
}
