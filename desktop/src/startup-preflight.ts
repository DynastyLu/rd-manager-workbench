import path from 'node:path'

export type StartupIssueCode =
  | 'BACKEND_PORT_IN_USE'
  | 'DATABASE_UNREACHABLE'
  | 'MIGRATIONS_PENDING'
  | 'STORAGE_NOT_WRITABLE'
  | 'PG_DUMP_MISSING'
  | 'PG_RESTORE_MISSING'

export interface StartupIssue {
  code: StartupIssueCode
  message: string
  repair:
    | 'CHANGE_OR_RELEASE_PORT'
    | 'START_OR_CONFIGURE_POSTGRES'
    | 'DEPLOY_MIGRATIONS'
    | 'CHOOSE_STORAGE_DIRECTORY'
    | 'LOCATE_POSTGRES_TOOLS'
  details?: Record<string, unknown>
}

export interface StartupEnvironment {
  databaseUrl: string
  storageRoot: string
  backendPort: number
  expectedMigrationHead?: string
  platform: NodeJS.Platform
}

export interface StartupProbe {
  isPortAvailable(port: number): Promise<boolean>
  canConnectDatabase(databaseUrl: string): Promise<boolean>
  migrationState(
    databaseUrl: string,
  ): Promise<{ current: string | null; pending: string[] }>
  canWriteStorage(storageRoot: string): Promise<boolean>
  findExecutable(candidates: string[]): Promise<string | null>
}

export interface PostgresCandidateOptions {
  platform: NodeJS.Platform
  programFiles?: string
  programFilesX86?: string
}

export function postgresToolCandidates(
  tool: 'pg_dump' | 'pg_restore' | 'psql',
  options: PostgresCandidateOptions,
): string[] {
  if (options.platform !== 'win32') return [tool]

  const executable = `${tool}.exe`
  const roots = [options.programFiles, options.programFilesX86].filter(
    (value): value is string => Boolean(value),
  )
  const versions = ['18', '17', '16', '15', '14', '13', '12']
  return [
    executable,
    ...roots.flatMap((root) =>
      versions.map((version) =>
        path.win32.join(root, 'PostgreSQL', version, 'bin', executable),
      ),
    ),
  ]
}

export async function inspectStartupEnvironment(
  environment: StartupEnvironment,
  probe: StartupProbe,
): Promise<{ ready: boolean; issues: StartupIssue[] }> {
  const [
    portAvailable,
    databaseReachable,
    migrationState,
    storageWritable,
    pgDump,
    pgRestore,
  ] = await Promise.all([
    probe.isPortAvailable(environment.backendPort),
    probe.canConnectDatabase(environment.databaseUrl),
    probe.migrationState(environment.databaseUrl),
    probe.canWriteStorage(environment.storageRoot),
    probe.findExecutable(
      postgresToolCandidates('pg_dump', {
        platform: environment.platform,
        programFiles: process.env['ProgramFiles'],
        programFilesX86: process.env['ProgramFiles(x86)'],
      }),
    ),
    probe.findExecutable(
      postgresToolCandidates('pg_restore', {
        platform: environment.platform,
        programFiles: process.env['ProgramFiles'],
        programFilesX86: process.env['ProgramFiles(x86)'],
      }),
    ),
  ])

  const issues: StartupIssue[] = []
  if (!portAvailable) {
    issues.push({
      code: 'BACKEND_PORT_IN_USE',
      message: `本地服务端口 ${environment.backendPort} 已被占用`,
      repair: 'CHANGE_OR_RELEASE_PORT',
    })
  }
  if (!databaseReachable) {
    issues.push({
      code: 'DATABASE_UNREACHABLE',
      message: '无法连接本机 PostgreSQL',
      repair: 'START_OR_CONFIGURE_POSTGRES',
    })
  }
  if (
    migrationState.pending.length > 0 ||
    (environment.expectedMigrationHead &&
      migrationState.current !== environment.expectedMigrationHead)
  ) {
    issues.push({
      code: 'MIGRATIONS_PENDING',
      message: '本地数据库需要更新',
      repair: 'DEPLOY_MIGRATIONS',
      details: {
        current: migrationState.current,
        expected: environment.expectedMigrationHead ?? null,
        pending: migrationState.pending,
      },
    })
  }
  if (!storageWritable) {
    issues.push({
      code: 'STORAGE_NOT_WRITABLE',
      message: '本地文件目录不可写',
      repair: 'CHOOSE_STORAGE_DIRECTORY',
      details: { storageRoot: environment.storageRoot },
    })
  }
  if (!pgDump) {
    issues.push({
      code: 'PG_DUMP_MISSING',
      message: '未找到 PostgreSQL 备份工具 pg_dump',
      repair: 'LOCATE_POSTGRES_TOOLS',
    })
  }
  if (!pgRestore) {
    issues.push({
      code: 'PG_RESTORE_MISSING',
      message: '未找到 PostgreSQL 恢复工具 pg_restore',
      repair: 'LOCATE_POSTGRES_TOOLS',
    })
  }
  return { ready: issues.length === 0, issues }
}
