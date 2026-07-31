import { BadRequestException } from '@nestjs/common';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { ProjectPlanService } from '../../../../src/modules/workbench/projects/application/project-plan.service';

describe('ProjectPlanService', () => {
  const taskA = {
    id: 'task-a',
    projectId: 'project-1',
    milestoneId: 'milestone-1',
    title: '方案设计',
    status: 'DONE',
    dueAt: new Date('2026-07-10T00:00:00.000Z'),
    dependencies: [],
  };
  const taskB = {
    id: 'task-b',
    projectId: 'project-1',
    milestoneId: 'milestone-1',
    title: '样机验证',
    status: 'IN_PROGRESS',
    dueAt: new Date('2026-07-20T00:00:00.000Z'),
    dependencies: [
      { dependsOnTaskId: 'task-a', dependsOnTask: { projectId: 'project-1' } },
    ],
  };

  function createPrisma() {
    const prisma = {
      project: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'project-1',
          name: '材料研发',
          plannedStartAt: new Date('2026-07-01T00:00:00.000Z'),
          plannedEndAt: new Date('2026-07-31T00:00:00.000Z'),
          milestones: [
            {
              id: 'milestone-1',
              name: '样机完成',
              plannedAt: new Date('2026-07-20T00:00:00.000Z'),
              plannedStartAt: new Date('2026-07-01T00:00:00.000Z'),
              plannedEndAt: new Date('2026-07-20T00:00:00.000Z'),
              isCritical: false,
            },
          ],
          tasks: [taskA, taskB],
        }),
      },
      projectPlanBaseline: {
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'baseline-2', ...data })),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      projectPlanChange: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'change-1', ...data })),
      },
      workTask: {
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ ...taskB, ...data })),
      },
      milestone: { update: jest.fn() },
      $transaction: jest.fn(async (operation) => operation(prisma)),
    };
    return prisma as unknown as PlatformPrismaService;
  }

  it('creates an immutable versioned baseline with milestone and task snapshots', async () => {
    const prisma = createPrisma();
    const service = new ProjectPlanService(prisma);

    await service.createBaseline('project-1', { name: '批准版' });

    expect(prisma.projectPlanBaseline.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'project-1',
        name: '批准版',
        version: 2,
        milestoneSnapshots: {
          create: [expect.objectContaining({ milestoneId: 'milestone-1', name: '样机完成' })],
        },
        taskSnapshots: {
          create: [
            expect.objectContaining({ taskId: 'task-a', dependencyIds: [] }),
            expect.objectContaining({ taskId: 'task-b', dependencyIds: ['task-a'] }),
          ],
        },
      }),
      include: { milestoneSnapshots: true, taskSnapshots: true },
    });
  });

  it('calculates the dependency-based critical path deterministically', async () => {
    const service = new ProjectPlanService(createPrisma());

    await expect(service.calculateCriticalPath('project-1')).resolves.toEqual({
      criticalTaskIds: ['task-a', 'task-b'],
      terminalTaskId: 'task-b',
      totalSteps: 2,
    });
  });

  it('records an approved schedule change with before/after values and impact', async () => {
    const prisma = createPrisma();
    const service = new ProjectPlanService(prisma);

    const result = await service.applyScheduleChange('project-1', {
      entityType: 'TASK',
      entityId: 'task-b',
      nextDate: '2026-07-24T00:00:00.000Z',
      reason: '验证窗口延后',
    });

    expect(prisma.workTask.update).toHaveBeenCalledWith({
      where: { id: 'task-b' },
      data: { dueAt: new Date('2026-07-24T00:00:00.000Z') },
    });
    expect(prisma.projectPlanChange.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'project-1',
        entityType: 'TASK',
        entityId: 'task-b',
        field: 'dueAt',
        reason: '验证窗口延后',
        beforeValue: '2026-07-20T00:00:00.000Z',
        afterValue: '2026-07-24T00:00:00.000Z',
        impactPreview: expect.objectContaining({
          affectedTaskIds: ['task-b'],
          delayDays: 4,
        }),
      }),
    });
    expect(result.change.id).toBe('change-1');
  });

  it('rejects a dependency that points to a task in another project', async () => {
    const prisma = createPrisma();
    prisma.project.findFirst = jest.fn().mockResolvedValue({
      id: 'project-1',
      milestones: [],
      tasks: [
        {
          ...taskB,
          dependencies: [
            { dependsOnTaskId: 'foreign-task', dependsOnTask: { projectId: 'project-2' } },
          ],
        },
      ],
    });
    const service = new ProjectPlanService(prisma);

    await expect(service.calculateCriticalPath('project-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
