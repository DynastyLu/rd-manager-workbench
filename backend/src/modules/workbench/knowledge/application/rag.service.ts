import { Injectable } from '@nestjs/common';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { DeepSeekHttpService } from './deepseek-http.service';
import { ChunkCitation } from '../domain/knowledge.types';

const SYSTEM_PROMPT = `你是一个本地研发知识库助手，服务于研发主管的日常决策。
你的知识来源是用户本机的文档、会议纪要、方案和复盘。

规则：
1. 只根据 <context></context> 中提供的内容回答
2. 如果上下文中没有足够信息，诚实说明"知识库中未找到相关信息"
3. 回答末尾列出引用的文档标题和所在知识空间
4. 用中文回答，简洁专业
5. 不要编造内容，不要使用外部知识`;

const TOP_K = 20;
const SIMILARITY_THRESHOLD = 0.08;
const MAX_CONTEXT_TOKENS = 3500;
const MAX_HISTORY_TOKENS = 2000;

interface ChunkRow {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  document_title: string;
  space_name: string | null;
  similarity: number;
}

@Injectable()
export class RagService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly deepseek: DeepSeekHttpService,
  ) {}

  async ask(params: {
    question: string;
    history: Array<{ role: string; content: string }>;
  }): Promise<{ stream: ReadableStream<Uint8Array>; citations: ChunkCitation[]; totalFound: number; relevantCount: number }> {
    const chunks = await this.prisma.$queryRawUnsafe<ChunkRow[]>(
      `SELECT dc.id, dc.document_id, dc.chunk_index, dc.content, dc.metadata,
              cd.title as document_title,
              ks.name as space_name,
              public.similarity(dc.content, $1) AS similarity
       FROM app.document_chunks dc
       JOIN app.content_documents cd ON cd.id = dc.document_id
       LEFT JOIN app.knowledge_spaces ks ON ks.id = cd.space_id
       WHERE cd.status = 'ACTIVE'
         AND cd.trashed_at IS NULL
         AND dc.content IS NOT NULL
         AND dc.content != ''
       ORDER BY public.similarity(dc.content, $1) DESC
       LIMIT $2`,
      params.question, TOP_K,
    );

    const relevant = chunks.filter((c) => Number(c.similarity) >= SIMILARITY_THRESHOLD);

    const citations: ChunkCitation[] = [];
    let contextUsed = 0;
    const contextParts: string[] = [];

    for (const chunk of relevant) {
      const chunkTokens = Math.ceil(chunk.content.length / 2);
      if (contextUsed + chunkTokens > MAX_CONTEXT_TOKENS) break;
      const location = chunk.space_name ? `[${chunk.space_name}] ${chunk.document_title}` : chunk.document_title;
      contextParts.push(`[来源: ${location}]\n${chunk.content}`);
      citations.push({
        documentId: chunk.document_id,
        title: chunk.document_title,
        chunkIndex: chunk.chunk_index,
        text: chunk.content.slice(0, 200),
        content: chunk.content,
        spaceName: chunk.space_name || undefined,
        similarity: Number(chunk.similarity),
      });
      contextUsed += chunkTokens;
    }

    const systemPrompt = contextParts.length > 0
      ? `${SYSTEM_PROMPT}\n\n<context>\n${contextParts.join('\n---\n')}\n</context>`
      : `${SYSTEM_PROMPT}\n\n知识库中未找到与该问题相关的信息。请如实告知用户。`;

    const historyMessages = this.truncateHistory(params.history, MAX_HISTORY_TOKENS);
    const messages = [
      ...historyMessages.map((m) => ({
        role: (m.role === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: params.question },
    ];

    const stream = await this.deepseek.streamChat({ messages, systemPrompt });
    return { stream, citations, totalFound: chunks.length, relevantCount: relevant.length };
  }

  private truncateHistory(
    history: Array<{ role: string; content: string }>,
    maxTokens: number,
  ): Array<{ role: string; content: string }> {
    let used = 0;
    const result: Array<{ role: string; content: string }> = [];
    for (let i = history.length - 1; i >= 0; i--) {
      const tokens = Math.ceil(history[i].content.length / 2);
      if (used + tokens > maxTokens) break;
      result.unshift(history[i]);
      used += tokens;
    }
    return result;
  }
}
