import { Injectable } from '@nestjs/common';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  async create(firstQuestion: string) {
    const title = firstQuestion.replace(/\s+/g, '').slice(0, 30);
    return this.prisma.knowledgeSession.create({ data: { title } });
  }

  async list() {
    return this.prisma.knowledgeSession.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, status: true, createdAt: true, updatedAt: true },
    });
  }

  async get(id: string) {
    return this.prisma.knowledgeSession.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, role: true, content: true, citations: true, tokenCount: true, createdAt: true },
        },
      },
    });
  }

  async addMessage(
    sessionId: string,
    data: { role: 'USER' | 'ASSISTANT'; content: string; citations?: Record<string, unknown>[]; tokenCount?: number },
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
    return this.prisma.knowledgeSession.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
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
