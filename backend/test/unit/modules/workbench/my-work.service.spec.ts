import { TaskStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { ProjectHealthService } from '../../../../src/modules/workbench/projects/application/project-health.service';
import { TasksService } from '../../../../src/modules/workbench/tasks/application/tasks.service';

type MyWorkView = 'INBOX' | 'TODAY' | 'WEEK' | 'OVERDUE' | 'LATER' | 'COMPLETED';

interface MyWorkServiceContract {
  listMyWork(query: { view: MyWorkView; projectId?: string }, now?: Date): Promise<{
    data: Array<{
      id: string;
      dependencyIds: string[];
      reminder: { remindAt: Date } | null;
      later: { deferredUntil: Date } | null;
    }>;
    meta: { page: number; pageSize: number; total: number };
  }>;
  upsertLater(taskId: string, dto: { deferredUntil: string }): Promise<unknown>;
  deleteLater(taskId: string): Promise<void>;
  upsertReminder(taskId: string, dto: { remindAt: string }): Promise<unknown>;
  deleteReminder(taskId: string): Promise<void>;
}

const activeStatuses = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED];
const visibleOutsideLater = {
  OR: [
    { later: { is: null } },
    { later: { is: { deferredUntil: { lte: new Date('2026-07-18T04:00:00.000Z') } } } },
  ],
};

describe('TasksService my-work views', () => {
  const now = new Date('2026-07-18T04:00:00.000Z'); // 2026-07-18 12:00 Asia/Shanghai
  const task = {
    id: 'task-1',
    status: TaskStatus.TODO,
    dependencies: [{ dependsOnTaskId: 'dependency-1' }],
    reminder: { remindAt: new Date('2026-07-18T03:30:00.000Z') },
    later: null,
  };

  function setup() {
    const findMany = jest.fn().mockResolvedValue([task]);
    const prisma = {
      workTask: { findMany },
    } as unknown as PlatformPrismaService;
    const service = new TasksService(prisma, new ProjectHealthService()) as unknown as MyWorkServiceContract;
    return { service, findMany };
  }

  it.each([
    [
      'INBOX' as const,
      {
        archivedAt: null,
        status: { in: activeStatuses },
        dueAt: null,
        ...visibleOutsideLater,
      },
    ],
    [
      'TODAY' as const,
      {
        archivedAt: null,
        status: { in: activeStatuses },
        dueAt: {
          gte: new Date('2026-07-17T16:00:00.000Z'),
          lt: new Date('2026-07-18T16:00:00.000Z'),
        },
        ...visibleOutsideLater,
      },
    ],
    [
      'WEEK' as const,
      {
        archivedAt: null,
        status: { in: activeStatuses },
        dueAt: {
          gte: new Date('2026-07-12T16:00:00.000Z'),
          lt: new Date('2026-07-19T16:00:00.000Z'),
        },
        ...visibleOutsideLater,
      },
    ],
    [
      'OVERDUE' as const,
      {
        archivedAt: null,
        status: { in: activeStatuses },
        dueAt: { lt: now },
        ...visibleOutsideLater,
      },
    ],
    [
      'LATER' as const,
      {
        archivedAt: null,
        status: { in: activeStatuses },
        later: { isNot: null },
      },
    ],
    [
      'COMPLETED' as const,
      {
        archivedAt: null,
        status: TaskStatus.DONE,
      },
    ],
  ])('builds the %s view with Shanghai boundaries', async (view, where) => {
    const { service, findMany } = setup();

    const result = await service.listMyWork({ view, projectId: 'project-1' }, now);

    expect(findMany).toHaveBeenCalledWith({
      where: { ...where, projectId: 'project-1' },
      orderBy: [{ dueAt: 'asc' }, { updatedAt: 'desc' }, { id: 'desc' }],
      include: {
        dependencies: { select: { dependsOnTaskId: true } },
        reminder: true,
        later: true,
      },
    });
    expect(result).toEqual({
      data: [
        expect.objectContaining({
          id: 'task-1',
          dependencyIds: ['dependency-1'],
          reminder: task.reminder,
          later: null,
        }),
      ],
      meta: { page: 1, pageSize: 1, total: 1 },
    });
  });
});

describe('TasksService later and reminder settings', () => {
  const deferredUntil = '2026-07-20T01:00:00.000Z';
  const remindAt = '2026-07-19T01:00:00.000Z';

  function setup() {
    const findFirst = jest.fn().mockResolvedValue({ id: 'task-1' });
    const laterUpsert = jest.fn().mockResolvedValue({ taskId: 'task-1', deferredUntil });
    const laterDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const reminderUpsert = jest.fn().mockResolvedValue({ taskId: 'task-1', remindAt });
    const reminderDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      workTask: { findFirst },
      taskLater: { upsert: laterUpsert, deleteMany: laterDeleteMany },
      taskReminder: { upsert: reminderUpsert, deleteMany: reminderDeleteMany },
    } as unknown as PlatformPrismaService;
    const service = new TasksService(prisma, new ProjectHealthService()) as unknown as MyWorkServiceContract;
    return {
      service,
      findFirst,
      laterUpsert,
      laterDeleteMany,
      reminderUpsert,
      reminderDeleteMany,
    };
  }

  it('upserts later by task identity after verifying the active task', async () => {
    const { service, findFirst, laterUpsert } = setup();

    await service.upsertLater('task-1', { deferredUntil });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'task-1', archivedAt: null },
      select: { id: true },
    });
    expect(laterUpsert).toHaveBeenCalledWith({
      where: { taskId: 'task-1' },
      create: { taskId: 'task-1', deferredUntil: new Date(deferredUntil) },
      update: { deferredUntil: new Date(deferredUntil) },
    });
  });

  it('deletes later idempotently after verifying the active task', async () => {
    const { service, laterDeleteMany } = setup();

    await service.deleteLater('task-1');

    expect(laterDeleteMany).toHaveBeenCalledWith({ where: { taskId: 'task-1' } });
  });

  it('upserts a reminder and revives a previously dismissed one', async () => {
    const { service, reminderUpsert } = setup();

    await service.upsertReminder('task-1', { remindAt });

    expect(reminderUpsert).toHaveBeenCalledWith({
      where: { taskId: 'task-1' },
      create: { taskId: 'task-1', remindAt: new Date(remindAt) },
      update: { remindAt: new Date(remindAt), dismissedAt: null },
    });
  });

  it('deletes a reminder idempotently after verifying the active task', async () => {
    const { service, reminderDeleteMany } = setup();

    await service.deleteReminder('task-1');

    expect(reminderDeleteMany).toHaveBeenCalledWith({ where: { taskId: 'task-1' } });
  });
});
