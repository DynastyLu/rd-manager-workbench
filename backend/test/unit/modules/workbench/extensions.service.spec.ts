import { createHash } from 'node:crypto';
import { ExtensionsService } from '../../../../src/modules/workbench/extensions/application/extensions.service';

describe('ExtensionsService completion integrity', () => {
  it.each([
    'https://user:plain-password@dav.example.com',
    'https://dav.example.com/?access_token=plain-secret',
  ])('rejects secrets embedded in a public CalDAV/WebDAV base URL: %s', async (baseUrl) => {
    const prisma = { extensionProfile: { create: jest.fn() } };
    const service = new ExtensionsService(prisma as any, {} as any);

    await expect(service.createProfile({
      kind: 'CALENDAR', provider: 'CALDAV', name: 'Calendar', enabled: false,
      publicConfig: { baseUrl, calendarPath: '/calendar/', syncDirection: 'PULL_ONLY' },
      permissions: ['CALENDAR_SYNC_PREFLIGHT'],
    })).rejects.toMatchObject({ code: 'EXTENSION_SECRET_IN_CONFIG' });
    expect(prisma.extensionProfile.create).not.toHaveBeenCalled();
  });

  it('updates the linked SMS delivery inside the same transaction as the terminal run claim', async () => {
    const completionToken = 'one-time-completion-token';
    const running = {
      id: 'run-1', profileId: 'profile-1', operation: 'SMS_SEND', status: 'RUNNING',
      inputSha256: 'a'.repeat(64), inputBytes: 10, outputSha256: null, outputBytes: null,
      confirmationHash: 'b'.repeat(64),
      completionTokenHash: createHash('sha256').update(completionToken).digest('hex'),
      completionReceiptHash: null, errorCode: null, metadata: {},
      createdAt: new Date(), startedAt: new Date(), finishedAt: null,
    };
    const completed = {
      ...running, status: 'SUCCEEDED', outputSha256: createHash('sha256').update('null').digest('hex'),
      outputBytes: 4, completionTokenHash: null,
      completionReceiptHash: running.completionTokenHash, finishedAt: new Date(),
    };
    const tx = {
      extensionRun: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(completed),
      },
      smsDelivery: {
        findUnique: jest.fn().mockResolvedValue({ id: 'delivery-1', attemptCount: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      extensionRun: { findUnique: jest.fn().mockResolvedValue(running) },
      smsDelivery: { findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new ExtensionsService(
      prisma as any,
      { prepare: jest.fn().mockResolvedValue(null) } as any,
    );

    await service.completeRun('run-1', { completionToken, status: 'SUCCEEDED' });

    expect(tx.smsDelivery.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'delivery-1' }, data: expect.objectContaining({ status: 'SENT' }),
    }));
    expect(prisma.smsDelivery.findUnique).not.toHaveBeenCalled();
  });
});
