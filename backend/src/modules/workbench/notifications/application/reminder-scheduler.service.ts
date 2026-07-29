import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import {
  Notification,
  NotificationStatus,
  Prisma,
  ReminderSourceType,
  TaskStatus,
  MeetingStatus,
  EmployeePlanCarryStatus,
  EmployeeWorkImportStatus,
} from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { NotificationsGateway } from '../notifications.gateway';
import { SmsDeliveryService } from '../../extensions/application/sms-delivery.service';
import { acquireReminderSchedulingLock } from './reminder-scheduling-lock';

const SCAN_INTERVAL_MS = 30_000;

@Injectable()
export class ReminderSchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ReminderSchedulerService.name);
  private scanTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly gateway: NotificationsGateway,
    private readonly smsDelivery: SmsDeliveryService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test' || process.env.RD_MAINTENANCE_MODE === '1') return;
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
      await acquireReminderSchedulingLock(tx);
      const created = await this.createDueNotifications(tx, now);
      const resurfaced = await this.resurfaceSnoozedNotifications(tx, now);
      return { created, resurfaced };
    });
    const notifications = [...result.created, ...result.resurfaced];
    for (const notification of notifications) {
      this.gateway.publish(notification);
      void this.smsDelivery
        .queueForNotification(notification.id)
        .catch((error: unknown) =>
          this.logger.warn(
            `SMS delivery queue failed for notification ${notification.id}: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
    }
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
      const source = await this.resolveSource(tx, rule.sourceType, rule.sourceId, rule.remindAt);
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
            sourcePath: await this.sourcePath(tx, rule.sourceType, rule.sourceId),
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
    remindAt: Date,
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
        : sourceType === ReminderSourceType.EMPLOYEE_WEEK_PLAN
          ? tx.employeeWeekPlanItem.findFirst({
              where: {
                id: sourceId,
                archivedAt: null,
                carryStatus: EmployeePlanCarryStatus.PLANNED,
                plannedCompletionAt: remindAt,
                employee: { archivedAt: null },
                importBatch: {
                  archivedAt: null,
                  status: EmployeeWorkImportStatus.COMPLETED,
                },
              },
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
    if (sourceType === ReminderSourceType.EMPLOYEE_WEEK_PLAN) return '员工工作计划已到期';
    return '会议提醒已到期';
  }

  private async sourcePath(
    tx: Prisma.TransactionClient,
    sourceType: ReminderSourceType,
    sourceId: string,
  ) {
    const encodedId = encodeURIComponent(sourceId);
    if (sourceType === ReminderSourceType.TASK) return `/my-work?taskId=${encodedId}`;
    if (sourceType === ReminderSourceType.CALENDAR_EVENT) return `/calendar?eventId=${encodedId}`;
    if (sourceType === ReminderSourceType.EMPLOYEE_WEEK_PLAN) {
      const plan = await tx.employeeWeekPlanItem.findUnique({
        where: { id: sourceId },
        select: { employeeId: true, periodStartAt: true },
      });
      if (!plan) return `/employees`;
      const params = new URLSearchParams({
        periodType: 'WEEK',
        periodStart: plan.periodStartAt.toISOString().slice(0, 10),
        planItemId: sourceId,
      });
      return `/employees/${encodeURIComponent(plan.employeeId)}?${params.toString()}`;
    }
    return `/meetings?meetingId=${encodedId}`;
  }
}
