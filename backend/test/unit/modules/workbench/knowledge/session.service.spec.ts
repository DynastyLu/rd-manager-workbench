import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SessionService } from '../../../../../src/modules/workbench/knowledge/application/session.service';

describe('SessionService workspace behavior', () => {
  const prisma = {
    knowledgeSession: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
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
  const requestContext = {
    requirePrincipal: jest.fn().mockReturnValue({ userId: 'user-1', roleCodes: [] }),
  };
  let service: SessionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SessionService(prisma as never, requestContext as never);
  });

  it('searches active sessions in separate deterministic pinned and regular pages', async () => {
    prisma.knowledgeSession.findMany.mockResolvedValue([]);

    await service.list({ search: ' 评审 ' });

    expect(prisma.knowledgeSession.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          archivedAt: null,
          isPinned: true,
          ownerUserId: 'user-1',
          title: { contains: '评审', mode: 'insensitive' },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(prisma.knowledgeSession.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          archivedAt: null,
          isPinned: false,
          ownerUserId: 'user-1',
          title: { contains: '评审', mode: 'insensitive' },
        },
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

    expect(result.items[0]).toMatchObject({
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
    prisma.knowledgeSession.findFirst.mockResolvedValue({ id: 's1', archivedAt: null });
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
    prisma.knowledgeSession.findFirst.mockResolvedValue({ id: 's1', archivedAt: null });
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
    prisma.knowledgeSession.findFirst
      .mockResolvedValueOnce({ id: 's1', archivedAt: null })
      .mockResolvedValueOnce({ id: 's1', archivedAt: new Date('2026-07-28') });
    prisma.knowledgeSession.update.mockResolvedValue({ id: 's1', status: 'ARCHIVED' });

    await service.archive('s1');
    await service.archive('s1');

    expect(prisma.knowledgeSession.update).toHaveBeenCalledTimes(1);
  });

  it('rejects updates to missing or archived sessions', async () => {
    prisma.knowledgeSession.findFirst.mockResolvedValue(null);
    await expect(service.update('missing', { title: '新标题' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns pinned sessions separately and an opaque cursor for regular sessions', async () => {
    prisma.knowledgeSession.findMany
      .mockResolvedValueOnce([
        {
          id: 'p1',
          title: '置顶会话',
          isPinned: true,
          scopeType: 'ALL',
          scopeValue: null,
          messages: [],
          updatedAt: new Date('2026-07-29T08:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 's3',
          title: '第三条',
          isPinned: false,
          scopeType: 'ALL',
          scopeValue: null,
          messages: [],
          updatedAt: new Date('2026-07-29T07:00:00.000Z'),
        },
        {
          id: 's2',
          title: '第二条',
          isPinned: false,
          scopeType: 'ALL',
          scopeValue: null,
          messages: [],
          updatedAt: new Date('2026-07-29T06:00:00.000Z'),
        },
        {
          id: 's1',
          title: '第一条',
          isPinned: false,
          scopeType: 'ALL',
          scopeValue: null,
          messages: [],
          updatedAt: new Date('2026-07-29T05:00:00.000Z'),
        },
      ]);

    const page = await service.list({ limit: 2 });

    expect(page.pinned.map((session: { id: string }) => session.id)).toEqual(['p1']);
    expect(page.items.map((session: { id: string }) => session.id)).toEqual(['s3', 's2']);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(page.nextCursor).not.toContain('2026-07-29');
    expect(prisma.knowledgeSession.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ archivedAt: null, isPinned: false }),
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 3,
      }),
    );
  });

  it('loads the latest messages first and exposes a cursor for older history', async () => {
    prisma.knowledgeSession.findFirst.mockResolvedValue({
      id: 's1',
      title: '长对话',
      archivedAt: null,
      scopeType: 'ALL',
      scopeValue: null,
      messages: [
        { id: 'm3', role: 'USER', content: '3', createdAt: new Date('2026-07-29T03:00:00Z') },
        { id: 'm2', role: 'ASSISTANT', content: '2', createdAt: new Date('2026-07-29T02:00:00Z') },
        { id: 'm1', role: 'USER', content: '1', createdAt: new Date('2026-07-29T01:00:00Z') },
      ],
    });

    const session = await service.get('s1', { messageLimit: 2 });

    expect(session.messages.map((message: { id: string }) => message.id)).toEqual(['m2', 'm3']);
    expect(session.messageNextCursor).toEqual(expect.any(String));
    expect(prisma.knowledgeSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          messages: expect.objectContaining({
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 3,
          }),
        },
      }),
    );
  });
});
