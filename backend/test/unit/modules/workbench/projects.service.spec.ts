import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { ProjectsService } from '../../../../src/modules/workbench/projects/application/projects.service';
import { ProjectProgressService } from '../../../../src/modules/workbench/projects/application/project-progress.service';

describe('ProjectsService', () => {
  it('returns calculated project and milestone progress in project details', async () => {
    const prisma = {
      project: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'project-1',
          healthOverride: null,
          milestones: [{ id: 'milestone-1', name: '样机验证' }],
          tasks: [],
          progressReports: [],
          healthSnapshots: [],
        }),
      },
    } as unknown as PlatformPrismaService;
    const progress = {
      getSummary: jest.fn().mockResolvedValue({
        actualPercent: 56,
        timePercent: 64,
        variancePercent: -8,
        scheduleState: 'BEHIND',
        weightMode: 'EQUAL',
        currentMilestoneId: 'milestone-1',
        milestones: [
          {
            id: 'milestone-1',
            completionPercent: 68,
            completionSource: 'TASKS',
            effectiveWeightPercent: 100,
            linkedTaskCount: 6,
          },
        ],
      }),
    } as unknown as ProjectProgressService;
    const service = new ProjectsService(prisma, progress);

    await expect(service.get('project-1')).resolves.toMatchObject({
      progressSummary: {
        actualPercent: 56,
        timePercent: 64,
        variancePercent: -8,
        scheduleState: 'BEHIND',
      },
      milestones: [
        {
          id: 'milestone-1',
          completionPercent: 68,
          completionSource: 'TASKS',
          effectiveWeightPercent: 100,
          linkedTaskCount: 6,
        },
      ],
    });
  });

  it('filters by exact project identities alongside status and search', async () => {
    const findMany = jest.fn().mockReturnValue('find-many-query');
    const count = jest.fn().mockReturnValue('count-query');
    const prisma = {
      project: { findMany, count },
      $transaction: jest.fn().mockResolvedValue([[], 0]),
    } as unknown as PlatformPrismaService;
    const service = new ProjectsService(prisma);

    await service.list({
      ids: ['project-150', 'project-5'],
      search: 'alpha',
      status: 'ACTIVE',
      pageSize: 8,
    });

    const where = {
      archivedAt: null,
      id: { in: ['project-150', 'project-5'] },
      status: 'ACTIVE',
      OR: [
        { code: { contains: 'alpha', mode: 'insensitive' } },
        { name: { contains: 'alpha', mode: 'insensitive' } },
      ],
    };
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where, take: 8 }));
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('searches project code or name case-insensitively', async () => {
    const findMany = jest.fn().mockReturnValue('find-many-query');
    const count = jest.fn().mockReturnValue('count-query');
    const transaction = jest.fn().mockResolvedValue([[], 0]);
    const prisma = {
      project: { findMany, count },
      $transaction: transaction,
    } as unknown as PlatformPrismaService;
    const service = new ProjectsService(prisma);

    await service.list({ search: 'alpha', page: 2, pageSize: 20 });

    const where = {
      archivedAt: null,
      OR: [
        { code: { contains: 'alpha', mode: 'insensitive' } },
        { name: { contains: 'alpha', mode: 'insensitive' } },
      ],
    };
    expect(findMany).toHaveBeenCalledWith({
      where,
      include: {
        healthSnapshots: {
          orderBy: [{ calculatedAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: 20,
      take: 20,
    });
    expect(count).toHaveBeenCalledWith({ where });
    expect(transaction).toHaveBeenCalledWith(['find-many-query', 'count-query']);
  });

  it('maps the latest health snapshot and keeps projects without one explicitly unassessed', async () => {
    const prisma = {
      project: { findMany: jest.fn(), count: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([
        [
          { id: 'project-yellow', healthSnapshots: [{ health: 'YELLOW' }] },
          { id: 'project-unassessed', healthSnapshots: [] },
        ],
        2,
      ]),
    } as unknown as PlatformPrismaService;
    const service = new ProjectsService(prisma);

    await expect(service.list({})).resolves.toMatchObject({
      data: [
        { id: 'project-yellow', health: 'YELLOW' },
        { id: 'project-unassessed', health: null },
      ],
    });
  });

  it('does not update a project that is archived after an earlier active read', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      project: {
        findFirst: jest.fn().mockResolvedValue({ id: 'project-1' }),
        update: jest.fn().mockResolvedValue({ id: 'project-1', name: '错误更新' }),
        updateMany,
        findUniqueOrThrow: jest.fn(),
      },
    } as unknown as PlatformPrismaService;
    const service = new ProjectsService(prisma);

    await expect(service.update('project-1', { name: '不应更新' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'project-1', archivedAt: null },
      data: { name: '不应更新' },
    });
  });

  it('does not enable custom milestone weights until the configured total is exactly 100', async () => {
    const updateMany = jest.fn();
    const prisma = {
      project: { updateMany },
      milestone: {
        findMany: jest.fn().mockResolvedValue([
          { weightPercent: { toNumber: () => 40 } },
          { weightPercent: { toNumber: () => 40 } },
        ]),
      },
    } as unknown as PlatformPrismaService;
    const service = new ProjectsService(prisma);

    await expect(
      service.update('project-1', { weightMode: 'CUSTOM' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
