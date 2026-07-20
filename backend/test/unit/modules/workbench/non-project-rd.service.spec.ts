import {
  NonProjectOutcomeStatus,
  NonProjectRdKind,
  NonProjectRdStatus,
  TaskStatus,
} from '@prisma/client';
import { validate } from 'class-validator';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { NonProjectRdService } from '../../../../src/modules/workbench/operations/application/non-project-rd.service';
import {
  UpdateNonProjectRdDto,
  UpdateNonProjectRdOutcomeDto,
} from '../../../../src/modules/workbench/operations/interface/http/dto/non-project-rd.dto';
import { TasksService } from '../../../../src/modules/workbench/tasks/application/tasks.service';
import { ErrorCodes } from '../../../../src/shared/errors/error-codes';

describe('NonProjectRdService', () => {
  it('accepts true partial updates and explicit nullable clears', async () => {
    const item = Object.assign(new UpdateNonProjectRdDto(), {
      objective: null,
      plannedEndAt: null,
      projectId: null,
      outcomeWaivedReason: null,
    });
    const outcome = Object.assign(new UpdateNonProjectRdOutcomeDto(), {
      summary: null,
      verifiedAt: null,
      evidenceNote: null,
    });

    await expect(validate(item)).resolves.toEqual([]);
    await expect(validate(outcome)).resolves.toEqual([]);
  });

  it('filters by fixed kinds, status, text, and an inclusive planned-time boundary', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      nonProjectRdItem: { findMany, count },
      $transaction: jest.fn().mockResolvedValue([[], 0]),
    } as unknown as PlatformPrismaService;
    const service = new NonProjectRdService(prisma, {} as TasksService);

    await service.list({
      q: 'database',
      kind: NonProjectRdKind.TECH_EXPLORATION,
      status: NonProjectRdStatus.PLANNED,
      projectId: 'project-1',
      plannedFrom: '2026-07-01T00:00:00.000Z',
      plannedTo: '2026-07-31T23:59:59.999Z',
      page: 2,
      pageSize: 10,
    });

    const where = {
      archivedAt: null,
      kind: NonProjectRdKind.TECH_EXPLORATION,
      status: NonProjectRdStatus.PLANNED,
      projectId: 'project-1',
      OR: [
        { code: { contains: 'database', mode: 'insensitive' } },
        { title: { contains: 'database', mode: 'insensitive' } },
        { objective: { contains: 'database', mode: 'insensitive' } },
        { expectedOutcome: { contains: 'database', mode: 'insensitive' } },
      ],
      plannedEndAt: { gte: new Date('2026-07-01T00:00:00.000Z') },
      plannedStartAt: { lte: new Date('2026-07-31T23:59:59.999Z') },
    };
    expect(findMany).toHaveBeenCalledWith({
      where,
      include: {
        outcomes: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
        project: { select: { id: true, code: true, name: true } },
        task: { select: { id: true, title: true, status: true } },
      },
      orderBy: [{ plannedEndAt: 'asc' }, { updatedAt: 'desc' }, { id: 'desc' }],
      skip: 10,
      take: 10,
    });
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('rejects inverted plan dates and technical-debt-only fields on other kinds', async () => {
    const prisma = {
      nonProjectRdItem: { create: jest.fn() },
    } as unknown as PlatformPrismaService;
    const service = new NonProjectRdService(prisma, {} as TasksService);

    await expect(
      service.create({
        code: 'RD-1',
        kind: NonProjectRdKind.TRAINING,
        title: 'Learn PostgreSQL',
        plannedStartAt: '2026-07-21T00:00:00.000Z',
        plannedEndAt: '2026-07-20T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: ErrorCodes.NON_PROJECT_RD_REFERENCE_INVALID });
    await expect(
      service.create({
        code: 'RD-2',
        kind: NonProjectRdKind.TRAINING,
        title: 'Learn PostgreSQL',
        severity: 'HIGH',
      }),
    ).rejects.toMatchObject({ code: ErrorCodes.NON_PROJECT_RD_REFERENCE_INVALID });
    expect(prisma.nonProjectRdItem.create).not.toHaveBeenCalled();
  });

  it('requires a verified outcome or an explicit waiver before completion', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'item-1',
      kind: NonProjectRdKind.NEW_DIRECTION,
      status: NonProjectRdStatus.IN_PROGRESS,
      plannedStartAt: null,
      plannedEndAt: null,
      actualStartAt: null,
      actualEndAt: null,
      outcomeWaivedReason: null,
      outcomes: [{ status: NonProjectOutcomeStatus.DRAFT }],
    });
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      nonProjectRdItem: {
        findFirst,
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    } as unknown as PlatformPrismaService;
    const service = new NonProjectRdService(prisma, {} as TasksService);

    await expect(
      service.update('item-1', { status: NonProjectRdStatus.COMPLETED }),
    ).rejects.toMatchObject({ code: ErrorCodes.NON_PROJECT_RD_COMPLETION_BLOCKED });
    await service.update('item-1', {
      status: NonProjectRdStatus.COMPLETED,
      outcomeWaivedReason: 'Exploration disproved the original assumption',
    });
    expect(transaction.nonProjectRdItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-1', archivedAt: null },
      data: {
        status: NonProjectRdStatus.COMPLETED,
        outcomeWaivedReason: 'Exploration disproved the original assumption',
      },
    });
  });

  it('maintains outcomes only under an active parent and uses the outcome error code', async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      nonProjectRdItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'item-1',
          status: NonProjectRdStatus.IN_PROGRESS,
          outcomeWaivedReason: null,
          outcomes: [],
        }),
      },
      nonProjectRdOutcome: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    } as unknown as PlatformPrismaService;
    const service = new NonProjectRdService(prisma, {} as TasksService);

    await expect(
      service.updateOutcome('item-1', 'missing', { title: 'Evidence' }),
    ).rejects.toMatchObject({ code: ErrorCodes.NON_PROJECT_OUTCOME_NOT_FOUND });
  });

  it('does not allow removing the last verified outcome from a completed item without a waiver', async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      nonProjectRdItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'item-1',
          status: NonProjectRdStatus.COMPLETED,
          outcomeWaivedReason: null,
          outcomes: [
            { id: 'outcome-1', status: NonProjectOutcomeStatus.VERIFIED },
          ],
        }),
      },
      nonProjectRdOutcome: {
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    } as unknown as PlatformPrismaService;
    const service = new NonProjectRdService(prisma, {} as TasksService);

    await expect(
      service.updateOutcome('item-1', 'outcome-1', {
        status: NonProjectOutcomeStatus.REJECTED,
      }),
    ).rejects.toMatchObject({ code: ErrorCodes.NON_PROJECT_RD_COMPLETION_BLOCKED });
    await expect(service.deleteOutcome('item-1', 'outcome-1')).rejects.toMatchObject({
      code: ErrorCodes.NON_PROJECT_RD_COMPLETION_BLOCKED,
    });
    expect(transaction.nonProjectRdOutcome.updateMany).not.toHaveBeenCalled();
    expect(transaction.nonProjectRdOutcome.deleteMany).not.toHaveBeenCalled();
  });

  it('returns a collision-free project payload without creating the project', async () => {
    const prisma = {
      nonProjectRdItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'item-1',
          code: 'DB-LAB',
          title: 'Database lab',
          suggestedProjectName: 'Database platform',
          kind: NonProjectRdKind.PLATFORM_TOOL,
          objective: 'Prove the direction',
          expectedOutcome: 'Validated design',
          plannedStartAt: new Date('2026-07-20T00:00:00.000Z'),
          plannedEndAt: new Date('2026-08-20T00:00:00.000Z'),
          outcomes: [],
        }),
      },
      project: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'existing' })
          .mockResolvedValueOnce(null),
        create: jest.fn(),
      },
    } as unknown as PlatformPrismaService;
    const service = new NonProjectRdService(prisma, {} as TasksService);

    await expect(service.projectSuggestion('item-1')).resolves.toEqual({
      code: 'NPRD-DB-LAB-2',
      name: 'Database platform',
      type: NonProjectRdKind.PLATFORM_TOOL,
      objective: 'Prove the direction',
      expectedOutcome: 'Validated design',
      plannedStartAt: new Date('2026-07-20T00:00:00.000Z'),
      plannedEndAt: new Date('2026-08-20T00:00:00.000Z'),
    });
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it('blocks soft archive while active load, source task, or attachment references still exist', async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      nonProjectRdItem: {
        findFirst: jest.fn().mockResolvedValue({ id: 'item-1' }),
        updateMany: jest.fn(),
      },
      resourceLoadEntry: { count: jest.fn().mockResolvedValue(1) },
      workTask: { count: jest.fn().mockResolvedValue(1) },
      fileAsset: { count: jest.fn().mockResolvedValue(1) },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    } as unknown as PlatformPrismaService;
    const service = new NonProjectRdService(prisma, {} as TasksService);

    await expect(service.archive('item-1')).rejects.toMatchObject({
      code: ErrorCodes.NON_PROJECT_RD_REFERENCE_INVALID,
      statusCode: 409,
    });
    expect(transaction.nonProjectRdItem.updateMany).not.toHaveBeenCalled();
    expect(transaction.fileAsset.count).toHaveBeenCalledWith({
      where: { nonProjectRdItemId: 'item-1', status: 'ACTIVE' },
    });
    expect(transaction.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.nonProjectRdItem.findFirst.mock.invocationCallOrder[0],
    );
  });

  it('creates one source-traceable task and returns the item deep link', async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      nonProjectRdItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'item-1',
          title: 'Database lab',
          projectId: 'project-1',
          taskId: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    } as unknown as PlatformPrismaService;
    const task = {
      id: 'task-1',
      sourceType: 'NON_PROJECT_RD',
      sourceId: 'item-1',
      status: TaskStatus.TODO,
    };
    const tasks = {
      createTaskInTransaction: jest.fn().mockResolvedValue(task),
    } as unknown as TasksService;
    const service = new NonProjectRdService(prisma, tasks);

    await expect(
      service.createTask('item-1', { title: 'Follow up database lab' }),
    ).resolves.toEqual({
      task,
      alreadyExists: false,
      source: {
        type: 'NON_PROJECT_RD',
        id: 'item-1',
        path: '/library/operations?tab=non-project-rd&recordId=item-1',
      },
    });
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tasks.createTaskInTransaction).toHaveBeenCalledWith(transaction, {
      title: 'Follow up database lab',
      projectId: 'project-1',
      sourceType: 'NON_PROJECT_RD',
      sourceId: 'item-1',
    });
  });

  it('returns the linked task on repeat conversion without creating another one', async () => {
    const existingTask = {
      id: 'task-1',
      sourceType: 'NON_PROJECT_RD',
      sourceId: 'item-1',
      dependencies: [],
      reminder: null,
      later: null,
    };
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      nonProjectRdItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'item-1',
          taskId: 'task-1',
        }),
      },
      workTask: { findUnique: jest.fn().mockResolvedValue(existingTask) },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    } as unknown as PlatformPrismaService;
    const tasks = { createTaskInTransaction: jest.fn() } as unknown as TasksService;
    const service = new NonProjectRdService(prisma, tasks);

    const result = await service.createTask('item-1', { title: 'Ignored duplicate' });

    expect(result).toMatchObject({
      task: { id: 'task-1', sourceType: 'NON_PROJECT_RD', sourceId: 'item-1' },
      alreadyExists: true,
      source: {
        path: '/library/operations?tab=non-project-rd&recordId=item-1',
      },
    });
    expect(tasks.createTaskInTransaction).not.toHaveBeenCalled();
  });
});
