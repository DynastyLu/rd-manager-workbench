import { HttpStatus, Injectable } from '@nestjs/common';
import { ExtensionKind, Prisma, ReminderChannel, SmsDeliveryStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { ExtensionsGateway } from '../extensions.gateway';
import { ExtensionsService } from './extensions.service';

export interface SmsFailureInput {
  attemptCount: number;
  httpStatus?: number;
  errorCode?: string;
}

export function classifySmsFailure(input: SmsFailureInput): { retry: false } | { retry: true; delayMs: number } {
  if (input.attemptCount >= 3) return { retry: false };
  const retryable = input.httpStatus === 429
    || (input.httpStatus !== undefined && input.httpStatus >= 500)
    || input.errorCode === 'isp.SYSTEM_ERROR'
    || input.errorCode === 'NETWORK_TIMEOUT';
  return retryable ? { retry: true, delayMs: 60_000 * (2 ** Math.max(0, input.attemptCount - 1)) } : { retry: false };
}

@Injectable()
export class SmsDeliveryService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly gateway: ExtensionsGateway,
    private readonly extensions?: ExtensionsService,
  ) {}

  async queueForNotification(notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: { reminderRule: true },
    });
    if (
      !notification
      || !notification.reminderRule.important
      || !notification.reminderRule.channels.includes(ReminderChannel.SMS)
    ) return [];

    const profile = await this.prisma.extensionProfile.findFirst({
      where: { kind: ExtensionKind.SMS, enabled: true, archivedAt: null },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    if (!profile) return [];
    const config = profile.publicConfig as Record<string, unknown>;
    const mapping = config.templateMapping as Record<string, unknown> | undefined;
    const templateKey = 'IMPORTANT_REMINDER';
    if (typeof mapping?.[templateKey] !== 'string') return [];
    const recipients = await this.prisma.smsRecipient.findMany({
      where: { enabled: true, archivedAt: null },
      orderBy: [{ label: 'asc' }, { id: 'asc' }],
    });
    const deliveries: Array<Prisma.SmsDeliveryGetPayload<{
      include: { recipient: true; profile: true };
    }>> = [];
    for (const recipient of recipients) {
      deliveries.push(await this.prisma.smsDelivery.upsert({
        where: {
          reminderRuleId_recipientId_templateKey: {
            reminderRuleId: notification.reminderRuleId,
            recipientId: recipient.id,
            templateKey,
          },
        },
        update: {},
        create: {
          reminderRuleId: notification.reminderRuleId,
          notificationId: notification.id,
          recipientId: recipient.id,
          profileId: profile.id,
          templateKey,
          status: SmsDeliveryStatus.PENDING,
        },
        include: { recipient: true, profile: true },
      }));
    }
    return deliveries;
  }

  async dispatchDue(now = new Date()) {
    if (!this.extensions) return { requested: 0 };
    const deliveries = await this.prisma.smsDelivery.findMany({
      where: {
        status: SmsDeliveryStatus.PENDING,
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        recipient: { enabled: true, archivedAt: null },
        profile: { enabled: true, archivedAt: null },
      },
      include: { recipient: true, profile: true, notification: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 50,
    });
    let requested = 0;
    for (const delivery of deliveries) {
      const claim = await this.prisma.smsDelivery.updateMany({
        where: { id: delivery.id, status: SmsDeliveryStatus.PENDING },
        data: {
          status: SmsDeliveryStatus.RUNNING,
          attemptCount: { increment: 1 },
          nextAttemptAt: null,
          errorCode: null,
        },
      });
      if (!claim.count) continue;
      const operation = delivery.profile.provider === 'LOCAL_PREVIEW' ? 'SMS_PREVIEW' : 'SMS_SEND';
      const payload = {
        deliveryId: delivery.id,
        recipientId: delivery.recipientId,
        recipientCredentialRef: delivery.recipient.credentialRef,
        templateKey: delivery.templateKey,
        sourceType: delivery.notification?.sourceType,
        sourceId: delivery.notification?.sourceId,
        scheduledFor: delivery.notification?.scheduledFor.toISOString(),
      };
      try {
        const prepared = await this.extensions.prepareRun(delivery.profileId, { operation, payload });
        const started = await this.extensions.startRun(delivery.profileId, {
          operation,
          payload,
          confirmationHash: prepared.confirmationHash,
        });
        if (started.status === 'REJECTED') {
          await this.prisma.smsDelivery.update({
            where: { id: delivery.id },
            data: { status: SmsDeliveryStatus.PREVIEW, extensionRunId: started.id, errorCode: started.errorCode },
          });
          continue;
        }
        if (!('completionToken' in started) || typeof started.completionToken !== 'string') {
          throw new Error('EXTENSION_COMPLETION_TOKEN_MISSING');
        }
        await this.prisma.smsDelivery.update({
          where: { id: delivery.id },
          data: { extensionRunId: started.id },
        });
        this.gateway.publishRunRequested({
          runId: started.id,
          deliveryId: delivery.id,
          profile: {
            id: delivery.profile.id,
            kind: delivery.profile.kind,
            provider: delivery.profile.provider,
            enabled: delivery.profile.enabled,
            publicConfig: delivery.profile.publicConfig,
            credentialRef: delivery.profile.credentialRef,
            permissions: delivery.profile.permissions,
          },
          operation,
          inputSha256: started.inputSha256,
          completionToken: started.completionToken,
          payload,
        });
        requested += 1;
      } catch {
        await this.prisma.smsDelivery.updateMany({
          where: { id: delivery.id, status: SmsDeliveryStatus.RUNNING, extensionRunId: null },
          data: {
            status: SmsDeliveryStatus.PENDING,
            nextAttemptAt: new Date(now.getTime() + 60_000),
            errorCode: 'DISPATCH_PREPARE_FAILED',
          },
        });
      }
    }
    return { requested };
  }

  listRecipients() {
    return this.prisma.smsRecipient.findMany({
      where: { archivedAt: null },
      orderBy: [{ enabled: 'desc' }, { label: 'asc' }],
    });
  }

  createRecipient(input: { label: string; maskedPhone: string; credentialRef: string; enabled?: boolean }) {
    return this.prisma.smsRecipient.create({ data: { ...input, enabled: input.enabled ?? true } });
  }

  async updateRecipient(id: string, input: { label?: string; maskedPhone?: string; credentialRef?: string; enabled?: boolean }) {
    await this.requireRecipient(id);
    return this.prisma.smsRecipient.update({ where: { id }, data: input });
  }

  async archiveRecipient(id: string) {
    await this.requireRecipient(id);
    await this.prisma.smsRecipient.update({ where: { id }, data: { enabled: false, archivedAt: new Date() } });
  }

  listDeliveries() {
    return this.prisma.smsDelivery.findMany({
      include: { recipient: true, profile: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
  }

  private async requireRecipient(id: string) {
    const recipient = await this.prisma.smsRecipient.findFirst({ where: { id, archivedAt: null } });
    if (!recipient) {
      throw new AppError({ code: ErrorCodes.CREDENTIAL_NOT_FOUND, message: 'SMS recipient not found', statusCode: HttpStatus.NOT_FOUND });
    }
    return recipient;
  }
}
