import { IntelligenceRunStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { IntelligenceItemsService } from '../../../../src/modules/workbench/intelligence/application/intelligence-items.service';
import { IntelligenceRunsService } from '../../../../src/modules/workbench/intelligence/application/intelligence-runs.service';

describe('IntelligenceRunsService', () => {
  it('ingests structured collected items atomically and derives the run item count', async () => {
    const transaction = {
      intelligenceCollectionPlan: {
        findFirst: jest.fn().mockResolvedValue({ id: 'plan-1', sourceId: 'source-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      intelligenceRun: { create: jest.fn().mockImplementation(({ data }) => ({ id: 'run-1', ...data })) },
    };
    const prisma = {
      $transaction: jest.fn((work: (tx: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PlatformPrismaService;
    const items = {
      ingestInTransaction: jest.fn().mockResolvedValue({ itemId: 'item-1', merged: false }),
    } as unknown as IntelligenceItemsService;
    const service = new IntelligenceRunsService(prisma, items);

    await service.recordManualRun('plan-1', {
      status: IntelligenceRunStatus.SUCCEEDED,
      itemCount: 99,
      inputSummary: '手动粘贴两条结果',
      items: [
        { title: '政策更新', canonicalUrl: 'https://example.com/a' },
        { title: '竞品动态', summary: '发布新版' },
      ],
    });

    expect(items.ingestInTransaction).toHaveBeenCalledTimes(2);
    expect(items.ingestInTransaction).toHaveBeenNthCalledWith(1, transaction, expect.objectContaining({
      title: '政策更新',
      sourceId: 'source-1',
    }));
    expect(transaction.intelligenceRun.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ itemCount: 2 }),
    }));
  });

  it('rejects collected items on a failed run', async () => {
    const prisma = { $transaction: jest.fn() } as unknown as PlatformPrismaService;
    const service = new IntelligenceRunsService(prisma, {} as IntelligenceItemsService);

    await expect(service.recordManualRun('plan-1', {
      status: IntelligenceRunStatus.FAILED,
      errorMessage: '网络失败',
      items: [{ title: '不应入库' }],
    })).rejects.toMatchObject({ code: 'INTELLIGENCE_RUN_INVALID' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
