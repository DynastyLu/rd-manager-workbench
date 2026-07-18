import { validateEnv } from '../../../../src/infrastructure/config/env.schema';

const localDatabaseUrl =
  'postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench?schema=app';
const testDatabaseUrl =
  'postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench_test?schema=app';

describe('local workbench database configuration', () => {
  it('accepts the approved local PostgreSQL target', () => {
    expect(
      validateEnv({
        NODE_ENV: 'local',
        DATABASE_URL: localDatabaseUrl,
      }).DATABASE_URL,
    ).toBe(localDatabaseUrl);
  });

  it('defaults the loopback API listener to the isolated workbench port', () => {
    const environment = validateEnv({
      NODE_ENV: 'local',
      DATABASE_URL: localDatabaseUrl,
    });

    expect(environment.HOST).toBe('127.0.0.1');
    expect(environment.PORT).toBe(4301);
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
    ).toBe(testDatabaseUrl);

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
});
