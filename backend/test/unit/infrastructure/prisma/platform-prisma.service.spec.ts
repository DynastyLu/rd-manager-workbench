import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';

describe('PlatformPrismaService', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it('skips database connection when database url is missing', async () => {
    process.env.NODE_ENV = 'local';
    delete process.env.DATABASE_URL;

    const service = new PlatformPrismaService();
    const connectSpy = jest.spyOn(service, '$connect').mockResolvedValue(undefined as never);
    const disconnectSpy = jest.spyOn(service, '$disconnect').mockResolvedValue(undefined as never);

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(connectSpy).not.toHaveBeenCalled();
    expect(disconnectSpy).not.toHaveBeenCalled();
  });

  it('connects when the database url is present', async () => {
    process.env.NODE_ENV = 'local';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/app?schema=platform';

    const service = new PlatformPrismaService();
    const connectSpy = jest.spyOn(service, '$connect').mockResolvedValue(undefined as never);
    const disconnectSpy = jest.spyOn(service, '$disconnect').mockResolvedValue(undefined as never);

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});
