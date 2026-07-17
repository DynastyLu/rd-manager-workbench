import { validateEnv } from '../../../../src/infrastructure/config/env.schema';

describe('validateEnv', () => {
  it('parses a valid env object', () => {
    const env = validateEnv({
      NODE_ENV: 'local',
      PORT: '4000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app?schema=platform',
    });

    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('local');
    expect(env.DATABASE_URL).toContain('postgresql://');
    expect(env.COPYRIGHT_RISK_PROVIDER).toBe('heuristic');
    expect(env.COPYRIGHT_AI_TIMEOUT_MS).toBe(180000);
    expect(env.COPYRIGHT_AI_MAX_TOKENS).toBe(6000);
  });

  it('allows DATABASE_URL to be omitted for local mock-only startup', () => {
    const env = validateEnv({
      NODE_ENV: 'local',
      PORT: '3000',
    });

    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('treats empty optional provider keys as unset', () => {
    const env = validateEnv({
      NODE_ENV: 'local',
      PORT: '3000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app?schema=platform',
      ANTHROPIC_API_KEY: '',
      BAIDU_API_KEY: '',
      BAIDU_SECRET_KEY: '',
    });

    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.BAIDU_API_KEY).toBeUndefined();
    expect(env.BAIDU_SECRET_KEY).toBeUndefined();
  });

  it('parses queue, storage, and worker runtime env values', () => {
    const env = validateEnv({
      NODE_ENV: 'test',
      PORT: '3000',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/backend_core',
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '6379',
      QUEUE_PREFIX: 'backend-core-platform',
      JOB_SYNC_TIMEOUT_MS: '25000',
      LOCAL_STORAGE_ROOT: 'var/storage',
      OCR_WORKER_CONCURRENCY: '2',
      SERVICE_NAME: 'api',
      INSTANCE_ID: 'api-1',
      HOST: '0.0.0.0',
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: 'http://127.0.0.1:9000',
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'backend-core-platform',
      S3_ACCESS_KEY_ID: 'minio',
      S3_SECRET_ACCESS_KEY: 'minio-secret',
      S3_FORCE_PATH_STYLE: 'true',
      BAIDU_API_KEY: 'api-key',
      BAIDU_SECRET_KEY: 'secret-key',
      BAIDU_OCR_ENDPOINT: 'https://example.com/table',
      BAIDU_HANDWRITING_OCR_ENDPOINT: 'https://example.com/handwriting',
      BAIDU_GENERAL_OCR_ENDPOINT: 'https://example.com/general',
      BAIDU_TOKEN_ENDPOINT: 'https://example.com/token',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'password',
      JWT_SECRET: 'jwt-secret',
      JWT_EXPIRES_IN: '15m',
      REFRESH_TOKEN_EXPIRES_DAYS: '7',
      CORS_ORIGIN: 'http://localhost:5173',
      COPYRIGHT_RISK_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'anthropic-key',
      OCR_MAX_IMAGE_BYTES: '10485760',
      OCR_ALLOWED_MIME_TYPES: 'image/png,image/jpeg',
    });

    expect(env.REDIS_HOST).toBe('127.0.0.1');
    expect(env.REDIS_PORT).toBe(6379);
    expect(env.JOB_SYNC_TIMEOUT_MS).toBe(25000);
    expect(env.STORAGE_DRIVER).toBe('s3');
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    expect(env.OCR_WORKER_CONCURRENCY).toBe(2);
    expect(env.SERVICE_NAME).toBe('api');
    expect(env.INSTANCE_ID).toBe('api-1');
    expect(env.HOST).toBe('0.0.0.0');
    expect(env.BAIDU_OCR_ENDPOINT).toBe('https://example.com/table');
    expect(env.BAIDU_HANDWRITING_OCR_ENDPOINT).toBe('https://example.com/handwriting');
    expect(env.BAIDU_GENERAL_OCR_ENDPOINT).toBe('https://example.com/general');
    expect(env.ADMIN_USERNAME).toBe('admin');
    expect(env.REFRESH_TOKEN_EXPIRES_DAYS).toBe(7);
    expect(env.OCR_MAX_IMAGE_BYTES).toBe(10485760);
    expect(env.OCR_ALLOWED_MIME_TYPES).toEqual(['image/png', 'image/jpeg']);
    expect(env.COPYRIGHT_RISK_PROVIDER).toBe('anthropic');
  });

  it('parses Anthropic-compatible copyright AI provider settings', () => {
    const env = validateEnv({
      NODE_ENV: 'local',
      COPYRIGHT_RISK_PROVIDER: 'anthropic-compatible',
      COPYRIGHT_AI_BASE_URL: 'https://dashscope.aliyuncs.com/apps/anthropic',
      COPYRIGHT_AI_API_KEY: 'dashscope-key',
      COPYRIGHT_AI_MODEL: 'qwen3-vl-plus',
      COPYRIGHT_AI_TIMEOUT_MS: '45000',
      COPYRIGHT_AI_MAX_TOKENS: '7000',
    });

    expect(env.COPYRIGHT_RISK_PROVIDER).toBe('anthropic-compatible');
    expect(env.COPYRIGHT_AI_BASE_URL).toBe('https://dashscope.aliyuncs.com/apps/anthropic');
    expect(env.COPYRIGHT_AI_API_KEY).toBe('dashscope-key');
    expect(env.COPYRIGHT_AI_MODEL).toBe('qwen3-vl-plus');
    expect(env.COPYRIGHT_AI_TIMEOUT_MS).toBe(45000);
    expect(env.COPYRIGHT_AI_MAX_TOKENS).toBe(7000);
  });
});
