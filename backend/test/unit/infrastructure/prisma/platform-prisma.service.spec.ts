import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';

describe('PlatformPrismaService', () => {
  it('connects and disconnects for the required local database', async () => {
    const service = new PlatformPrismaService();
    const connectSpy = jest.spyOn(service, '$connect').mockResolvedValue(undefined as never);
    const disconnectSpy = jest.spyOn(service, '$disconnect').mockResolvedValue(undefined as never);

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});
