import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { TasksService } from '../../../../src/modules/workbench/tasks/application/tasks.service';
import { ProjectHealthService } from '../../../../src/modules/workbench/projects/application/project-health.service';

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
