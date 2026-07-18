import { NotFoundException } from '@nestjs/common';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { ProjectsService } from '../../../../src/modules/workbench/projects/application/projects.service';

describe('ProjectsService', () => {
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
