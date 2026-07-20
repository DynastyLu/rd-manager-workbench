import { IntelligenceBriefKind, IntelligencePriority } from '@prisma/client';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { IntelligenceBriefsService } from '../../../../src/modules/workbench/intelligence/application/intelligence-briefs.service';

describe('IntelligenceBriefsService', () => {
  it('upserts by kind/date, preserves input order and stores whitelist snapshots', async () => {
    const tx = {
      intelligenceItem: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'b', title: 'B', summary: 'second', priority: IntelligencePriority.LOW, publishedAt: null, canonicalUrl: null, occurrences: [] },
          { id: 'a', title: 'A', summary: 'first', priority: IntelligencePriority.HIGH, publishedAt: new Date('2026-07-19T00:00:00Z'), canonicalUrl: 'https://a.example', occurrences: [{ source: { name: 'Source A' } }] },
        ]),
      },
      intelligenceBrief: {
        upsert: jest.fn().mockResolvedValue({ id: 'brief-1' }),
        findFirst: jest.fn(),
      },
      intelligenceBriefItem: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)) } as unknown as PlatformPrismaService;
    const service = new IntelligenceBriefsService(prisma);
    jest.spyOn(service, 'get').mockResolvedValue({ id: 'brief-1' } as never);

    await service.save({ kind: IntelligenceBriefKind.DAILY, briefDate: '2026-07-20', itemIds: ['a', 'b'] });

    expect(tx.intelligenceBrief.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { kind_briefDate: { kind: IntelligenceBriefKind.DAILY, briefDate: new Date('2026-07-20T00:00:00.000Z') } },
    }));
    expect(tx.intelligenceBriefItem.createMany).toHaveBeenCalledWith({ data: [
      expect.objectContaining({ itemId: 'a', sequence: 0, snapshot: expect.objectContaining({ title: 'A', sourceNames: ['Source A'] }) }),
      expect.objectContaining({ itemId: 'b', sequence: 1, snapshot: expect.objectContaining({ title: 'B', sourceNames: [] }) }),
    ] });
  });

  it('rejects duplicate item ids before writing a brief', async () => {
    const prisma = { $transaction: jest.fn() } as unknown as PlatformPrismaService;
    const service = new IntelligenceBriefsService(prisma);
    await expect(service.save({ kind: IntelligenceBriefKind.WEEKLY, briefDate: '2026-07-20', itemIds: ['a', 'a'] })).rejects.toMatchObject({ code: 'INTELLIGENCE_BRIEF_INVALID' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('updates the exact brief id instead of upserting a different kind/date record', async () => {
    const tx = {
      intelligenceBrief: {
        findFirst: jest.fn().mockResolvedValue({ id: 'brief-1' }),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 'brief-1' }),
      },
      intelligenceItem: { findMany: jest.fn().mockResolvedValue([]) },
      intelligenceBriefItem: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PlatformPrismaService;
    const service = new IntelligenceBriefsService(prisma);
    jest.spyOn(service, 'get').mockResolvedValue({ id: 'brief-1' } as never);

    await service.update('brief-1', {
      kind: IntelligenceBriefKind.WEEKLY,
      briefDate: '2026-07-20',
      title: '周报修订版',
      itemIds: [],
    });

    expect(tx.intelligenceBrief.update).toHaveBeenCalledWith({
      where: { id: 'brief-1' },
      data: expect.objectContaining({
        kind: IntelligenceBriefKind.WEEKLY,
        briefDate: new Date('2026-07-20T00:00:00.000Z'),
        title: '周报修订版',
      }),
    });
  });
});
