import { IntelligencePriority, IntelligenceItemStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import {
  buildIntelligenceContentHash,
  IntelligenceItemsService,
  normalizeCanonicalUrl,
} from '../../../../src/modules/workbench/intelligence/application/intelligence-items.service';

describe('IntelligenceItemsService', () => {
  it('normalizes URLs and builds a stable URL-first hash', () => {
    expect(normalizeCanonicalUrl('HTTPS://Example.com/news?b=2&a=1#section')).toBe(
      'https://example.com/news?a=1&b=2',
    );
    expect(
      buildIntelligenceContentHash({
        canonicalUrl: 'HTTPS://Example.com/news?b=2&a=1#section',
        title: 'ignored',
        summary: 'ignored',
        publishedAt: null,
      }),
    ).toBe(
      buildIntelligenceContentHash({
        canonicalUrl: 'https://example.com/news?a=1&b=2',
        title: 'different',
        summary: 'different',
        publishedAt: null,
      }),
    );
  });

  it('uses normalized content when no valid URL is available', () => {
    expect(
      buildIntelligenceContentHash({
        canonicalUrl: 'not a url',
        title: '  New   Policy ',
        summary: ' Summary\ntext ',
        publishedAt: '2026-07-20T08:30:00.000Z',
      }),
    ).toBe(
      buildIntelligenceContentHash({
        title: 'new policy',
        summary: 'summary text',
        publishedAt: '2026-07-20',
      }),
    );
  });

  it('merges a duplicate occurrence without overwriting edited card fields', async () => {
    const existing = {
      id: 'item-1',
      title: 'Edited title',
      summary: 'Human summary',
      priority: IntelligencePriority.HIGH,
      status: IntelligenceItemStatus.REVIEWING,
      archivedAt: null,
    };
    const tx = {
      $executeRaw: jest.fn(),
      intelligenceSource: { findFirst: jest.fn().mockResolvedValue({ id: 'source-1' }) },
      intelligenceTopic: { count: jest.fn().mockResolvedValue(0) },
      project: { count: jest.fn().mockResolvedValue(0) },
      intelligenceItem: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest.fn(),
        create: jest.fn(),
      },
      intelligenceOccurrence: { upsert: jest.fn().mockResolvedValue({ id: 'occurrence-2' }) },
      intelligenceItemTopic: { createMany: jest.fn() },
      intelligenceItemProject: { createMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      intelligenceItem: { findFirst: jest.fn().mockResolvedValue(existing) },
    } as unknown as PlatformPrismaService;
    const service = new IntelligenceItemsService(prisma);

    const result = await service.create({
      title: 'Incoming title',
      summary: 'Incoming summary',
      canonicalUrl: 'https://example.com/item',
      sourceId: 'source-1',
      sourceUrl: 'https://example.com/source/item',
      topicIds: [],
      projectIds: [],
    });

    expect(result).toMatchObject({ itemId: 'item-1', merged: true });
    expect(tx.intelligenceItem.create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.intelligenceOccurrence.upsert).toHaveBeenCalled();
  });

  it('revives an archived duplicate and records the new occurrence', async () => {
    const archived = { id: 'item-1', archivedAt: new Date('2026-07-01T00:00:00Z') };
    const tx = {
      $executeRaw: jest.fn(),
      intelligenceSource: { findFirst: jest.fn().mockResolvedValue({ id: 'source-1' }) },
      intelligenceTopic: { count: jest.fn().mockResolvedValue(0) },
      project: { count: jest.fn().mockResolvedValue(0) },
      intelligenceItem: {
        findUnique: jest.fn().mockResolvedValue(archived),
        update: jest.fn().mockResolvedValue({ ...archived, archivedAt: null }),
        create: jest.fn(),
      },
      intelligenceOccurrence: { upsert: jest.fn().mockResolvedValue({ id: 'occurrence-2' }) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      intelligenceItem: { findFirst: jest.fn().mockResolvedValue({ id: 'item-1' }) },
    } as unknown as PlatformPrismaService;
    const service = new IntelligenceItemsService(prisma);

    await expect(service.create({
      title: 'Incoming title',
      canonicalUrl: 'https://example.com/item',
      sourceId: 'source-1',
    })).resolves.toMatchObject({ itemId: 'item-1', merged: true });

    expect(tx.intelligenceItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { archivedAt: null },
    });
    expect(tx.intelligenceItem.create).not.toHaveBeenCalled();
  });

  it('recomputes the content hash on editable identity fields and rejects collisions', async () => {
    const current = {
      id: 'item-1',
      title: 'Old title',
      summary: 'Old summary',
      canonicalUrl: null,
      publishedAt: new Date('2026-07-01T00:00:00Z'),
      archivedAt: null,
    };
    const tx = {
      $executeRaw: jest.fn(),
      intelligenceItem: {
        findFirst: jest.fn().mockResolvedValue(current),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      intelligenceTopic: { count: jest.fn() },
      project: { count: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      intelligenceItem: { findFirst: jest.fn().mockResolvedValue({ id: 'item-1' }) },
    } as unknown as PlatformPrismaService;
    const service = new IntelligenceItemsService(prisma);

    await service.update('item-1', { title: 'New title', summary: 'New summary' });

    const contentHash = buildIntelligenceContentHash({
      title: 'New title',
      summary: 'New summary',
      canonicalUrl: null,
      publishedAt: current.publishedAt,
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.intelligenceItem.findUnique).toHaveBeenCalledWith({ where: { contentHash } });
    expect(tx.intelligenceItem.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'item-1' },
      data: expect.objectContaining({ title: 'New title', summary: 'New summary', contentHash }),
    }));

    tx.intelligenceItem.findUnique.mockResolvedValue({ id: 'item-2' });
    await expect(service.update('item-1', { title: 'Collision' })).rejects.toMatchObject({
      code: 'INTELLIGENCE_ITEM_INVALID',
      statusCode: 422,
    });
  });
});
