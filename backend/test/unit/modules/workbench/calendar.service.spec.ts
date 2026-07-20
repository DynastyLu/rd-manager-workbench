import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { CalendarService } from '../../../../src/modules/workbench/calendar/application/calendar.service';

describe('CalendarService', () => {
  it('aggregates events, meetings and task due dates with traceable sources', async () => {
    const prisma = {
      calendarEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'event-1',
            title: '候选人面试',
            startAt: new Date('2026-08-01T02:00:00.000Z'),
            endAt: new Date('2026-08-01T03:00:00.000Z'),
            allDay: false,
            location: '会议室 A',
            link: null,
            notes: '准备简历',
            type: 'INTERVIEW',
            projectId: 'project-1',
          },
        ]),
      },
      meeting: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'meeting-1',
            title: '周会',
            scheduledAt: new Date('2026-08-01T01:00:00.000Z'),
            projectId: 'project-1',
            status: 'PLANNED',
          },
        ]),
      },
      workTask: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'task-1',
            title: '提交方案',
            dueAt: new Date('2026-08-01T04:00:00.000Z'),
            projectId: 'project-1',
            status: 'TODO',
          },
        ]),
      },
      nonProjectRdItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rd-1',
            title: '向量检索预研',
            plannedStartAt: new Date('2026-08-01T00:30:00.000Z'),
            plannedEndAt: new Date('2026-08-01T05:00:00.000Z'),
            projectId: null,
            objective: '完成本地选型',
          },
        ]),
      },
      $transaction: jest.fn(async (queries: Array<Promise<unknown>>) => Promise.all(queries)),
    } as unknown as PlatformPrismaService;
    const service = new CalendarService(prisma);

    const entries = await service.listEntries({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-02T00:00:00.000Z',
    });

    expect(entries).toEqual([
      expect.objectContaining({
        id: 'NON_PROJECT_RD:rd-1',
        sourceType: 'NON_PROJECT_RD',
        sourceId: 'rd-1',
        startAt: new Date('2026-08-01T00:30:00.000Z'),
        endAt: new Date('2026-08-01T05:00:00.000Z'),
      }),
      expect.objectContaining({
        id: 'MEETING:meeting-1',
        sourceType: 'MEETING',
        sourceId: 'meeting-1',
        startAt: new Date('2026-08-01T01:00:00.000Z'),
      }),
      expect.objectContaining({
        id: 'CALENDAR_EVENT:event-1',
        sourceType: 'CALENDAR_EVENT',
        sourceId: 'event-1',
        type: 'INTERVIEW',
      }),
      expect.objectContaining({
        id: 'TASK:task-1',
        sourceType: 'TASK',
        sourceId: 'task-1',
        type: 'TASK',
        startAt: new Date('2026-08-01T04:00:00.000Z'),
      }),
    ]);
    expect(prisma.calendarEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          archivedAt: null,
          startAt: { lt: new Date('2026-08-02T00:00:00.000Z') },
          endAt: { gt: new Date('2026-08-01T00:00:00.000Z') },
        },
      }),
    );
    expect(entries[0]).not.toHaveProperty('status');
    expect(entries[3]).not.toHaveProperty('status');
  });

  it.each([
    {
      name: 'an empty or reversed range',
      from: '2026-08-02T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
    },
    {
      name: 'a range longer than 366 days',
      from: '2026-01-01T00:00:00.000Z',
      to: '2027-01-03T00:00:00.000Z',
    },
  ])('rejects $name before querying the database', async ({ from, to }) => {
    const transaction = jest.fn();
    const prisma = {
      calendarEvent: { findMany: jest.fn() },
      meeting: { findMany: jest.fn() },
      workTask: { findMany: jest.fn() },
      nonProjectRdItem: { findMany: jest.fn() },
      $transaction: transaction,
    } as unknown as PlatformPrismaService;
    const service = new CalendarService(prisma);

    await expect(service.listEntries({ from, to })).rejects.toMatchObject({
      code: 'CALENDAR_RANGE_INVALID',
      statusCode: 422,
    });
    expect(transaction).not.toHaveBeenCalled();
  });
});
