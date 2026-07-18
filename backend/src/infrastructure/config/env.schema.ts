import { z } from 'zod';

const applicationDatabaseName = 'rd_manager_workbench';
const testDatabaseName = 'rd_manager_workbench_test';

const approvedDatabaseUrl = z.string().min(1).superRefine((value, context) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'DATABASE_URL must be a PostgreSQL URL' });
    return;
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'DATABASE_URL must be a PostgreSQL URL' });
  }
  if (url.hostname !== '127.0.0.1') {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'DATABASE_URL must use 127.0.0.1' });
  }
  if (url.port && url.port !== '5432') {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'DATABASE_URL must use PostgreSQL port 5432' });
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
  });

export type AppEnv = z.infer<typeof appEnvSchema>;

export function validateEnv(rawEnv: Record<string, unknown>): AppEnv {
  return appEnvSchema.parse(rawEnv);
}
