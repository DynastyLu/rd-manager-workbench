import { HttpStatus, Injectable } from '@nestjs/common';
import {
  EmployeePlanCarryStatus,
  MeetingStatus,
  ReminderSourceType,
  TaskStatus,
} from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import {
  CreateReminderRuleDto,
  ListReminderRulesQueryDto,
} from '../interface/http/dto/reminders.dto';

@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  async list(query: ListReminderRulesQueryDto) {
    return this.prisma.reminderRule.findMany({
      where: {
        sourceType: query.sourceType,
        sourceId: query.sourceId,
        archivedAt: null,
      },
      orderBy: [{ remindAt: 'asc' }, { id: 'asc' }],
    });
  }

  async create(dto: CreateReminderRuleDto) {
    await this.assertSource(dto.sourceType, dto.sourceId);
    const remindAt = new Date(dto.remindAt);
    return this.prisma.reminderRule.upsert({
      where: {
        sourceType_sourceId_remindAt: {
          sourceType: dto.sourceType,
          sourceId: dto.sourceId,
          remindAt,
        },
      },
      create: {
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        remindAt,
      },
      update: { archivedAt: null },
    });
  }

  async archive(id: string) {
    const result = await this.prisma.reminderRule.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (!result.count) {
      throw new AppError({
        code: ErrorCodes.REMINDER_RULE_NOT_FOUND,
        message: 'Reminder rule not found',
        statusCode: HttpStatus.NOT_FOUND,
      });
    }
  }

  private async assertSource(sourceType: ReminderSourceType, sourceId: string) {
    const source =
      sourceType === ReminderSourceType.TASK
        ? await this.prisma.workTask.findFirst({
            where: {
              id: sourceId,
              archivedAt: null,
              status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED] },
            },
            select: { id: true },
          })
        : sourceType === ReminderSourceType.CALENDAR_EVENT
          ? await this.prisma.calendarEvent.findFirst({
              where: { id: sourceId, archivedAt: null },
              select: { id: true },
            })
          : sourceType === ReminderSourceType.EMPLOYEE_WEEK_PLAN
            ? await this.prisma.employeeWeekPlanItem.findFirst({
                where: {
                  id: sourceId,
                  archivedAt: null,
                  carryStatus: EmployeePlanCarryStatus.PLANNED,
                  employee: { archivedAt: null },
                  importBatch: { archivedAt: null },
                },
                select: { id: true },
              })
            : await this.prisma.meeting.findFirst({
                where: {
                  id: sourceId,
                  archivedAt: null,
                  status: { not: MeetingStatus.CANCELLED },
                },
                select: { id: true },
              });
    if (!source) {
      throw new AppError({
        code: ErrorCodes.REMINDER_SOURCE_NOT_FOUND,
        message: 'Reminder source not found',
        statusCode: HttpStatus.NOT_FOUND,
      });
    }
  }
}
