import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SessionService } from '../../../../../src/modules/workbench/knowledge/application/session.service';

describe('SessionService workspace behavior', () => {
  const prisma = {
    knowledgeSession: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    knowledgeMessage: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    aiUsageLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };
  let service: SessionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SessionService(prisma as never);
  });

  it('searches active sessions and keeps pinned sessions first', async () => {
    prisma.knowledgeSession.findMany.mockResolvedValue([]);

    await service.list({ search: ' 评审 ' });

    expect(prisma.knowledgeSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          archivedAt: null,
          title: { contains: '评审', mode: 'insensitive' },
        },
        orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
      }),
    );
  });

  it('returns the latest message preview for the history page', async () => {
    prisma.knowledgeSession.findMany.mockResolvedValue([
      {
        id: 's1',
        title: '项目复盘',
        scopeType: 'ALL',
        scopeValue: null,
        messages: [
          {
            content: '这是最近一条会话内容，用于历史列表摘要。',
            createdAt: new Date('2026-07-28T10:00:00.000Z'),
          },
        ],
      },
    ]);

    const result = await service.list();

    expect(result[0]).toMatchObject({
      preview: '这是最近一条会话内容，用于历史列表摘要。',
      lastMessageAt: new Date('2026-07-28T10:00:00.000Z'),
    });
    expect(prisma.knowledgeSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          messages: expect.objectContaining({
            take: 1,
          }),
        }),
      }),
    );
  });

  it('renames, pins, and persists a normalized project scope', async () => {
    prisma.knowledgeSession.findUnique.mockResolvedValue({ id: 's1', archivedAt: null });
    prisma.knowledgeSession.update.mockResolvedValue({ id: 's1' });

    await service.update('s1', {
      title: '  项目行动项  ',
      isPinned: true,
      scope: { type: 'PROJECT', projectId: 'p1' },
    });

    expect(prisma.knowledgeSession.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: {
        title: '项目行动项',
        isPinned: true,
        scopeType: 'PROJECT',
        scopeValue: { projectId: 'p1' },
      },
      select: expect.any(Object),
    });
  });

  it('deduplicates selected document ids and rejects an empty document scope', async () => {
    prisma.knowledgeSession.findUnique.mockResolvedValue({ id: 's1', archivedAt: null });
    prisma.knowledgeSession.update.mockResolvedValue({ id: 's1' });

    await service.update('s1', {
      scope: { type: 'DOCUMENTS', documentIds: ['d1', 'd1', 'd2'] },
    });
    expect(prisma.knowledgeSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          scopeType: 'DOCUMENTS',
          scopeValue: { documentIds: ['d1', 'd2'] },
        },
      }),
    );

    await expect(
      service.update('s1', { scope: { type: 'DOCUMENTS', documentIds: [] } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('archives a session idempotently', async () => {
    prisma.knowledgeSession.findUnique
      .mockResolvedValueOnce({ id: 's1', archivedAt: null })
      .mockResolvedValueOnce({ id: 's1', archivedAt: new Date('2026-07-28') });
    prisma.knowledgeSession.update.mockResolvedValue({ id: 's1', status: 'ARCHIVED' });

    await service.archive('s1');
    await service.archive('s1');

    expect(prisma.knowledgeSession.update).toHaveBeenCalledTimes(1);
  });

  it('rejects updates to missing or archived sessions', async () => {
    prisma.knowledgeSession.findUnique.mockResolvedValue(null);
    await expect(service.update('missing', { title: '新标题' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
