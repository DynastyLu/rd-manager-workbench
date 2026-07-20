import {
  classifySmsFailure,
  SmsDeliveryService,
} from '../../../../src/modules/workbench/extensions/application/sms-delivery.service';

describe('SmsDeliveryService', () => {
  const gateway = { publishRunRequested: jest.fn() };

  it('requires important + SMS channel + active recipient + template mapping', async () => {
    const prisma = {
      notification: { findUnique: jest.fn() },
      extensionProfile: { findFirst: jest.fn() },
      smsRecipient: { findMany: jest.fn() },
      smsDelivery: { upsert: jest.fn() },
    } as any;
    const service = new SmsDeliveryService(prisma, gateway as any);
    prisma.notification.findUnique.mockResolvedValue({
      id: 'notification-1',
      reminderRuleId: 'rule-1',
      sourceType: 'TASK',
      sourceId: 'task-1',
      scheduledFor: new Date('2026-07-20T01:00:00Z'),
      reminderRule: { important: false, channels: ['IN_APP'] },
    });
    await expect(service.queueForNotification('notification-1')).resolves.toEqual([]);
    expect(prisma.extensionProfile.findFirst).not.toHaveBeenCalled();

    prisma.notification.findUnique.mockResolvedValue({
      id: 'notification-1',
      reminderRuleId: 'rule-1',
      sourceType: 'TASK',
      sourceId: 'task-1',
      scheduledFor: new Date('2026-07-20T01:00:00Z'),
      reminderRule: { important: true, channels: ['IN_APP', 'SMS'] },
    });
    prisma.extensionProfile.findFirst.mockResolvedValue({
      id: 'profile-1',
      provider: 'ALIYUN_SMS',
      publicConfig: { templateMapping: { IMPORTANT_REMINDER: 'SMS_123' } },
    });
    prisma.smsRecipient.findMany.mockResolvedValue([]);
    await expect(service.queueForNotification('notification-1')).resolves.toEqual([]);
    expect(prisma.smsDelivery.upsert).not.toHaveBeenCalled();
  });

  it('creates one idempotent pending delivery per active recipient without a full phone', async () => {
    const prisma = {
      notification: { findUnique: jest.fn().mockResolvedValue({
        id: 'notification-1', reminderRuleId: 'rule-1', sourceType: 'TASK', sourceId: 'task-1',
        scheduledFor: new Date('2026-07-20T01:00:00Z'),
        reminderRule: { important: true, channels: ['IN_APP', 'SMS'] },
      }) },
      extensionProfile: { findFirst: jest.fn().mockResolvedValue({
        id: 'profile-1', provider: 'ALIYUN_SMS',
        publicConfig: { templateMapping: { IMPORTANT_REMINDER: 'SMS_123' } },
      }) },
      smsRecipient: { findMany: jest.fn().mockResolvedValue([
        { id: 'recipient-1', maskedPhone: '138****8000', credentialRef: 'credential:sms:1' },
      ]) },
      smsDelivery: { upsert: jest.fn().mockResolvedValue({
        id: 'delivery-1', status: 'PENDING', recipient: { maskedPhone: '138****8000' },
      }) },
    } as any;
    const service = new SmsDeliveryService(prisma, gateway as any);
    const deliveries = await service.queueForNotification('notification-1');
    expect(deliveries).toEqual([expect.objectContaining({ id: 'delivery-1', status: 'PENDING' })]);
    expect(prisma.smsDelivery.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ recipientId: 'recipient-1', templateKey: 'IMPORTANT_REMINDER' }),
    }));
    expect(JSON.stringify(prisma.smsDelivery.upsert.mock.calls)).not.toContain('13800008000');
  });

  it('classifies retryable failures with exponential retry and a hard three-attempt cap', () => {
    expect(classifySmsFailure({ attemptCount: 1, httpStatus: 400, errorCode: 'isv.INVALID_PARAMETERS' })).toEqual({ retry: false });
    expect(classifySmsFailure({ attemptCount: 1, httpStatus: 429 })).toEqual({ retry: true, delayMs: 60_000 });
    expect(classifySmsFailure({ attemptCount: 2, httpStatus: 503 })).toEqual({ retry: true, delayMs: 120_000 });
    expect(classifySmsFailure({ attemptCount: 3, errorCode: 'isp.SYSTEM_ERROR' })).toEqual({ retry: false });
  });

  it('claims each pending delivery before creating a provider run so overlapping schedulers cannot send twice', async () => {
    const delivery = {
      id: 'delivery-1', profileId: 'profile-1', recipientId: 'recipient-1', templateKey: 'IMPORTANT_REMINDER',
      recipient: { credentialRef: 'credential:recipient:1' },
      profile: {
        id: 'profile-1', provider: 'ALIYUN_SMS', kind: 'SMS', enabled: true,
        publicConfig: { templateMapping: { IMPORTANT_REMINDER: 'SMS_123' } },
        credentialRef: 'credential:provider:1', permissions: ['SMS_SEND'],
      },
      notification: null,
    };
    const prisma = {
      smsDelivery: {
        findMany: jest.fn().mockResolvedValue([delivery]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
      },
    } as any;
    const extensions = { prepareRun: jest.fn(), startRun: jest.fn() };
    const service = new SmsDeliveryService(prisma, gateway as any, extensions as any);

    await expect(service.dispatchDue()).resolves.toEqual({ requested: 0 });

    expect(prisma.smsDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'delivery-1', status: 'PENDING' },
      data: expect.objectContaining({ status: 'RUNNING' }),
    }));
    expect(extensions.prepareRun).not.toHaveBeenCalled();
  });
});
