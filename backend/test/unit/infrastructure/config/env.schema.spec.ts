import { validateEnv } from '../../../../src/infrastructure/config/env.schema';

const localDatabaseUrl =
  'postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench?schema=app';
const testDatabaseUrl =
  'postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench_test?schema=app';
const normalizedLocalDatabaseUrl = `${localDatabaseUrl}&connection_limit=5`;
const normalizedTestDatabaseUrl = `${testDatabaseUrl}&connection_limit=5`;

describe('local workbench database configuration', () => {
  it('accepts the approved local PostgreSQL target', () => {
    expect(
      validateEnv({
        NODE_ENV: 'local',
        DATABASE_URL: localDatabaseUrl,
      }).DATABASE_URL,
    ).toBe(normalizedLocalDatabaseUrl);
  });

  it('normalizes an existing connection limit to the approved local pool size', () => {
    const environment = validateEnv({
      NODE_ENV: 'local',
      DATABASE_URL: `${localDatabaseUrl}&connection_limit=25`,
    });

    const databaseUrl = new URL(environment.DATABASE_URL);
    expect(databaseUrl.searchParams.getAll('connection_limit')).toEqual(['5']);
  });

  it('writes the normalized URL back for Prisma when validation reads the active process URL', () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = localDatabaseUrl;
    try {
      validateEnv({
        NODE_ENV: 'local',
        DATABASE_URL: process.env.DATABASE_URL,
      });

      expect(process.env.DATABASE_URL).toBe(normalizedLocalDatabaseUrl);
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it('defaults the loopback API listener to the isolated workbench port', () => {
    const environment = validateEnv({
      NODE_ENV: 'local',
      DATABASE_URL: localDatabaseUrl,
    });

    expect(environment.HOST).toBe('127.0.0.1');
    expect(environment.PORT).toBe(4311);
  });

  it.each([
    'postgresql://postgres@127.0.0.1:5432/rd_manager_workbench?schema=app',
    'postgresql://rd_manager_workbench_app@localhost:5432/rd_manager_workbench?schema=app',
    'postgresql://rd_manager_workbench_app@127.0.0.1:5432/another_database?schema=app',
    'postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench?schema=public',
  ])('rejects a database URL outside the approved local target: %s', (databaseUrl) => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'local',
        DATABASE_URL: databaseUrl,
      }),
    ).toThrow();
  });

  it('rejects a non-loopback HTTP listener', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'prod',
        HOST: '0.0.0.0',
        DATABASE_URL: localDatabaseUrl,
      }),
    ).toThrow();
  });

  it('requires the isolated test database when NODE_ENV=test', () => {
    expect(
      validateEnv({
        NODE_ENV: 'test',
        DATABASE_URL: testDatabaseUrl,
      }).DATABASE_URL,
    ).toBe(normalizedTestDatabaseUrl);

    expect(() =>
      validateEnv({
        NODE_ENV: 'test',
        DATABASE_URL: localDatabaseUrl,
      }),
    ).toThrow(/rd_manager_workbench_test/);
  });

  it('rejects duplicate schema query values', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'local',
        DATABASE_URL: `${localDatabaseUrl}&schema=public`,
      }),
    ).toThrow(/exactly one app schema/);
  });

  it.each([
    undefined,
    'short',
    'development-only-replace-with-a-random-secret',
    'local-development-only-jwt-secret-change-before-production',
  ])(
    'rejects an unsafe JWT access secret in production: %s',
    (jwtAccessSecret) => {
      expect(() =>
        validateEnv({
          NODE_ENV: 'prod',
          DATABASE_URL: localDatabaseUrl,
          JWT_ACCESS_SECRET: jwtAccessSecret,
        }),
      ).toThrow(/JWT_ACCESS_SECRET/);
    },
  );

  it('parses authentication lifetimes', () => {
    const environment = validateEnv({
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      JWT_ACCESS_SECRET: 'test-only-secret-with-at-least-32-characters',
      JWT_ACCESS_TTL_MINUTES: '15',
      JWT_REFRESH_TTL_DAYS: '7',
      JWT_REFRESH_REMEMBER_TTL_DAYS: '30',
    });

    expect(environment).toMatchObject({
      JWT_ACCESS_TTL_MINUTES: 15,
      JWT_REFRESH_TTL_DAYS: 7,
      JWT_REFRESH_REMEMBER_TTL_DAYS: 30,
    });
  });

  it('provides safe local authentication defaults', () => {
    const environment = validateEnv({
      NODE_ENV: 'local',
      DATABASE_URL: localDatabaseUrl,
    });

    expect(environment).toMatchObject({
      JWT_ACCESS_SECRET: expect.stringMatching(/^.{32,}$/),
      JWT_ACCESS_TTL_MINUTES: 15,
      JWT_REFRESH_TTL_DAYS: 7,
      JWT_REFRESH_REMEMBER_TTL_DAYS: 30,
      AUTH_COOKIE_NAME: 'rd_refresh',
      AUTH_COOKIE_SECURE: false,
      AUTH_ALLOWED_ORIGINS: 'http://127.0.0.1:4312,http://localhost:4312',
    });
  });

  it.each([
    ['JWT_ACCESS_TTL_MINUTES', '4'],
    ['JWT_ACCESS_TTL_MINUTES', '61'],
    ['JWT_REFRESH_TTL_DAYS', '0'],
    ['JWT_REFRESH_TTL_DAYS', '31'],
    ['JWT_REFRESH_REMEMBER_TTL_DAYS', '6'],
    ['JWT_REFRESH_REMEMBER_TTL_DAYS', '91'],
  ])('rejects an out-of-range authentication lifetime: %s=%s', (key, value) => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'test',
        DATABASE_URL: testDatabaseUrl,
        JWT_ACCESS_SECRET: 'test-only-secret-with-at-least-32-characters',
        [key]: value,
      }),
    ).toThrow();
  });
});
