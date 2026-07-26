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
}
