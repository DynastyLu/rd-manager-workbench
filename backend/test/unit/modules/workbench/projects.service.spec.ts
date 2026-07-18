import { NotFoundException } from '@nestjs/common';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { ProjectsService } from '../../../../src/modules/workbench/projects/application/projects.service';

describe('ProjectsService', () => {
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
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: 20,
      take: 20,
    });
    expect(count).toHaveBeenCalledWith({ where });
    expect(transaction).toHaveBeenCalledWith(['find-many-query', 'count-query']);
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
});
