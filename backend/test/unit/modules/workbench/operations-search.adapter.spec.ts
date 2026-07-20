import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { OperationsSearchAdapter } from '../../../../src/modules/workbench/search/adapters/operations-search.adapter';

describe('OperationsSearchAdapter', () => {
  it('finds active non-project R&D and returns its canonical source path', async () => {
    const prisma = {
      nonProjectRdItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rd-1',
            code: 'NPR-001',
            title: '向量检索预研',
            objective: '验证本地检索质量',
            expectedOutcome: '形成选型结论',
            ownerName: '研发主管',
            updatedAt: new Date('2026-07-20T00:00:00.000Z'),
          },
        ]),
      },
    } as unknown as PlatformPrismaService;
    const adapter = new OperationsSearchAdapter(prisma);

    await expect(adapter.search('检索', ['NON_PROJECT_RD'])).resolves.toEqual([
      expect.objectContaining({
        type: 'NON_PROJECT_RD',
        id: 'rd-1',
        title: '向量检索预研',
        path: '/library/operations?tab=non-project-rd&recordId=rd-1',
        actions: ['OPEN', 'COPY_LINK'],
      }),
    ]);
    expect(prisma.nonProjectRdItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ archivedAt: null }) }),
    );
  });

  it('does not query when the type is not requested', async () => {
    const findMany = jest.fn();
    const adapter = new OperationsSearchAdapter({
      nonProjectRdItem: { findMany },
    } as unknown as PlatformPrismaService);
    await expect(adapter.search('检索', ['PROJECT'])).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
