import path from 'node:path'

import { z } from 'zod'

import { APPROVED_DATABASE_NAMES, APPROVED_DATABASE_ROLE } from '../database/bootstrap-plan'

const portSchema = z.preprocess((value) => {
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value)
  }

  return value
}, z.number().int().min(0).max(65_535))

const booleanStringSchema = z.preprocess((value) => {
  if (value === undefined || value === false || value === 'false') {
    return false
  }

  if (value === true || value === 'true') {
    return true
  }

  return value
}, z.boolean())

const postgresUrlSchema = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol
      return protocol === 'postgresql:' || protocol === 'postgres:'
    } catch {
      return false
    }
  }, 'DATABASE_URL must be a PostgreSQL URL')

const databaseAdminUrlSchema = postgresUrlSchema.refine((value) => {
  const url = new URL(value)
  return url.hostname === '127.0.0.1' && decodeURIComponent(url.pathname) === '/postgres'
}, 'DATABASE_ADMIN_URL must target the local postgres maintenance database')

const absolutePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) => path.posix.isAbsolute(value) || path.win32.isAbsolute(value),
    'Path must be absolute',
  )

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.literal('127.0.0.1').default('127.0.0.1'),
    PORT: portSchema.default(0),
    DATABASE_ADMIN_URL: databaseAdminUrlSchema,
    DATABASE_URL: postgresUrlSchema,
    DATABASE_NAME: z.enum(APPROVED_DATABASE_NAMES),
    DATABASE_ROLE: z.literal(APPROVED_DATABASE_ROLE),
    INTERNAL_API_TOKEN: z.string().min(32),
    APP_DATA_DIR: absolutePathSchema,
    FILES_DIR: absolutePathSchema,
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    ENABLE_SWAGGER: booleanStringSchema.default(false),
  })
  .superRefine((environment, context) => {
    const databaseUrl = new URL(environment.DATABASE_URL)
    const urlDatabaseName = decodeURIComponent(databaseUrl.pathname.slice(1))
    const urlRoleName = decodeURIComponent(databaseUrl.username)

    if (databaseUrl.hostname !== '127.0.0.1') {
      context.addIssue({
        code: 'custom',
        message: 'DATABASE_URL must use the loopback database host',
        path: ['DATABASE_URL'],
      })
    }

    if (urlDatabaseName !== environment.DATABASE_NAME) {
      context.addIssue({
        code: 'custom',
        message: 'DATABASE_NAME must match the DATABASE_URL database',
        path: ['DATABASE_NAME'],
      })
    }

    if (
      environment.DATABASE_ROLE !== APPROVED_DATABASE_ROLE ||
      urlRoleName !== environment.DATABASE_ROLE
    ) {
      context.addIssue({
        code: 'custom',
        message: 'DATABASE_ROLE must match the approved DATABASE_URL role',
        path: ['DATABASE_ROLE'],
      })
    }

    if (databaseUrl.searchParams.get('schema') !== 'app') {
      context.addIssue({
        code: 'custom',
        message: 'DATABASE_URL must select the app schema',
        path: ['DATABASE_URL'],
      })
    }

    const expectedDatabaseName =
      environment.NODE_ENV === 'test' ? 'rd_manager_workbench_test' : 'rd_manager_workbench'
    if (environment.DATABASE_NAME !== expectedDatabaseName) {
      context.addIssue({
        code: 'custom',
        message:
          environment.NODE_ENV === 'test'
            ? 'NODE_ENV=test requires the approved test database'
            : 'Non-test runtime requires the approved production database',
        path: ['DATABASE_NAME'],
      })
    }
  })

export type Environment = z.infer<typeof environmentSchema>

export function parseEnvironment(environment: Record<string, unknown>): Environment {
  return environmentSchema.parse(environment)
}
