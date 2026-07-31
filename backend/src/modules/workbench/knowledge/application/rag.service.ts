import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { DataScopeService } from '../../../iam/application/data-scope.service';
import { DeepSeekHttpService } from './deepseek-http.service';
import { ChunkCitation } from '../domain/knowledge.types';
import { EmbeddingService } from './embedding.service';
import {
  buildKnowledgeScopeSql,
  KnowledgeScope,
  normalizeKnowledgeScope,
} from '../domain/knowledge-scope';

const SYSTEM_PROMPT = `你是一个本地研发知识库助手，服务于研发主管的日常决策。
你的知识来源是用户本机的文档、会议纪要、方案和复盘。

规则：
1. 只根据 <context></context> 中提供的内容回答
2. 如果上下文中没有足够信息，诚实说明"知识库中未找到相关信息"
3. 回答末尾列出引用的文档标题和所在知识空间
4. 用中文回答，简洁专业
5. 不要编造内容，不要使用外部知识`;

const TOP_K = 20;
const SIMILARITY_THRESHOLD = 0.01; // lowered from 0.08 — pg_trgm scores are very low for short queries
const MAX_CONTEXT_TOKENS = 3500;
const MAX_HISTORY_TOKENS = 2000;
const KEYWORD_MATCH_BONUS = 0.5; // bonus added to similarity for keyword-containing chunks

interface ChunkRow {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  document_title: string;
  space_name: string | null;
  similarity: number;
  page_number: number | null;
  sheet_name: string | null;
  location_label: string | null;
}

/** Extract 2+ character keywords from a question */
function extractKeywords(question: string): string[] {
  const matched = String(question || '').match(/[一-龥A-Za-z0-9-]{2,}/g) || [];
  return [...new Set(matched)].sort((a, b) => b.length - a.length);
}

function isSummaryRequest(question: string): boolean {
  return /(总结|汇总|摘要|概括|归纳|综述|回顾)/.test(question);
}

@Injectable()
export class RagService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly deepseek: DeepSeekHttpService,
    private readonly embeddings: EmbeddingService,
    private readonly requestContext: RequestContextService,
    private readonly dataScope: DataScopeService,
  ) {}

  async ask(params: {
    question: string;
    history: Array<{ role: string; content: string }>;
    scope?: KnowledgeScope;
  }): Promise<{
    stream: ReadableStream<Uint8Array> | null;
    citations: ChunkCitation[];
    totalFound: number;
    relevantCount: number;
    searchedDocumentCount: number;
    hasEvidence: boolean;
  }> {
    const principal = this.requestContext.requirePrincipal();
    const chunkScope = this.dataScope.knowledge(principal);
    const authScopeSql = await this.buildAuthScopeSql(chunkScope);
    if (authScopeSql === null) {
      return {
        stream: null,
        citations: [],
        totalFound: 0,
        relevantCount: 0,
        searchedDocumentCount: 0,
        hasEvidence: false,
      };
    }

    const keywords = extractKeywords(params.question);
    const scope = normalizeKnowledgeScope(params.scope ?? { type: 'ALL' });
    const scopeSql = buildKnowledgeScopeSql(scope);

    // Primary: pg_trgm similarity search
    const trigramResults = await this.prisma.$queryRaw<ChunkRow[]>(Prisma.sql`
       SELECT dc.id, dc.document_id, dc.chunk_index, dc.content, dc.metadata,
              dc.page_number, dc.sheet_name, dc.location_label,
              cd.title as document_title,
              ks.name as space_name,
              public.similarity(dc.content, ${params.question}) AS similarity
       FROM app.document_chunks dc
       JOIN app.content_documents cd ON cd.id = dc.document_id
       LEFT JOIN app.knowledge_spaces ks ON ks.id = cd.space_id
       WHERE cd.status = 'ACTIVE'
         AND cd.trashed_at IS NULL
         AND cd.index_status IN ('READY', 'PARTIAL')
         AND dc.content IS NOT NULL
         AND dc.content != ''
         ${scopeSql}
         ${authScopeSql}
       ORDER BY public.similarity(dc.content, ${params.question}) DESC
       LIMIT ${TOP_K * 2}
    `);

    // Collect results in a map (deduplicate by chunk id)
    const chunkMap = new Map<string, ChunkRow & { score: number }>();

    for (const c of trigramResults) {
      const sim = Number(c.similarity);
      let score = sim;
      // Boost chunks that contain user's keywords (helps for short queries)
      for (const kw of keywords) {
        if (c.content.includes(kw)) score += KEYWORD_MATCH_BONUS;
      }
      chunkMap.set(c.id, { ...c, score });
    }

    // Summary requests need broad document coverage instead of only chunks whose
    // wording resembles the command itself ("总结", "汇总", ...).
    if (isSummaryRequest(params.question)) {
      const recentResults = await this.prisma.$queryRaw<ChunkRow[]>(Prisma.sql`
         SELECT dc.id, dc.document_id, dc.chunk_index, dc.content, dc.metadata,
                dc.page_number, dc.sheet_name, dc.location_label,
                cd.title as document_title,
                ks.name as space_name,
                0.2::float8 AS similarity
         FROM app.document_chunks dc
         JOIN app.content_documents cd ON cd.id = dc.document_id
         LEFT JOIN app.knowledge_spaces ks ON ks.id = cd.space_id
         WHERE cd.status = 'ACTIVE'
           AND cd.trashed_at IS NULL
           AND cd.index_status IN ('READY', 'PARTIAL')
           AND dc.content IS NOT NULL
           AND dc.content != ''
           ${scopeSql}
           ${authScopeSql}
         ORDER BY cd.updated_at DESC, dc.chunk_index ASC
         LIMIT ${TOP_K}
      `);
      for (const chunk of recentResults) {
        if (!chunkMap.has(chunk.id)) chunkMap.set(chunk.id, { ...chunk, score: 0.2 });
      }
    }

    const [questionEmbedding] = await this.embeddings.embed([params.question]);
    if (questionEmbedding) {
      const vectorLiteral = `[${questionEmbedding.join(',')}]`;
      const vectorResults = await this.prisma.$queryRaw<ChunkRow[]>(Prisma.sql`
         SELECT dc.id, dc.document_id, dc.chunk_index, dc.content, dc.metadata,
                dc.page_number, dc.sheet_name, dc.location_label,
                cd.title as document_title,
                ks.name as space_name,
                1 - (dc.embedding <=> ${vectorLiteral}::public.vector) AS similarity
         FROM app.document_chunks dc
         JOIN app.content_documents cd ON cd.id = dc.document_id
         LEFT JOIN app.knowledge_spaces ks ON ks.id = cd.space_id
         WHERE cd.status = 'ACTIVE'
           AND cd.trashed_at IS NULL
           AND cd.index_status IN ('READY', 'PARTIAL')
           AND dc.embedding IS NOT NULL
           ${scopeSql}
           ${authScopeSql}
         ORDER BY dc.embedding <=> ${vectorLiteral}::public.vector
         LIMIT ${TOP_K}
      `);
      for (const chunk of vectorResults) {
        const score = Number(chunk.similarity);
        const existing = chunkMap.get(chunk.id);
        if (!existing || score > existing.score) chunkMap.set(chunk.id, { ...chunk, score });
      }
    }

    // Fallback: if few trigram results, also do keyword LIKE search
    const aboveThreshold = [...chunkMap.values()].filter((c) => c.similarity >= SIMILARITY_THRESHOLD);
    if (aboveThreshold.length < 5 && keywords.length > 0) {
      for (const kw of keywords.slice(0, 5)) {
        const likeResults = await this.prisma.$queryRaw<ChunkRow[]>(Prisma.sql`
           SELECT dc.id, dc.document_id, dc.chunk_index, dc.content, dc.metadata,
                  dc.page_number, dc.sheet_name, dc.location_label,
                  cd.title as document_title,
                  ks.name as space_name,
                  public.similarity(dc.content, ${kw}) AS similarity
           FROM app.document_chunks dc
           JOIN app.content_documents cd ON cd.id = dc.document_id
           LEFT JOIN app.knowledge_spaces ks ON ks.id = cd.space_id
           WHERE cd.status = 'ACTIVE'
             AND cd.trashed_at IS NULL
             AND cd.index_status IN ('READY', 'PARTIAL')
             AND dc.content ILIKE '%' || ${kw} || '%'
             ${scopeSql}
             ${authScopeSql}
           ORDER BY public.similarity(dc.content, ${kw}) DESC
           LIMIT 10
        `);
        for (const c of likeResults) {
          if (!chunkMap.has(c.id)) {
            const sim = Number(c.similarity);
            chunkMap.set(c.id, { ...c, score: sim + KEYWORD_MATCH_BONUS * 2 });
          }
        }
      }
    }

    // Sort by score descending, take top K
    const sorted = [...chunkMap.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K);

    // Filter: keep chunks above similarity threshold OR containing keywords
    const relevant = sorted.filter((c) =>
      c.similarity >= SIMILARITY_THRESHOLD ||
      keywords.some((kw) => c.content.includes(kw)),
    );

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
        similarity: chunk.score,
        pageNumber: chunk.page_number ?? undefined,
        sheetName: chunk.sheet_name ?? undefined,
        locationLabel: chunk.location_label ?? undefined,
      });
      contextUsed += chunkTokens;
    }

    const searchedDocumentCount = new Set(sorted.map((chunk) => chunk.document_id)).size;
    if (citations.length === 0) {
      return {
        stream: null,
        citations: [],
        totalFound: sorted.length,
        relevantCount: 0,
        searchedDocumentCount,
        hasEvidence: false,
      };
    }

    const systemPrompt = `${SYSTEM_PROMPT}\n\n<context>\n${contextParts.join('\n---\n')}\n</context>`;

    const historyMessages = this.truncateHistory(params.history, MAX_HISTORY_TOKENS);
    const messages = [
      ...historyMessages.map((m) => ({
        role: (m.role === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: params.question },
    ];

    const stream = await this.deepseek.streamChat({ messages, systemPrompt });
    return {
      stream,
      citations,
      totalFound: sorted.length,
      relevantCount: citations.length,
      searchedDocumentCount,
      hasEvidence: true,
    };
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

  private async buildAuthScopeSql(
    chunkScope: Prisma.DocumentChunkWhereInput,
  ): Promise<Prisma.Sql | null> {
    if (Object.keys(chunkScope).length === 0) {
      return Prisma.empty;
    }
    if ('id' in chunkScope) {
      return Prisma.sql`AND 1=0`;
    }
    const documentWhere = (chunkScope as { document?: Prisma.ContentDocumentWhereInput }).document;
    if (!documentWhere) {
      return Prisma.sql`AND 1=0`;
    }
    const documents = await this.prisma.contentDocument.findMany({
      where: {
        status: 'ACTIVE',
        trashedAt: null,
        AND: documentWhere,
      },
      select: { id: true },
    });
    if (documents.length === 0) {
      return Prisma.sql`AND 1=0`;
    }
    return Prisma.sql`AND cd.id IN (${Prisma.join(documents.map((d) => d.id))})`;
  }
}
