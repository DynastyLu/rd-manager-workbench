import { z } from 'zod';

const applicationDatabaseName = 'rd_manager_workbench';
const testDatabaseName = 'rd_manager_workbench_test';
const nonProductionJwtAccessSecret = 'local-development-only-jwt-secret-change-before-production';
const knownUnsafeJwtAccessSecrets = new Set([
  'development-only-replace-with-a-random-secret',
  nonProductionJwtAccessSecret,
]);
const defaultAdminPassword = 'RdManager2026!';
const passwordHasLetterAndDigit = /^(?=.*[A-Za-z])(?=.*\d).+$/;

const booleanFromEnvironment = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue === 'true') return true;
    if (normalizedValue === 'false') return false;
  }
  return value;
}, z.boolean());

const approvedDatabaseUrl = z
  .string()
  .min(1)
  .superRefine((value, context) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DATABASE_URL must be a PostgreSQL URL',
      });
      return;
    }

    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DATABASE_URL must be a PostgreSQL URL',
      });
    }
    if (url.hostname !== '127.0.0.1') {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'DATABASE_URL must use 127.0.0.1' });
    }
    if (url.port && url.port !== '5432') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DATABASE_URL must use PostgreSQL port 5432',
      });
    }
    if (decodeURIComponent(url.username) !== 'rd_manager_workbench_app') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DATABASE_URL must use the rd_manager_workbench_app role',
      });
    }
    const schemas = url.searchParams.getAll('schema');
    if (schemas.length !== 1 || schemas[0] !== 'app') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DATABASE_URL must select exactly one app schema',
      });
    }
  })
  .transform((value) => {
    const url = new URL(value);
    url.searchParams.set('connection_limit', '5');
    return url.toString();
  });

export const appEnvSchema = z
  .object({
    NODE_ENV: z.enum(['local', 'dev', 'test', 'prod']).default('local'),
    SERVICE_NAME: z.string().min(1).default('rd-manager-workbench'),
    INSTANCE_ID: z
      .string()
      .min(1)
      .default(() => process.env.HOSTNAME || 'local-instance'),
    HOST: z.literal('127.0.0.1').default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4311),
    DATABASE_URL: approvedDatabaseUrl,
    LOCAL_STORAGE_ROOT: z.string().min(1).default('var/storage'),
    BACKUP_PROCESS_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(3_600_000).default(300_000),
    APP_MIGRATION_HEAD: z.string().regex(/^\d{14}_[a-z0-9_]+$/).optional(),
    JWT_ACCESS_SECRET: z.string().min(32).optional(),
    JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    JWT_REFRESH_REMEMBER_TTL_DAYS: z.coerce.number().int().min(7).max(90).default(30),
    AUTH_COOKIE_NAME: z.string().min(1).default('rd_refresh'),
    AUTH_COOKIE_SECURE: booleanFromEnvironment.default(false),
    AUTH_ALLOWED_ORIGINS: z.string().min(1).default('http://127.0.0.1:4312,http://localhost:4312'),
    DEFAULT_ADMIN_USERNAME: z.string().min(1).max(100).default('admin'),
    DEFAULT_ADMIN_PASSWORD: z
      .string()
      .min(10)
      .regex(
        passwordHasLetterAndDigit,
        'DEFAULT_ADMIN_PASSWORD must contain at least one letter and one digit',
      )
      .default(defaultAdminPassword),
  })
  .superRefine((environment, context) => {
    const expectedDatabaseName =
      environment.NODE_ENV === 'test' ? testDatabaseName : applicationDatabaseName;
    const databaseName = decodeURIComponent(new URL(environment.DATABASE_URL).pathname.slice(1));

    if (databaseName !== expectedDatabaseName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `DATABASE_URL must target the ${expectedDatabaseName} database`,
        path: ['DATABASE_URL'],
      });
    }

    if (
      environment.NODE_ENV === 'prod' &&
      (environment.JWT_ACCESS_SECRET === undefined ||
        environment.JWT_ACCESS_SECRET.length < 32 ||
        knownUnsafeJwtAccessSecrets.has(environment.JWT_ACCESS_SECRET))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_ACCESS_SECRET must be at least 32 characters in production',
        path: ['JWT_ACCESS_SECRET'],
      });
    }

    if (
      environment.NODE_ENV === 'prod' &&
      environment.DEFAULT_ADMIN_PASSWORD === defaultAdminPassword
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DEFAULT_ADMIN_PASSWORD must be changed in production',
        path: ['DEFAULT_ADMIN_PASSWORD'],
      });
    }
  })
  .transform((environment) => {
    return {
      ...environment,
      JWT_ACCESS_SECRET: environment.JWT_ACCESS_SECRET ?? nonProductionJwtAccessSecret,
    };
  });

export type AppEnv = z.infer<typeof appEnvSchema>;

export function validateEnv(rawEnv: Record<string, unknown>): AppEnv {
  const environment = appEnvSchema.parse(rawEnv);
  if (
    typeof rawEnv.DATABASE_URL === 'string' &&
    process.env.DATABASE_URL === rawEnv.DATABASE_URL
  ) {
    process.env.DATABASE_URL = environment.DATABASE_URL;
  }
  return environment;
}
