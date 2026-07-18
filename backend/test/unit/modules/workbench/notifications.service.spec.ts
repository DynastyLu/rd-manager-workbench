import { NotificationStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { NotificationsService } from '../../../../src/modules/workbench/notifications/application/notifications.service';

describe('NotificationsService', () => {
  it('returns a filtered, newest-first notification page', async () => {
    const findManyQuery = Promise.resolve([{ id: 'notification-1' }]);
    const countQuery = Promise.resolve(1);
    const findMany = jest.fn().mockReturnValue(findManyQuery);
    const count = jest.fn().mockReturnValue(countQuery);
    const prisma = {
      notification: { findMany, count },
      $transaction: jest.fn().mockResolvedValue([[{ id: 'notification-1' }], 1]),
    } as unknown as PlatformPrismaService;
    const service = new NotificationsService(prisma);

    await expect(
      service.list({ status: NotificationStatus.UNREAD, page: 2, pageSize: 10 }),
    ).resolves.toEqual({
      data: [{ id: 'notification-1' }],
      meta: { page: 2, pageSize: 10, total: 1 },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { status: NotificationStatus.UNREAD },
      orderBy: [{ triggeredAt: 'desc' }, { id: 'desc' }],
      skip: 10,
      take: 10,
    });
    expect(count).toHaveBeenCalledWith({ where: { status: NotificationStatus.UNREAD } });
    expect(prisma.$transaction).toHaveBeenCalledWith([findManyQuery, countQuery]);
  });
});
