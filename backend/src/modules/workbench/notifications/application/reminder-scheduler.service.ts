import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import {
  Notification,
  NotificationStatus,
  Prisma,
  ReminderSourceType,
  TaskStatus,
  MeetingStatus,
} from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { NotificationsGateway } from '../notifications.gateway';

const SCAN_INTERVAL_MS = 30_000;
const SCHEDULER_LOCK_KEY = 77_190_425;

@Injectable()
export class ReminderSchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ReminderSchedulerService.name);
  private scanTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    void this.scanDue().catch((error: unknown) =>
      this.logger.error(
        'Initial reminder scan failed',
        error instanceof Error ? error.stack : error,
      ),
    );
    this.scanTimer = setInterval(() => {
      void this.scanDue().catch((error: unknown) =>
        this.logger.error('Reminder scan failed', error instanceof Error ? error.stack : error),
      );
    }, SCAN_INTERVAL_MS);
    this.scanTimer.unref();
  }

  onApplicationShutdown() {
    if (this.scanTimer) clearInterval(this.scanTimer);
  }

  async scanDue(now = new Date()) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${SCHEDULER_LOCK_KEY}) IS NULL AS acquired`;
      const created = await this.createDueNotifications(tx, now);
      const resurfaced = await this.resurfaceSnoozedNotifications(tx, now);
      return { created, resurfaced };
    });
    const notifications = [...result.created, ...result.resurfaced];
    for (const notification of notifications) this.gateway.publish(notification);
    return {
      created: result.created.length,
      resurfaced: result.resurfaced.length,
      notifications,
    };
  }

  private async createDueNotifications(tx: Prisma.TransactionClient, now: Date) {
    const rules = await tx.reminderRule.findMany({
      where: {
        archivedAt: null,
        remindAt: { lte: now },
        notification: null,
      },
      orderBy: [{ remindAt: 'asc' }, { id: 'asc' }],
    });
    const notifications: Notification[] = [];
    for (const rule of rules) {
      const source = await this.resolveSource(tx, rule.sourceType, rule.sourceId);
      if (!source) {
        await tx.reminderRule.update({ where: { id: rule.id }, data: { archivedAt: now } });
        continue;
      }
      notifications.push(
        await tx.notification.create({
          data: {
            reminderRuleId: rule.id,
            title: source.title,
            body: this.notificationBody(rule.sourceType),
            status: NotificationStatus.UNREAD,
            sourceType: rule.sourceType,
            sourceId: rule.sourceId,
            sourcePath: this.sourcePath(rule.sourceType, rule.sourceId),
            scheduledFor: rule.remindAt,
            triggeredAt: now,
          },
        }),
      );
    }
    return notifications;
  }

  private async resurfaceSnoozedNotifications(tx: Prisma.TransactionClient, now: Date) {
    const due = await tx.notification.findMany({
      where: {
        status: NotificationStatus.SNOOZED,
        snoozedUntil: { lte: now },
        reminderRule: { archivedAt: null },
      },
      orderBy: [{ snoozedUntil: 'asc' }, { id: 'asc' }],
    });
    const resurfaced: Notification[] = [];
    for (const notification of due) {
      resurfaced.push(
        await tx.notification.update({
          where: { id: notification.id },
          data: {
            status: NotificationStatus.UNREAD,
            triggeredAt: now,
            readAt: null,
            dismissedAt: null,
            snoozedUntil: null,
          },
        }),
      );
    }
    return resurfaced;
  }

  private async resolveSource(
    tx: Prisma.TransactionClient,
    sourceType: ReminderSourceType,
    sourceId: string,
  ) {
    return sourceType === ReminderSourceType.TASK
      ? tx.workTask.findFirst({
          where: {
            id: sourceId,
            archivedAt: null,
            status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED] },
          },
          select: { title: true },
        })
      : sourceType === ReminderSourceType.CALENDAR_EVENT
        ? tx.calendarEvent.findFirst({
            where: { id: sourceId, archivedAt: null },
            select: { title: true },
          })
        : tx.meeting.findFirst({
            where: {
              id: sourceId,
              archivedAt: null,
              status: { not: MeetingStatus.CANCELLED },
            },
            select: { title: true },
          });
  }

  private notificationBody(sourceType: ReminderSourceType) {
    if (sourceType === ReminderSourceType.TASK) return '任务提醒已到期';
    if (sourceType === ReminderSourceType.CALENDAR_EVENT) return '日程提醒已到期';
    return '会议提醒已到期';
  }

  private sourcePath(sourceType: ReminderSourceType, sourceId: string) {
    const encodedId = encodeURIComponent(sourceId);
    if (sourceType === ReminderSourceType.TASK) return `/my-work?taskId=${encodedId}`;
    if (sourceType === ReminderSourceType.CALENDAR_EVENT) return `/calendar?eventId=${encodedId}`;
    return `/meetings?meetingId=${encodedId}`;
  }
}
