import { validateEnv } from '../../../../src/infrastructure/config/env.schema';

const localDatabaseUrl =
  'postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench?schema=app';

describe('local workbench database configuration', () => {
  it('accepts the approved local PostgreSQL target', () => {
    expect(
      validateEnv({
        NODE_ENV: 'local',
        DATABASE_URL: localDatabaseUrl,
      }).DATABASE_URL,
    ).toBe(localDatabaseUrl);
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
});
