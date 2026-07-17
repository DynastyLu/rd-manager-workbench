import path from 'node:path'

import { z } from 'zod'

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

const absolutePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) => path.posix.isAbsolute(value) || path.win32.isAbsolute(value),
    'Path must be absolute',
  )

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.literal('127.0.0.1').default('127.0.0.1'),
  PORT: portSchema.default(0),
  DATABASE_URL: postgresUrlSchema,
  INTERNAL_API_TOKEN: z.string().min(32),
  APP_DATA_DIR: absolutePathSchema,
  FILES_DIR: absolutePathSchema,
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  ENABLE_SWAGGER: booleanStringSchema.default(false),
})

export type Environment = z.infer<typeof environmentSchema>

export function parseEnvironment(environment: Record<string, unknown>): Environment {
  return environmentSchema.parse(environment)
}
