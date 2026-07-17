import { HealthController } from '../../../../../src/modules/system/health/interface/http/health.controller';

describe('HealthController', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it('reports not_ready when an injected database client is unavailable without a real connection', async () => {
    process.env.DATABASE_URL =
      'postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench_test?schema=app';
    const controller = new HealthController(
      { $queryRaw: jest.fn().mockRejectedValue(new Error('database unavailable')) } as never,
      { checkHealth: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(controller.ready()).resolves.toEqual({
      status: 'not_ready',
      checks: {
        database: 'error',
        queue: 'unavailable',
        storage: 'ok',
      },
    });
  });

  it('reports storage ok only after the storage port health check succeeds', async () => {
    const storage = { checkHealth: jest.fn().mockResolvedValue(undefined) };
    const controller = new HealthController(
      { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) } as never,
      storage as never,
    );

    await expect(controller.ready()).resolves.toMatchObject({
      status: 'ready',
      checks: { database: 'ok', queue: 'unavailable', storage: 'ok' },
    });
    expect(storage.checkHealth).toHaveBeenCalledTimes(1);
  });

  it('reports not_ready with a storage error when the configured storage port health check fails', async () => {
    const storage = { checkHealth: jest.fn().mockRejectedValue(new Error('storage error')) };
    const controller = new HealthController(
      { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) } as never,
      storage as never,
    );

    await expect(controller.ready()).resolves.toMatchObject({
      status: 'not_ready',
      checks: { database: 'ok', queue: 'unavailable', storage: 'error' },
    });
  });
});
