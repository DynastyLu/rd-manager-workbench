import { NotificationStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { RequestContextService } from '../../../../src/infrastructure/context/request-context.service';
import { NotificationsService } from '../../../../src/modules/workbench/notifications/application/notifications.service';

const mockRequestContext = {
  requirePrincipal: jest.fn().mockReturnValue({
    userId: 'user-1',
    employeeId: 'employee-1',
    username: 'tester',
    sessionId: 'session-1',
    roleCodes: ['EMPLOYEE'],
    permissions: [],
    permissionVersion: 1,
    mustChangePassword: false,
  }),
} as unknown as RequestContextService;

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
    const service = new NotificationsService(prisma, mockRequestContext);

    await expect(
      service.list({ status: NotificationStatus.UNREAD, page: 2, pageSize: 10 }),
    ).resolves.toEqual({
      data: [{ id: 'notification-1' }],
      meta: { page: 2, pageSize: 10, total: 1 },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { status: NotificationStatus.UNREAD, reminderRule: { ownerUserId: 'user-1' } },
      orderBy: [{ triggeredAt: 'desc' }, { id: 'desc' }],
      skip: 10,
      take: 10,
    });
    expect(count).toHaveBeenCalledWith({ where: { status: NotificationStatus.UNREAD, reminderRule: { ownerUserId: 'user-1' } } });
    expect(prisma.$transaction).toHaveBeenCalledWith([findManyQuery, countQuery]);
  });
});
