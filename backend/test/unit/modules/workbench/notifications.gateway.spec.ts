import { Notification } from '@prisma/client';
import { NotificationsGateway } from '../../../../src/modules/workbench/notifications/notifications.gateway';

const mockAuthService = {
  authenticateBearer: jest.fn(),
} as never;

describe('NotificationsGateway', () => {
  it('broadcasts the stable notification.created event contract', () => {
    const emit = jest.fn();
    const notification = {
      id: 'notification-1',
      title: '面试提醒',
      body: '日程提醒已到期',
      status: 'UNREAD',
      sourceType: 'CALENDAR_EVENT',
      sourceId: 'event-1',
      sourcePath: '/calendar?eventId=event-1',
    } as Notification;
    const gateway = new NotificationsGateway(mockAuthService);
    Object.assign(gateway, { server: { emit } });

    gateway.publish(notification);

    expect(emit).toHaveBeenCalledWith('notification.created', notification);
  });
});
