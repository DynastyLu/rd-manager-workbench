import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import {
  deserializeKnowledgeScope,
  KnowledgeScope,
  serializeKnowledgeScope,
} from '../domain/knowledge-scope';

type UpdateSessionInput = {
  title?: string;
  isPinned?: boolean;
  scope?: KnowledgeScope;
};

const sessionSelect = {
  id: true,
  title: true,
  status: true,
  scopeType: true,
  scopeValue: true,
  isPinned: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.KnowledgeSessionSelect;

const listSessionSelect = {
  ...sessionSelect,
  messages: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      content: true,
      createdAt: true,
    },
  },
} satisfies Prisma.KnowledgeSessionSelect;

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  async create(firstQuestion: string) {
    const title = firstQuestion.replace(/\s+/g, '').slice(0, 30);
    return this.prisma.knowledgeSession.create({ data: { title } });
  }

  async list(query: { search?: string } = {}) {
    const search = query.search?.trim();
    const sessions = await this.prisma.knowledgeSession.findMany({
      where: {
        archivedAt: null,
        ...(search ? { title: { contains: search, mode: 'insensitive' as const } } : {}),
      },
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
      select: listSessionSelect,
    });
    return sessions.map(({ messages, ...session }) => {
      const latestMessage = messages?.[0];
      return {
        ...this.presentSession(session),
        preview: latestMessage?.content.replace(/\s+/g, ' ').trim().slice(0, 300) ?? '',
        lastMessageAt: latestMessage?.createdAt ?? session.updatedAt,
      };
    });
  }

  async get(id: string) {
    const session = await this.prisma.knowledgeSession.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            content: true,
            citations: true,
            tokenCount: true,
            replyToMessageId: true,
            createdAt: true,
          },
        },
      },
    });
    if (!session || session.archivedAt) {
      throw new NotFoundException('知识问答会话不存在');
    }
    return this.presentSession(session);
  }

  async update(id: string, input: UpdateSessionInput) {
    await this.requireActive(id);
    const data: Prisma.KnowledgeSessionUpdateInput = {};

    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new BadRequestException('会话标题不能为空');
      data.title = title.slice(0, 60);
    }
    if (input.isPinned !== undefined) data.isPinned = input.isPinned;
    if (input.scope) Object.assign(data, serializeKnowledgeScope(input.scope));

    const session = await this.prisma.knowledgeSession.update({
      where: { id },
      data,
      select: sessionSelect,
    });
    return this.presentSession(session);
  }

  async addMessage(
    sessionId: string,
    data: {
      role: 'USER' | 'ASSISTANT';
      content: string;
      citations?: Record<string, unknown>[];
      tokenCount?: number;
      replyToMessageId?: string;
    },
  ) {
    await this.prisma.knowledgeSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });
    return this.prisma.knowledgeMessage.create({
      data: {
        sessionId,
        role: data.role,
        content: data.content,
        citations: (data.citations ?? null) as any,
        tokenCount: data.tokenCount ?? null,
        replyToMessageId: data.replyToMessageId ?? null,
      },
    });
  }

  async getHistory(sessionId: string): Promise<Array<{ role: string; content: string }>> {
    const messages = await this.prisma.knowledgeMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });
    return messages.map((m) => ({ role: m.role, content: m.content }));
  }

  async archive(id: string) {
    const session = await this.prisma.knowledgeSession.findUnique({
      where: { id },
      select: sessionSelect,
    });
    if (!session) throw new NotFoundException('知识问答会话不存在');
    if (session.archivedAt) return this.presentSession(session);

    const archived = await this.prisma.knowledgeSession.update({
      where: { id },
      data: { status: 'ARCHIVED', archivedAt: new Date(), isPinned: false },
      select: sessionSelect,
    });
    return this.presentSession(archived);
  }

  private async requireActive(id: string) {
    const session = await this.prisma.knowledgeSession.findUnique({
      where: { id },
      select: { id: true, archivedAt: true },
    });
    if (!session || session.archivedAt) {
      throw new NotFoundException('知识问答会话不存在');
    }
    return session;
  }

  private presentSession<
    T extends {
      scopeType: Parameters<typeof deserializeKnowledgeScope>[0]['scopeType'];
      scopeValue: Prisma.JsonValue | null;
    },
  >(session: T) {
    return {
      ...session,
      scope: deserializeKnowledgeScope(session),
    };
  }

  async logUsage(data: {
    operation: string; model: string; tokenCount: number;
    success: boolean; sessionId?: string; documentId?: string; errorCode?: string;
  }) {
    return this.prisma.aiUsageLog.create({ data }).catch(() => null);
  }

  async getUsageStats() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 86400000);
    const monthAgo = new Date(today.getTime() - 30 * 86400000);
    const sum = (rows: Array<{ tokenCount: number }>) => rows.reduce((s, r) => s + r.tokenCount, 0);
    const cost = (tokens: number) => Math.round(tokens * 0.00000027 * 100000) / 100000;

    const [todayRows, weekRows, monthRows, totalRows] = await Promise.all([
      this.prisma.aiUsageLog.findMany({ where: { createdAt: { gte: today }, success: true } }),
      this.prisma.aiUsageLog.findMany({ where: { createdAt: { gte: weekAgo }, success: true } }),
      this.prisma.aiUsageLog.findMany({ where: { createdAt: { gte: monthAgo }, success: true } }),
      this.prisma.aiUsageLog.findMany({ where: { success: true } }),
    ].map((p) => (p as Promise<Array<{ tokenCount: number }>>).catch(() => [])));

    return {
      today: { tokens: sum(todayRows as Array<{ tokenCount: number }>), cost: cost(sum(todayRows as Array<{ tokenCount: number }>)) },
      week: { tokens: sum(weekRows as Array<{ tokenCount: number }>), cost: cost(sum(weekRows as Array<{ tokenCount: number }>)) },
      month: { tokens: sum(monthRows as Array<{ tokenCount: number }>), cost: cost(sum(monthRows as Array<{ tokenCount: number }>)) },
      total: { tokens: sum(totalRows as Array<{ tokenCount: number }>), cost: cost(sum(totalRows as Array<{ tokenCount: number }>)) },
    };
  }
}
