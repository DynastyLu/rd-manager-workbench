import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { TasksService } from '../../../../src/modules/workbench/tasks/application/tasks.service';
import { ProjectHealthService } from '../../../../src/modules/workbench/projects/application/project-health.service';
import { ProjectProgressService } from '../../../../src/modules/workbench/projects/application/project-progress.service';

describe('TasksService dependency traversal', () => {
  it('walks only the proposed dependency frontier and ignores unrelated graph edges', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ taskId: 'dependency', dependsOnTaskId: 'next' }])
      .mockResolvedValueOnce([]);
    const transaction = { taskDependency: { findMany } } as unknown as PlatformPrismaService;
    const service = new TasksService({} as PlatformPrismaService, new ProjectHealthService());

    await (
      service as unknown as {
        assertNoDependencyCycle(
          client: PlatformPrismaService,
          taskId: string,
          dependencyIds: string[],
        ): Promise<void>;
      }
    ).assertNoDependencyCycle(transaction, 'candidate', ['dependency']);

    expect(findMany).toHaveBeenNthCalledWith(1, {
      where: {
        taskId: { in: ['dependency'] },
        task: { archivedAt: null },
        dependsOnTask: { archivedAt: null },
      },
      select: { taskId: true, dependsOnTaskId: true },
    });
    expect(findMany).toHaveBeenNthCalledWith(2, {
      where: {
        taskId: { in: ['next'] },
        task: { archivedAt: null },
        dependsOnTask: { archivedAt: null },
      },
      select: { taskId: true, dependsOnTaskId: true },
    });
  });

  it('records health snapshot calculation time inside the transaction work', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'snapshot' });
    const transaction = {
      milestone: { count: jest.fn().mockResolvedValue(0) },
      workTask: { count: jest.fn().mockResolvedValue(0) },
      projectHealthSnapshot: { create },
    } as unknown as PlatformPrismaService;
    const service = new TasksService({} as PlatformPrismaService, new ProjectHealthService());

    await (
      service as unknown as {
        recalculateHealth(client: PlatformPrismaService, projectId: string): Promise<void>;
      }
    ).recalculateHealth(transaction, 'project-1');

    expect(create).toHaveBeenCalledWith({
      data: {
        projectId: 'project-1',
        health: 'GREEN',
        reasons: [],
        calculatedAt: expect.any(Date),
      },
    });
  });
});

describe('TasksService project progress linkage', () => {
  it('recalculates project progress after creating a milestone', async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      project: {
        findFirst: jest.fn().mockResolvedValue({ id: 'project-1' }),
      },
      milestone: {
        create: jest.fn().mockResolvedValue({ id: 'milestone-1', projectId: 'project-1' }),
        count: jest.fn().mockResolvedValue(0),
      },
      workTask: {
        count: jest.fn().mockResolvedValue(0),
      },
      projectHealthSnapshot: {
        create: jest.fn().mockResolvedValue({ id: 'health-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (tx: typeof transaction) => unknown) =>
        work(transaction),
      ),
    } as unknown as PlatformPrismaService;
    const progressService = {
      recalculate: jest.fn().mockResolvedValue({ actualPercent: 0 }),
    } as unknown as ProjectProgressService;
    const service = new TasksService(
      prisma,
      new ProjectHealthService(),
      undefined,
      progressService,
    );

    await service.createMilestone('project-1', {
      name: '样机验证',
      plannedStartAt: '2026-07-01T00:00:00.000Z',
      plannedEndAt: '2026-08-01T00:00:00.000Z',
      manualCompletionPercent: 20,
    });

    expect(transaction.milestone.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'project-1',
        plannedStartAt: new Date('2026-07-01T00:00:00.000Z'),
        plannedEndAt: new Date('2026-08-01T00:00:00.000Z'),
        manualCompletionPercent: 20,
      }),
    });
    expect(progressService.recalculate).toHaveBeenCalledWith(
      transaction,
      'project-1',
      expect.objectContaining({
        sourceType: 'MILESTONE_CHANGE',
        milestoneId: 'milestone-1',
      }),
    );
  });

  it('stores manual progress as a calculated snapshot instead of an override', async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      project: {
        findFirst: jest.fn().mockResolvedValue({ id: 'project-1' }),
      },
      milestone: {
        count: jest.fn().mockResolvedValue(0),
      },
      workTask: {
        count: jest.fn().mockResolvedValue(0),
      },
      progressReport: {
        create: jest.fn().mockResolvedValue({ id: 'report-1', sourceType: 'MANUAL' }),
      },
      projectHealthSnapshot: {
        create: jest.fn().mockResolvedValue({ id: 'health-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (tx: typeof transaction) => unknown) =>
        work(transaction),
      ),
    } as unknown as PlatformPrismaService;
    const progressService = {
      getSummary: jest.fn().mockResolvedValue({ actualPercent: 62.5 }),
    } as unknown as ProjectProgressService;
    const service = new TasksService(
      prisma,
      new ProjectHealthService(),
      undefined,
      progressService,
    );

    await service.createProgressReport('project-1', {
      summary: '完成样机验证',
      reportedAt: '2026-07-28T10:00:00.000Z',
      blockers: '等待采购',
      nextSteps: '准备评审',
    });

    expect(transaction.progressReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'project-1',
        sourceType: 'MANUAL',
        completionPercent: 62.5,
        blockers: '等待采购',
        nextSteps: '准备评审',
      }),
    });
  });
});
