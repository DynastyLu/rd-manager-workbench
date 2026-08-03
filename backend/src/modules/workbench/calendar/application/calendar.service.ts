import { HttpStatus, Injectable } from '@nestjs/common';
import { DataScopeService } from '../../../../modules/iam/application/data-scope.service';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import {
  CreateCalendarEventDto,
  ListCalendarEntriesQueryDto,
  ListCalendarEventsQueryDto,
  UpdateCalendarEventDto,
} from '../interface/http/dto/calendar.dto';

const MAX_CALENDAR_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly dataScope: DataScopeService,
    private readonly requestContext: RequestContextService,
  ) {}

  async listEvents(query: ListCalendarEventsQueryDto) {
    const principal = this.requestContext.requirePrincipal();
    const from = new Date(query.from);
    const to = new Date(query.to);
    this.assertRange(from, to);
    return this.prisma.calendarEvent.findMany({
      where: {
        archivedAt: null,
        startAt: { lt: to },
        endAt: { gt: from },
        ...this.calendarEventScope(principal),
      },
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    });
  }

  async getEvent(id: string) {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id, archivedAt: null },
    });
    if (!event) throw this.eventNotFound();
    return event;
  }

  async createEvent(dto: CreateCalendarEventDto) {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    this.assertEventTime(startAt, endAt);
    await this.assertProject(dto.projectId);
    return this.prisma.calendarEvent.create({
      data: {
        title: dto.title,
        startAt,
        endAt,
        ...(dto.allDay !== undefined ? { allDay: dto.allDay } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.link !== undefined ? { link: dto.link } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.projectId !== undefined ? { projectId: dto.projectId } : {}),
      },
    });
  }

  async updateEvent(id: string, dto: UpdateCalendarEventDto) {
    const existing = await this.getEvent(id);
    const startAt = dto.startAt !== undefined ? new Date(dto.startAt) : existing.startAt;
    const endAt = dto.endAt !== undefined ? new Date(dto.endAt) : existing.endAt;
    this.assertEventTime(startAt, endAt);
    await this.assertProject(dto.projectId);
    const result = await this.prisma.calendarEvent.updateMany({
      where: { id, archivedAt: null },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.startAt !== undefined ? { startAt } : {}),
        ...(dto.endAt !== undefined ? { endAt } : {}),
        ...(dto.allDay !== undefined ? { allDay: dto.allDay } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.link !== undefined ? { link: dto.link } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.projectId !== undefined ? { projectId: dto.projectId } : {}),
      },
    });
    if (!result.count) throw this.eventNotFound();
    return this.getEvent(id);
  }

  async archiveEvent(id: string) {
    const result = await this.prisma.calendarEvent.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (!result.count) throw this.eventNotFound();
  }

  async listEntries(query: ListCalendarEntriesQueryDto) {
    const principal = this.requestContext.requirePrincipal();
    const from = new Date(query.from);
    const to = new Date(query.to);
    this.assertRange(from, to);
    const allowedProjectIds = await this.allowedProjectIds(principal);
    const [events, meetings, tasks, nonProjectItems] = await this.prisma.$transaction([
      this.prisma.calendarEvent.findMany({
        where: {
          archivedAt: null,
          startAt: { lt: to },
          endAt: { gt: from },
          ...this.calendarEventScope(principal, allowedProjectIds),
        },
        orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.meeting.findMany({
        where: {
          archivedAt: null,
          scheduledAt: { gte: from, lt: to },
          ...this.dataScope.meetings(principal, 'meeting.read'),
        },
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.workTask.findMany({
        where: {
          archivedAt: null,
          dueAt: { gte: from, lt: to },
          ...this.dataScope.tasks(principal, 'task.read'),
        },
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.nonProjectRdItem.findMany({
        where: {
          archivedAt: null,
          ...this.nonProjectRdScope(principal, allowedProjectIds),
          OR: [
            { plannedStartAt: { gte: from, lt: to } },
            { plannedEndAt: { gte: from, lt: to } },
            {
              AND: [
                { plannedStartAt: { lt: from } },
                { plannedEndAt: { gte: to } },
              ],
            },
          ],
        },
        orderBy: [{ plannedStartAt: 'asc' }, { plannedEndAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return [
      ...events.map((event) => ({
        id: `CALENDAR_EVENT:${event.id}`,
        sourceType: 'CALENDAR_EVENT' as const,
        sourceId: event.id,
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
        allDay: event.allDay,
        location: event.location,
        link: event.link,
        notes: event.notes,
        type: event.type,
        projectId: event.projectId,
      })),
      ...meetings.map((meeting) => ({
        id: `MEETING:${meeting.id}`,
        sourceType: 'MEETING' as const,
        sourceId: meeting.id,
        title: meeting.title,
        startAt: meeting.scheduledAt,
        endAt: null,
        allDay: false,
        location: null,
        link: null,
        notes: meeting.agenda,
        type: 'MEETING' as const,
        projectId: meeting.projectId,
      })),
      ...tasks
        .filter((task): task is typeof task & { dueAt: Date } => task.dueAt !== null)
        .map((task) => ({
          id: `TASK:${task.id}`,
          sourceType: 'TASK' as const,
          sourceId: task.id,
          title: task.title,
          startAt: task.dueAt,
          endAt: null,
          allDay: false,
          location: null,
          link: null,
          notes: task.description,
          type: 'TASK' as const,
          projectId: task.projectId,
        })),
      ...nonProjectItems
        .filter(
          (item): item is typeof item & { plannedStartAt: Date } =>
            item.plannedStartAt !== null || item.plannedEndAt !== null,
        )
        .map((item) => {
          const startAt = item.plannedStartAt ?? item.plannedEndAt!;
          const endAt =
            item.plannedEndAt && item.plannedEndAt.getTime() > startAt.getTime()
              ? item.plannedEndAt
              : null;
          return {
            id: `NON_PROJECT_RD:${item.id}`,
            sourceType: 'NON_PROJECT_RD' as const,
            sourceId: item.id,
            title: item.title,
            startAt,
            endAt,
            allDay: false,
            location: null,
            link: `/library/operations?tab=non-project-rd&recordId=${encodeURIComponent(item.id)}`,
            notes: item.objective,
            type: 'NON_PROJECT_RD' as const,
            projectId: item.projectId,
          };
        }),
    ].sort(
      (left, right) =>
        left.startAt.getTime() - right.startAt.getTime() || left.id.localeCompare(right.id),
    );
  }

  private async allowedProjectIds(principal: import('../../../../modules/iam/domain/principal').AuthenticatedPrincipal): Promise<string[] | undefined> {
    const scope = this.dataScope.projects(principal, 'project.read');
    if (Object.keys(scope).length === 0) return undefined;
    const records = await this.prisma.project.findMany({
      where: scope,
      select: { id: true },
    });
    return records.map(({ id }) => id);
  }

  private calendarEventScope(
    principal: import('../../../../modules/iam/domain/principal').AuthenticatedPrincipal,
    allowedProjectIds?: string[] | undefined,
  ): import('@prisma/client').Prisma.CalendarEventWhereInput {
    if (allowedProjectIds === undefined) {
      const scope = this.dataScope.projects(principal, 'project.read');
      if (Object.keys(scope).length === 0) return {};
      return { project: scope };
    }
    if (allowedProjectIds.length === 0) return { id: { in: [] } };
    return { OR: [{ projectId: null }, { projectId: { in: allowedProjectIds } }] };
  }

  private nonProjectRdScope(
    principal: import('../../../../modules/iam/domain/principal').AuthenticatedPrincipal,
    allowedProjectIds: string[] | undefined,
  ): import('@prisma/client').Prisma.NonProjectRdItemWhereInput {
    if (allowedProjectIds === undefined) return {};
    const predicates: import('@prisma/client').Prisma.NonProjectRdItemWhereInput[] = [
      { ownerUserId: principal.userId },
    ];
    if (allowedProjectIds.length > 0) {
      predicates.push({ projectId: { in: allowedProjectIds } });
    }
    return { OR: predicates };
  }

  private assertRange(from: Date, to: Date) {
    const duration = to.getTime() - from.getTime();
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_CALENDAR_RANGE_MS) {
      throw new AppError({
        code: ErrorCodes.CALENDAR_RANGE_INVALID,
        message: 'Calendar range must be positive and no longer than 366 days',
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
  }

  private assertEventTime(startAt: Date, endAt: Date) {
    if (
      !Number.isFinite(startAt.getTime()) ||
      !Number.isFinite(endAt.getTime()) ||
      endAt.getTime() <= startAt.getTime()
    ) {
      throw new AppError({
        code: ErrorCodes.CALENDAR_EVENT_TIME_INVALID,
        message: 'Calendar event end time must be later than its start time',
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
  }

  private async assertProject(projectId: string | null | undefined) {
    if (!projectId) return;
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, archivedAt: null },
      select: { id: true },
    });
    if (!project) {
      throw new AppError({
        code: ErrorCodes.PROJECT_NOT_FOUND,
        message: 'Project not found',
        statusCode: HttpStatus.NOT_FOUND,
      });
    }
  }

  private eventNotFound() {
    return new AppError({
      code: ErrorCodes.CALENDAR_EVENT_NOT_FOUND,
      message: 'Calendar event not found',
      statusCode: HttpStatus.NOT_FOUND,
    });
  }
}
