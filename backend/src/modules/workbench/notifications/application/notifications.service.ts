import { HttpStatus, Injectable } from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import {
  ListNotificationsQueryDto,
  SnoozeNotificationDto,
} from '../interface/http/dto/notifications.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  async list(query: ListNotificationsQueryDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where = query.status ? { status: query.status } : {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ triggeredAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  async markRead(id: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, status: { not: NotificationStatus.DISMISSED } },
      data: {
        status: NotificationStatus.READ,
        readAt: new Date(),
        dismissedAt: null,
        snoozedUntil: null,
      },
    });
    if (!result.count) throw this.notificationNotFound();
    return this.getNotification(id);
  }

  async dismiss(id: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id },
      data: {
        status: NotificationStatus.DISMISSED,
        dismissedAt: new Date(),
        snoozedUntil: null,
      },
    });
    if (!result.count) throw this.notificationNotFound();
  }

  async snooze(id: string, dto: SnoozeNotificationDto) {
    const snoozedUntil = new Date(dto.snoozeUntil);
    if (!Number.isFinite(snoozedUntil.getTime()) || snoozedUntil.getTime() <= Date.now()) {
      throw new AppError({
        code: ErrorCodes.NOTIFICATION_SNOOZE_INVALID,
        message: 'Notification snooze time must be in the future',
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
    const result = await this.prisma.notification.updateMany({
      where: { id, status: { not: NotificationStatus.DISMISSED } },
      data: {
        status: NotificationStatus.SNOOZED,
        snoozedUntil,
        readAt: null,
        dismissedAt: null,
      },
    });
    if (!result.count) throw this.notificationNotFound();
    return this.getNotification(id);
  }

  private async getNotification(id: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) throw this.notificationNotFound();
    return notification;
  }

  private notificationNotFound() {
    return new AppError({
      code: ErrorCodes.NOTIFICATION_NOT_FOUND,
      message: 'Notification not found',
      statusCode: HttpStatus.NOT_FOUND,
    });
  }
}
