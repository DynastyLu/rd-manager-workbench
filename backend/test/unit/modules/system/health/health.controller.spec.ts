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
      {} as never,
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
});
