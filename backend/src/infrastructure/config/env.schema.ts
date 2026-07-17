import { z } from 'zod';

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
  if (decodeURIComponent(url.pathname) !== '/rd_manager_workbench') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'DATABASE_URL must target the rd_manager_workbench database',
    });
  }
  if (url.searchParams.get('schema') !== 'app') {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'DATABASE_URL must select the app schema' });
  }
});

export const appEnvSchema = z.object({
  NODE_ENV: z.enum(['local', 'dev', 'test', 'prod']).default('local'),
  SERVICE_NAME: z.string().min(1).default('rd-manager-workbench'),
  INSTANCE_ID: z
    .string()
    .min(1)
    .default(() => process.env.HOSTNAME || 'local-instance'),
  HOST: z.literal('127.0.0.1').default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: approvedDatabaseUrl,
  LOCAL_STORAGE_ROOT: z.string().min(1).default('var/storage'),
});

export type AppEnv = z.infer<typeof appEnvSchema>;

export function validateEnv(rawEnv: Record<string, unknown>): AppEnv {
  return appEnvSchema.parse(rawEnv);
}
