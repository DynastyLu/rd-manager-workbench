import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { ProjectProgressService } from '../../../../src/modules/workbench/projects/application/project-progress.service';

describe('ProjectProgressService', () => {
  const now = new Date('2026-01-07T00:00:00.000Z');

  function createPrisma(overrides: Record<string, unknown> = {}) {
    return {
      project: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'project-1',
          plannedStartAt: new Date('2026-01-01T00:00:00.000Z'),
          plannedEndAt: new Date('2026-01-11T00:00:00.000Z'),
          weightMode: 'EQUAL',
        }),
      },
      milestone: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'milestone-1',
            name: '验证',
            status: 'IN_PROGRESS',
            plannedStartAt: new Date('2026-01-01T00:00:00.000Z'),
            plannedEndAt: new Date('2026-01-08T00:00:00.000Z'),
            weightPercent: null,
            manualCompletionPercent: null,
            tasks: [
              { id: 'task-1', status: 'IN_PROGRESS', completionPercent: 40 },
              { id: 'task-2', status: 'DONE', completionPercent: 100 },
            ],
          },
        ]),
      },
      progressReport: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      ...overrides,
    } as unknown as PlatformPrismaService;
  }

  it('returns calculated milestone and schedule summaries', async () => {
    const prisma = createPrisma();
    const service = new ProjectProgressService();

    await expect(service.getSummary(prisma, 'project-1', now)).resolves.toEqual({
      actualPercent: 70,
      timePercent: 60,
      variancePercent: 10,
      scheduleState: 'AHEAD',
      weightMode: 'EQUAL',
      currentMilestoneId: 'milestone-1',
      milestones: [
        expect.objectContaining({
          id: 'milestone-1',
          completionPercent: 70,
          completionSource: 'TASKS',
          effectiveWeightPercent: 100,
          linkedTaskCount: 2,
        }),
      ],
    });
  });

  it('returns an unplanned summary when the project has no milestones', async () => {
    const prisma = createPrisma({
      milestone: { findMany: jest.fn().mockResolvedValue([]) },
    });
    const service = new ProjectProgressService();

    await expect(service.getSummary(prisma, 'project-1', now)).resolves.toMatchObject({
      actualPercent: null,
      timePercent: null,
      variancePercent: null,
      scheduleState: 'UNPLANNED',
      currentMilestoneId: null,
      milestones: [],
    });
  });

  it('writes one system report only when the displayed percentage changes', async () => {
    const prisma = createPrisma();
    prisma.progressReport.findFirst = jest
      .fn()
      .mockResolvedValue({ completionPercent: 50 });
    prisma.progressReport.create = jest.fn().mockResolvedValue({ id: 'report-1' });
    const service = new ProjectProgressService();

    await service.recalculate(prisma, 'project-1', {
      sourceType: 'TASK_CHANGE',
      taskId: 'task-1',
      summary: '工作项进度更新',
      now,
    });

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.progressReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'project-1',
        previousPercent: 50,
        completionPercent: 70,
        sourceType: 'TASK_CHANGE',
        taskId: 'task-1',
        summary: '工作项进度更新',
      }),
    });
  });

  it('does not create a duplicate system report for the same percentage', async () => {
    const prisma = createPrisma();
    prisma.progressReport.findFirst = jest
      .fn()
      .mockResolvedValue({ completionPercent: 70 });
    const service = new ProjectProgressService();

    await service.recalculate(prisma, 'project-1', {
      sourceType: 'MILESTONE_CHANGE',
      milestoneId: 'milestone-1',
      summary: '里程碑更新',
      now,
    });

    expect(prisma.progressReport.create).not.toHaveBeenCalled();
  });
});
