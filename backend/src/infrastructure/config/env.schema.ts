import { z } from 'zod';

const commaSeparatedList = z.preprocess(
  (value) => {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value !== 'string') {
      return value;
    }
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  },
  z.array(z.string().min(1)),
);

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  return value;
};

const optionalNonEmptyString = () =>
  z.preprocess(emptyStringToUndefined, z.string().min(1).optional());
const optionalUrl = () => z.preprocess(emptyStringToUndefined, z.string().url().optional());

export const appEnvSchema = z.object({
  NODE_ENV: z.enum(['local', 'dev', 'test', 'prod']).default('local'),
  SERVICE_NAME: z.string().min(1).default('backend-core-platform'),
  INSTANCE_ID: z
    .string()
    .min(1)
    .default(() => process.env.HOSTNAME || 'local-instance'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1, 'DATABASE_URL must not be empty').optional(),
  ),
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: optionalNonEmptyString(),
  QUEUE_PREFIX: z.string().min(1).default('backend-core-platform'),
  JOB_SYNC_TIMEOUT_MS: z.coerce.number().int().positive().default(25000),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  LOCAL_STORAGE_ROOT: z.string().min(1).default('var/storage'),
  S3_ENDPOINT: optionalUrl(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: optionalNonEmptyString(),
  S3_ACCESS_KEY_ID: optionalNonEmptyString(),
  S3_SECRET_ACCESS_KEY: optionalNonEmptyString(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  OCR_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  ADMIN_USERNAME: z.string().min(1).default('admin'),
  ADMIN_PASSWORD: z.string().min(1).default('changeme123'),
  JWT_SECRET: z.string().min(1).default('dev-secret-change-in-production'),
  JWT_EXPIRES_IN: z.string().min(1).default('15m'),
  REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().int().positive().default(7),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  COPYRIGHT_RISK_PROVIDER: z
    .enum(['heuristic', 'anthropic', 'anthropic-compatible'])
    .default('heuristic'),
  COPYRIGHT_AI_BASE_URL: optionalUrl(),
  COPYRIGHT_AI_API_KEY: optionalNonEmptyString(),
  COPYRIGHT_AI_MODEL: optionalNonEmptyString(),
  COPYRIGHT_AI_TIMEOUT_MS: z.coerce.number().int().positive().default(180000),
  COPYRIGHT_AI_MAX_TOKENS: z.coerce.number().int().positive().default(6000),
  ANTHROPIC_BASE_URL: optionalUrl(),
  ANTHROPIC_AUTH_TOKEN: optionalNonEmptyString(),
  ANTHROPIC_MODEL: optionalNonEmptyString(),
  ANTHROPIC_API_KEY: optionalNonEmptyString(),
  BAIDU_API_KEY: optionalNonEmptyString(),
  BAIDU_SECRET_KEY: optionalNonEmptyString(),
  BAIDU_OCR_ENDPOINT: z.string().url().default('https://aip.baidubce.com/rest/2.0/ocr/v1/table'),
  BAIDU_HANDWRITING_OCR_ENDPOINT: z
    .string()
    .url()
    .default('https://aip.baidubce.com/rest/2.0/ocr/v1/handwriting'),
  BAIDU_GENERAL_OCR_ENDPOINT: z
    .string()
    .url()
    .default('https://aip.baidubce.com/rest/2.0/ocr/v1/general'),
  BAIDU_TOKEN_ENDPOINT: z.string().url().default('https://aip.baidubce.com/oauth/2.0/token'),
  OCR_MAX_IMAGE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  OCR_ALLOWED_MIME_TYPES: commaSeparatedList.default(['image/png', 'image/jpeg', 'image/jpg']),
});

export type AppEnv = z.infer<typeof appEnvSchema>;

export function validateEnv(rawEnv: Record<string, unknown>): AppEnv {
  return appEnvSchema.parse(rawEnv);
}
