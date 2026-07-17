import fs from 'node:fs'
import path from 'node:path'

import { parse as parseDotenv } from 'dotenv'
import { z } from 'zod'

import { APPROVED_DATABASE_NAMES, APPROVED_DATABASE_ROLE } from './bootstrap-plan'

const BOOTSTRAP_ENVIRONMENT_KEYS = [
  'NODE_ENV',
  'DATABASE_ADMIN_URL',
  'DATABASE_URL',
  'DATABASE_NAME',
  'DATABASE_ROLE',
] as const

export type BootstrapEnvironmentErrorCode =
  | 'BOOTSTRAP_CONFIG_INVALID'
  | 'BOOTSTRAP_DEFAULTS_MISSING'
  | 'BOOTSTRAP_DEFAULTS_UNREADABLE'
  | 'BOOTSTRAP_LOCAL_ENV_UNREADABLE'

export class BootstrapEnvironmentError extends Error {
  constructor(readonly code: BootstrapEnvironmentErrorCode) {
    super(code)
    this.name = 'BootstrapEnvironmentError'
  }
}

const postgresUrlSchema = z.string().min(1).refine(isPostgresUrl)

const bootstrapEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    DATABASE_ADMIN_URL: postgresUrlSchema,
    DATABASE_URL: postgresUrlSchema,
    DATABASE_NAME: z.enum(APPROVED_DATABASE_NAMES),
    DATABASE_ROLE: z.literal(APPROVED_DATABASE_ROLE),
  })
  .superRefine((environment, context) => {
    const adminUrl = new URL(environment.DATABASE_ADMIN_URL)
    const databaseUrl = new URL(environment.DATABASE_URL)
    const expectedDatabaseName =
      environment.NODE_ENV === 'test' ? 'rd_manager_workbench_test' : 'rd_manager_workbench'

    if (
      adminUrl.hostname !== '127.0.0.1' ||
      decodeURIComponent(adminUrl.pathname) !== '/postgres'
    ) {
      context.addIssue({ code: 'custom', message: 'invalid admin target' })
    }

    if (
      databaseUrl.hostname !== '127.0.0.1' ||
      decodeURIComponent(databaseUrl.pathname.slice(1)) !== environment.DATABASE_NAME ||
      decodeURIComponent(databaseUrl.username) !== environment.DATABASE_ROLE ||
      databaseUrl.searchParams.get('schema') !== 'app'
    ) {
      context.addIssue({ code: 'custom', message: 'invalid database target' })
    }

    if (environment.DATABASE_NAME !== expectedDatabaseName) {
      context.addIssue({ code: 'custom', message: 'invalid environment database target' })
    }
  })

export type BootstrapEnvironment = z.infer<typeof bootstrapEnvironmentSchema>

interface LoadBootstrapEnvironmentOptions {
  workspaceRoot: string
  processEnvironment: Record<string, string | undefined>
}

export function parseBootstrapEnvironment(
  environment: Record<string, unknown>,
): BootstrapEnvironment {
  const result = bootstrapEnvironmentSchema.safeParse(environment)
  if (!result.success) {
    throw new BootstrapEnvironmentError('BOOTSTRAP_CONFIG_INVALID')
  }

  return result.data
}

export function loadBootstrapEnvironment(
  options: LoadBootstrapEnvironmentOptions,
): BootstrapEnvironment {
  const defaults = readEnvironmentFile(
    path.join(options.workspaceRoot, '.env.example'),
    'required-defaults',
  )
  const localOverrides = readEnvironmentFile(
    path.join(options.workspaceRoot, '.env.local'),
    'optional-local',
  )

  return parseBootstrapEnvironment({
    ...pickBootstrapEnvironment(defaults),
    ...pickBootstrapEnvironment(localOverrides),
    ...pickBootstrapEnvironment(options.processEnvironment),
  })
}

function readEnvironmentFile(
  filePath: string,
  kind: 'required-defaults' | 'optional-local',
): Record<string, string> {
  try {
    return parseDotenv(fs.readFileSync(filePath))
  } catch (error) {
    if (isMissingFileError(error)) {
      if (kind === 'optional-local') {
        return {}
      }

      throw new BootstrapEnvironmentError('BOOTSTRAP_DEFAULTS_MISSING')
    }

    throw new BootstrapEnvironmentError(
      kind === 'required-defaults'
        ? 'BOOTSTRAP_DEFAULTS_UNREADABLE'
        : 'BOOTSTRAP_LOCAL_ENV_UNREADABLE',
    )
  }
}

function pickBootstrapEnvironment(
  environment: Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    BOOTSTRAP_ENVIRONMENT_KEYS.flatMap((key) => {
      const value = environment[key]
      return typeof value === 'string' ? [[key, value]] : []
    }),
  )
}

function isPostgresUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol
    return protocol === 'postgresql:' || protocol === 'postgres:'
  } catch {
    return false
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}
