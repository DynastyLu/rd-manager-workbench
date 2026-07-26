# 知识库 RAG 全面升级 + DeepSeek 全量迁移 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将知识库从"关键词检索 + OpenAI 一次性返回"升级为完整的 RAG 系统（pgvector 语义搜索 + DeepSeek Chat 流式问答 + 多轮对话），同时把全部 AI 能力从 OpenAI 迁移到 DeepSeek，增加知识库文件管理功能。

**Architecture:** 新增 `knowledge` NestJS 模块（chunking / embedding / RAG / session / indexing 五个 service），pgvector 向量存储，SSE 流式协议。现有 `extensions` 模块的 `OPENAI_RESPONSES` provider 改为 `DEEPSEEK_CHAT`，Electron 扩展桥增加 `extension.stream` 事件。前端新增 `modules/knowledge/`（对话界面 + 文件浏览器），在 `KnowledgeHomePage` 内增加"AI 问答"Tab。浏览器直连模式下，后端从 `.env` 读 `DEEPSEEK_API_KEY` 直调 API。

**Tech Stack:** NestJS 10, Prisma 6, PostgreSQL + pgvector, DeepSeek API (OpenAI-compatible), ExcelJS (已有), mammoth, pdf-parse, react-markdown + remark-gfm + rehype-highlight, React 19, Semi UI, React Query, SSE (fetch ReadableStream)

---

## Global Constraints

- 工作目录：`/Users/dynastylu/Desktop/AICode/rd-manager-workbench`
- DeepSeek API base: `https://api.deepseek.com/v1`，model: `deepseek-chat`
- Embedding 维度：1536（按实际 API 响应调整）
- chunk_size: 512 tokens，chunk_overlap: 64 tokens
- top_k: 20，相似度阈值: 0.7
- 上下文窗口: ~6000 tokens（system 200 + history 2000 + chunks 3500 + answer 300）
- 文件上传限制：单文件 50 MiB，批量 200 MiB，单次最多 10 个
- 中文 UI，Semi Design 组件，不引入原生 date/select 控件
- TDD（先写失败测试再实现），每个 Task 以独立可验证的交付物结束
- .env 凭据不入库（已 gitignore），凭据通过 Electron safeStorage 或 .env 读取
- 不引入 LangChain/LlamaIndex，不引入第三方向量数据库

---

## File Structure

### Backend files to create

```
backend/src/modules/workbench/knowledge/
├── knowledge.module.ts
├── domain/
│   ├── knowledge.types.ts
│   ├── chunking.ts
│   └── embedding-cache.ts
├── application/
│   ├── chunking.service.ts
│   ├── embedding.service.ts
│   ├── rag.service.ts
│   ├── session.service.ts
│   ├── indexing.service.ts
│   └── deepseek-http.service.ts
├── interface/
│   └── http/
│       ├── knowledge.controller.ts
│       └── dto/knowledge.dto.ts
├── knowledge.gateway.ts
└── __tests__/
    ├── chunking.service.spec.ts
    ├── embedding.service.spec.ts
    ├── rag.service.spec.ts
    ├── session.service.spec.ts
    ├── indexing.service.spec.ts
    ├── deepseek-http.service.spec.ts
    └── knowledge.controller.spec.ts (integration)

backend/prisma/migrations/<timestamp>_knowledge_rag/
    └── migration.sql

backend/src/shared/export/safe-export-text.ts (moved from Task 13 fix, already exists)
```

### Backend files to modify

```
backend/prisma/schema.prisma
  — new enums: KnowledgeSessionStatus, MessageRole
  — new models: DocumentChunk, KnowledgeSession, KnowledgeMessage, AiUsageLog
  — ResourceProfile: + aiUsageLogs
  — ext: OPENAI_RESPONSES → DEEPSEEK_CHAT enum values

backend/src/modules/workbench/workbench.module.ts
  — register KnowledgeModule

backend/src/modules/workbench/extensions/
  — extensions.service.ts: OPENAI_RESPONSES → DEEPSEEK_CHAT provider + operations
  — extensions.module.ts: import KnowledgeModule
  — ai-context.service.ts: knowledgeQuestion → switch to vector search
  — ai-adoption.service.ts: adapt for streaming adoption flow

backend/src/modules/workbench/content/
  — content.module.ts: import KnowledgeModule
  — documents.service.ts: trigger indexing after create/update

backend/src/shared/errors/error-codes.ts
  — new codes: DEEPSEEK_API_ERROR, EMBEDDING_FAILED, RAG_SEARCH_FAILED, etc.

backend/test/integration/
  — modules/workbench/knowledge.controller.spec.ts

backend/test/unit/modules/workbench/
  — chunking.service.spec.ts
  — embedding.service.spec.ts
  — rag.service.spec.ts
  — session.service.spec.ts
  — indexing.service.spec.ts
  — deepseek-http.service.spec.ts
```

### Frontend files to create

```
frontend/src/modules/knowledge/
├── api.ts
├── types.ts
├── queryKeys.ts
├── format.ts (shared helpers: percentage, safe text)
├── components/
│   ├── KnowledgeChatPanel.tsx
│   ├── KnowledgeSessionList.tsx
│   ├── KnowledgeMessageBubble.tsx
│   ├── KnowledgeCitationCard.tsx
│   ├── KnowledgeChatInput.tsx
│   ├── KnowledgeMarkdown.tsx
│   ├── KnowledgeFileBrowser.tsx
│   ├── KnowledgeFileDetail.tsx
│   ├── KnowledgeFileUploadModal.tsx
│   └── KnowledgeIndexStatus.tsx
└── __tests__/
    ├── api.test.ts
    ├── KnowledgeChatPanel.test.tsx
    ├── KnowledgeSessionList.test.tsx
    ├── KnowledgeFileBrowser.test.tsx
    └── KnowledgeMarkdown.test.tsx

frontend/src/pages/
  — __tests__/KnowledgeHomePage.test.tsx (extend existing)
```

### Frontend files to modify

```
frontend/src/pages/KnowledgeHomePage.tsx
  — add Tab: 文档浏览 / AI 问答 / 文件管理 / 回收站
  — wire KnowledgeChatPanel, KnowledgeFileBrowser

frontend/src/pages/KnowledgeHomePage.less
  — layout for new tabs

frontend/src/pages/ExtensionsSettingsPage.tsx
  — provider selector: OpenAI → DeepSeek
  — cred label update
  — add AI usage dashboard card
  — add knowledge index health card

frontend/src/modules/workbench/api/documents.ts
  — add uploadFiles, batchFiles, convertFileToDocument

frontend/src/router/routes.ts
  — no new top-level route needed

frontend/package.json
  — + react-markdown, remark-gfm, rehype-highlight
```

### Electron files to create

```
desktop/src/extensions/providers/deepseek.ts
desktop/src/extensions/__tests__/deepseek.test.ts
```

### Electron files to modify

```
desktop/src/extensions/contracts.ts
  — extensionProviders: + 'DEEPSEEK_CHAT'
desktop/src/extensions/provider-registry.ts
  — register DEEPSEEK_CHAT
desktop/src/extensions/providers/openai.ts
  — mark @deprecated
desktop/src/extension-run-broker.ts
  — + extension.stream event handling
```

---

## Task 1: Add pgvector extension and RAG data catalog

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_knowledge_rag/migration.sql`
- Create: `backend/test/integration/prisma/knowledge-rag-catalog.spec.ts`

- [ ] **Step 1: Write failing catalog test**

```ts
// backend/test/integration/prisma/knowledge-rag-catalog.spec.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');

describe('knowledge RAG Prisma catalog', () => {
  it('declares DocumentChunk, KnowledgeSession, KnowledgeMessage, and AiUsageLog contracts', () => {
    expect(schema).toMatch(/model DocumentChunk/);
    expect(schema).toMatch(/embedding\s+Unsupported/);
    expect(schema).toMatch(/model KnowledgeSession/);
    expect(schema).toMatch(/enum KnowledgeSessionStatus/);
    expect(schema).toMatch(/model KnowledgeMessage/);
    expect(schema).toMatch(/enum MessageRole/);
    expect(schema).toMatch(/model AiUsageLog/);
  });
});
```

- [ ] **Step 2: Run catalog test, verify failure**

```bash
cd backend
pnpm test:integration -- --runInBand test/integration/prisma/knowledge-rag-catalog.spec.ts
```

Expected: FAIL — models not defined.

- [ ] **Step 3: Add Prisma enums and models**

Add to `backend/prisma/schema.prisma` (place before the last closing block):

```prisma
enum KnowledgeSessionStatus {
  ACTIVE
  ARCHIVED
  @@schema("app")
}

enum MessageRole {
  USER
  ASSISTANT
  @@schema("app")
}

model DocumentChunk {
  id          String   @id @default(cuid())
  documentId  String   @map("document_id")
  chunkIndex  Int      @map("chunk_index")
  content     String
  tokenCount  Int      @default(0) @map("token_count")
  embedding   Unsupported("vector(1536)")
  metadata    Json     @default("{}")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  document    ContentDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@unique([documentId, chunkIndex])
  @@map("document_chunks")
  @@schema("app")
}

model KnowledgeSession {
  id        String                 @id @default(cuid())
  title     String
  status    KnowledgeSessionStatus @default(ACTIVE)
  createdAt DateTime               @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime               @updatedAt @map("updated_at") @db.Timestamptz(6)
  messages  KnowledgeMessage[]

  @@map("knowledge_sessions")
  @@schema("app")
}

model KnowledgeMessage {
  id         String           @id @default(cuid())
  sessionId  String           @map("session_id")
  role       MessageRole
  content    String
  citations  Json?
  tokenCount Int?             @map("token_count")
  createdAt  DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  session    KnowledgeSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId, createdAt])
  @@map("knowledge_messages")
  @@schema("app")
}

model AiUsageLog {
  id            String   @id @default(cuid())
  operation     String
  model         String
  tokenCount    Int      @map("token_count")
  estimatedCost Float?   @map("estimated_cost")
  documentId    String?  @map("document_id")
  sessionId     String?  @map("session_id")
  success       Boolean
  errorCode     String?  @map("error_code")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([createdAt])
  @@map("ai_usage_logs")
  @@schema("app")
}
```

Add to `ContentDocument` model:
```prisma
  chunks DocumentChunk[]
```

Add to `ResourceProfile` model (for usage log relation, optional):
```prisma
  aiUsageLogs AiUsageLog[]
```

- [ ] **Step 4: Write and apply SQL migration**

```sql
-- Create pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create document_chunks table
CREATE TABLE app.document_chunks (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_id TEXT NOT NULL REFERENCES app.content_documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content     TEXT NOT NULL,
  token_count INT NOT NULL DEFAULT 0,
  embedding   vector(1536),
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

-- Create knowledge_sessions table
CREATE TABLE app.knowledge_sessions (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Create knowledge_messages table
CREATE TABLE app.knowledge_messages (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_id  TEXT NOT NULL REFERENCES app.knowledge_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  citations   JSONB,
  token_count INT,
  created_at  TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX idx_knowledge_messages_session ON app.knowledge_messages(session_id, created_at);

-- Create ai_usage_logs table
CREATE TABLE app.ai_usage_logs (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  operation       TEXT NOT NULL,
  model           TEXT NOT NULL,
  token_count     INT NOT NULL,
  estimated_cost  DOUBLE PRECISION,
  document_id     TEXT,
  session_id      TEXT,
  success         BOOLEAN NOT NULL,
  error_code      TEXT,
  created_at      TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_usage_logs_created ON app.ai_usage_logs(created_at);

-- Create HNSW index for vector similarity search
CREATE INDEX idx_document_chunks_embedding ON app.document_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);
```

Run:
```bash
cd backend
pnpm prisma:generate
pnpm prisma migrate deploy
pnpm test:integration -- --runInBand test/integration/prisma/knowledge-rag-catalog.spec.ts
pnpm build
```

Expected: all pass, backend builds.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma backend/test/integration/prisma/knowledge-rag-catalog.spec.ts
git commit -m "feat: add pgvector extension and knowledge RAG data catalog"
```

---

## Task 2: Document chunking service

**Files:**
- Create: `backend/src/modules/workbench/knowledge/domain/chunking.ts`
- Create: `backend/src/modules/workbench/knowledge/application/chunking.service.ts`
- Create: `backend/src/modules/workbench/knowledge/domain/knowledge.types.ts`
- Create: `backend/test/unit/modules/workbench/chunking.service.spec.ts`

- [ ] **Step 1: Write failing chunking tests**

```ts
// backend/test/unit/modules/workbench/chunking.service.spec.ts
import { ChunkingService } from '../../../../src/modules/workbench/knowledge/application/chunking.service';

describe('ChunkingService', () => {
  const service = new ChunkingService();

  it('splits a document shorter than chunk size into one chunk', () => {
    const text = '这是一篇短文档。'.repeat(20); // ~140 chars, well under 512 tokens
    const chunks = service.chunk(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(text);
    expect(chunks[0].chunkIndex).toBe(0);
  });

  it('splits a long document at paragraph boundaries with overlap', () => {
    const paragraphs = Array.from({ length: 20 }, (_, i) =>
      `这是第${i + 1}段内容。`.repeat(60), // ~600 chars each, ~300 tokens total
    );
    const text = paragraphs.join('\n\n');
    const chunks = service.chunk(text);
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should have content
    chunks.forEach((chunk) => {
      expect(chunk.content.length).toBeGreaterThan(0);
      expect(chunk.tokenCount).toBeGreaterThan(0);
    });
    // Adjacent chunks should have overlap
    if (chunks.length > 1) {
      const lastWords = chunks[0].content.slice(-20);
      expect(chunks[1].content).toContain(lastWords);
    }
  });

  it('splits at heading boundaries when available', () => {
    const text = [
      '# 第一章',
      '内容A'.repeat(200),
      '## 第一节',
      '内容B'.repeat(200),
      '# 第二章',
      '内容C'.repeat(200),
    ].join('\n\n');
    const chunks = service.chunk(text);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    // Each chunk should carry heading metadata
    chunks.forEach((chunk) => {
      expect(chunk.metadata).toHaveProperty('headingPath');
    });
  });

  it('estimates token count for mixed Chinese/English text', () => {
    const text = '中文内容 '.repeat(100) + 'English text '.repeat(50);
    const chunks = service.chunk(text);
    const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);
    // Roughly 1 token per Chinese char, 1 per English word
    expect(totalTokens).toBeGreaterThan(200);
    expect(totalTokens).toBeLessThan(2000);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/chunking.service.spec.ts
```

Expected: FAIL — `ChunkingService` not defined.

- [ ] **Step 3: Implement types and chunking logic**

```ts
// backend/src/modules/workbench/knowledge/domain/knowledge.types.ts
export interface DocumentChunkInput {
  documentId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
}

export interface ChunkingOptions {
  chunkSize: number;      // tokens
  chunkOverlap: number;   // tokens
}

export const DEFAULT_CHUNKING: ChunkingOptions = {
  chunkSize: 512,
  chunkOverlap: 64,
};
```

```ts
// backend/src/modules/workbench/knowledge/domain/chunking.ts
export function estimateTokens(text: string): number {
  // Conservative estimate: Chinese ~1.5 chars/token, English ~4 chars/token
  const chineseChars = (text.match(/[一-鿿]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

export function splitByParagraphs(text: string): string[] {
  return text.split(/\n\n+/).filter((p) => p.trim().length > 0);
}
```

```ts
// backend/src/modules/workbench/knowledge/application/chunking.service.ts
import { Injectable } from '@nestjs/common';
import { estimateTokens, splitByParagraphs } from '../domain/chunking';
import { DEFAULT_CHUNKING, DocumentChunkInput } from '../domain/knowledge.types';

@Injectable()
export class ChunkingService {
  chunk(
    text: string,
    options = DEFAULT_CHUNKING,
    baseMetadata: Record<string, unknown> = {},
  ): Omit<DocumentChunkInput, 'documentId'>[] {
    const paragraphs = splitByParagraphs(text);
    const chunks: Omit<DocumentChunkInput, 'documentId'>[] = [];
    let currentChunk = '';
    let headingPath: string[] = [];
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      // Track heading hierarchy
      const headingMatch = paragraph.match(/^(#{1,6})\s+(.+)$/m);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const title = headingMatch[2].trim();
        headingPath = [...headingPath.slice(0, level - 1), title];
      }

      const joined = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;

      if (estimateTokens(joined) <= options.chunkSize) {
        currentChunk = joined;
      } else {
        // Flush current chunk
        if (currentChunk) {
          chunks.push({
            chunkIndex: chunkIndex++,
            content: currentChunk,
            tokenCount: estimateTokens(currentChunk),
            metadata: { ...baseMetadata, headingPath: [...headingPath] },
          });
        }

        // If a single paragraph exceeds chunk size, split by sentence
        if (estimateTokens(paragraph) > options.chunkSize) {
          const sentences = paragraph.split(/(?<=[。！？.!?])\s*/);
          let sentenceChunk = '';
          for (const sentence of sentences) {
            const candidate = sentenceChunk ? `${sentenceChunk}${sentence}` : sentence;
            if (estimateTokens(candidate) <= options.chunkSize) {
              sentenceChunk = candidate;
            } else {
              if (sentenceChunk) {
                chunks.push({
                  chunkIndex: chunkIndex++,
                  content: sentenceChunk,
                  tokenCount: estimateTokens(sentenceChunk),
                  metadata: { ...baseMetadata, headingPath: [...headingPath] },
                });
              }
              sentenceChunk = sentence;
            }
          }
          currentChunk = sentenceChunk || '';
        } else {
          currentChunk = paragraph;
        }
      }
    }

    // Flush last chunk
    if (currentChunk.trim()) {
      chunks.push({
        chunkIndex: chunkIndex++,
        content: currentChunk,
        tokenCount: estimateTokens(currentChunk),
        metadata: { ...baseMetadata, headingPath: [...headingPath] },
      });
    }

    // Apply overlap: prepend tail of previous chunk to each chunk
    if (options.chunkOverlap > 0 && chunks.length > 1) {
      for (let i = 1; i < chunks.length; i++) {
        const prev = chunks[i - 1].content;
        const overlapText = prev.slice(-Math.floor(options.chunkOverlap * 2)); // ~2 chars per token
        chunks[i].content = overlapText + '\n\n' + chunks[i].content;
        chunks[i].tokenCount = estimateTokens(chunks[i].content);
      }
    }

    return chunks;
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/chunking.service.spec.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/workbench/knowledge backend/test/unit/modules/workbench/chunking.service.spec.ts
git commit -m "feat: add document chunking service"
```

---

## Task 3: Embedding service with caching

**Files:**
- Create: `backend/src/modules/workbench/knowledge/domain/embedding-cache.ts`
- Create: `backend/src/modules/workbench/knowledge/application/embedding.service.ts`
- Create: `backend/test/unit/modules/workbench/embedding.service.spec.ts`

- [ ] **Step 1: Write failing embedding tests**

```ts
// backend/test/unit/modules/workbench/embedding.service.spec.ts
import { EmbeddingService } from '../../../../src/modules/workbench/knowledge/application/embedding.service';
import { EmbeddingCache } from '../../../../src/modules/workbench/knowledge/domain/embedding-cache';

describe('EmbeddingService', () => {
  const mockFetch = jest.fn();
  const cache = new EmbeddingCache();
  const service = new EmbeddingService(cache, 'fake-api-key');

  beforeEach(() => {
    mockFetch.mockReset();
    cache.clear();
    (service as any).fetchImpl = mockFetch;
  });

  it('returns cached embeddings for previously computed texts', async () => {
    const texts = ['hello world'];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ embedding: Array(1536).fill(0.1) }] }),
    });

    const first = await service.embed(texts);
    // Second call should hit cache, no fetch
    const second = await service.embed(texts);

    expect(first).toEqual(second);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('batches requests into groups of 20', async () => {
    const texts = Array.from({ length: 45 }, (_, i) => `text ${i}`);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: Array(20).fill({ embedding: Array(1536).fill(0.1) }) }),
    });

    await service.embed(texts);
    // 45 texts → ceil(45/20) = 3 API calls
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('retries on 429 with exponential backoff', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('429 Too Many Requests'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ embedding: Array(1536).fill(0.1) }] }),
      });

    const result = await service.embed(['text']);
    expect(result).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns null embeddings on persistent failure', async () => {
    mockFetch.mockRejectedValue(new Error('500 Internal Server Error'));

    const result = await service.embed(['text']);
    expect(result[0]).toBeNull(); // single null, not crash
  });

  it('caches embeddings by SHA-256 content hash', async () => {
    const text = 'unique content';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ embedding: Array(1536).fill(0.2) }] }),
    });

    await service.embed([text]);
    const result = await service.embed([text]);

    expect(result.length).toBe(1);
    expect(result[0]).not.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1); // cache hit
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/embedding.service.spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement embedding cache and service**

```ts
// backend/src/modules/workbench/knowledge/domain/embedding-cache.ts
import { createHash } from 'node:crypto';

export class EmbeddingCache {
  private store = new Map<string, number[]>();

  hash(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  get(text: string): number[] | undefined {
    return this.store.get(this.hash(text));
  }

  set(text: string, embedding: number[]): void {
    this.store.set(this.hash(text), embedding);
  }

  clear(): void {
    this.store.clear();
  }
}
```

```ts
// backend/src/modules/workbench/knowledge/application/embedding.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingCache } from '../domain/embedding-cache';

const BATCH_SIZE = 20;
const MAX_RETRIES = 3;
const EMBEDDING_DIM = 1536;

interface DeepSeekEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    private readonly cache: EmbeddingCache,
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.deepseek.com/v1',
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async embed(texts: string[]): Promise<(number[] | null)[]> {
    const results: (number[] | null)[] = new Array(texts.length);

    // Check cache first
    const uncached: Array<{ text: string; index: number }> = [];
    texts.forEach((text, i) => {
      const cached = this.cache.get(text);
      if (cached) {
        results[i] = cached;
      } else {
        uncached.push({ text, index: i });
      }
    });

    if (uncached.length === 0) return results;

    // Batch uncached texts
    for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
      const batch = uncached.slice(i, i + BATCH_SIZE);
      const batchTexts = batch.map((b) => b.text);

      try {
        const embeddings = await this.fetchEmbeddings(batchTexts);
        embeddings.forEach((emb, j) => {
          const { index, text } = batch[j];
          results[index] = emb;
          this.cache.set(text, emb);
        });
      } catch (error) {
        this.logger.error({ batchIndex: i, error }, 'Embedding batch failed');
        batch.forEach(({ index }) => {
          results[index] = null;
        });
      }
    }

    return results;
  }

  private async fetchEmbeddings(texts: string[]): Promise<number[][]> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await this.fetchImpl(`${this.baseUrl}/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({ model: 'deepseek-chat', input: texts }),
          signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            const wait = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt) * 1000;
            await new Promise((r) => setTimeout(r, wait));
            continue;
          }
          throw new Error(`DeepSeek Embeddings API returned ${response.status}`);
        }

        const body = (await response.json()) as DeepSeekEmbeddingResponse;
        return body.data
          .sort((a, b) => a.index - b.index)
          .map((d) => d.embedding.slice(0, EMBEDDING_DIM));
      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError;
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/embedding.service.spec.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/workbench/knowledge backend/test/unit/modules/workbench/embedding.service.spec.ts
git commit -m "feat: add embedding service with SHA-256 cache and retry"
```

---

## Task 4: DeepSeek HTTP provider and browser-direct mode

**Files:**
- Create: `backend/src/modules/workbench/knowledge/application/deepseek-http.service.ts`
- Create: `backend/test/unit/modules/workbench/deepseek-http.service.spec.ts`

- [ ] **Step 1: Write failing provider tests**

```ts
// backend/test/unit/modules/workbench/deepseek-http.service.spec.ts
import { DeepSeekHttpService } from '../../../../src/modules/workbench/knowledge/application/deepseek-http.service';
import { Readable } from 'node:stream';

describe('DeepSeekHttpService', () => {
  const mockFetch = jest.fn();
  const service = new DeepSeekHttpService('test-key', 'https://api.deepseek.com/v1');
  (service as any).fetchImpl = mockFetch;

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('streams chat completions as SSE chunks', async () => {
    const sseChunks = [
      'data: {"id":"1","choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"id":"1","choices":[{"delta":{"content":" World"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const readable = new Readable({
      read() {
        const chunk = sseChunks.shift();
        if (chunk) this.push(new TextEncoder().encode(chunk));
        else this.push(null);
      },
    });

    mockFetch.mockResolvedValueOnce({ ok: true, body: readable });

    const stream = await service.streamChat({
      messages: [{ role: 'user', content: 'test' }],
      systemPrompt: 'You are a test assistant.',
    });

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const tokens: string[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      tokens.push(text);
    }

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe('https://api.deepseek.com/v1/chat/completions');
    const body = JSON.parse(callArgs[1].body);
    expect(body.stream).toBe(true);
    expect(body.model).toBe('deepseek-chat');
  });

  it('throws DEEPSEEK_API_ERROR on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    await expect(
      service.streamChat({ messages: [{ role: 'user', content: 'test' }] }),
    ).rejects.toThrow('DeepSeek API returned 401');
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/deepseek-http.service.spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement HTTP provider**

```ts
// backend/src/modules/workbench/knowledge/application/deepseek-http.service.ts
import { Injectable } from '@nestjs/common';

interface ChatParams {
  messages: Array<{ role: string; content: string }>;
  systemPrompt?: string;
}

@Injectable()
export class DeepSeekHttpService {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.deepseek.com/v1',
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async streamChat(params: ChatParams): Promise<ReadableStream<Uint8Array>> {
    const messages: Array<{ role: string; content: string }> = [];
    if (params.systemPrompt) {
      messages.push({ role: 'system', content: params.systemPrompt });
    }
    messages.push(...params.messages);

    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API returned ${response.status}: ${response.statusText}`);
    }

    return response.body!;
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/deepseek-http.service.spec.ts
```

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/workbench/knowledge/application/deepseek-http.service.ts backend/test/unit/modules/workbench/deepseek-http.service.spec.ts
git commit -m "feat: add DeepSeek HTTP provider with SSE streaming"
```

---

## Task 5: RAG orchestration service

**Files:**
- Create: `backend/src/modules/workbench/knowledge/application/rag.service.ts`
- Create: `backend/test/unit/modules/workbench/rag.service.spec.ts`

- [ ] **Step 1: Write failing RAG tests**

```ts
// backend/test/unit/modules/workbench/rag.service.spec.ts
import { RagService } from '../../../../src/modules/workbench/knowledge/application/rag.service';

const mockPrisma = {
  $queryRaw: jest.fn(),
  documentChunk: { findMany: jest.fn() },
  aiUsageLog: { create: jest.fn() },
} as any;

const mockEmbedding = { embed: jest.fn() } as any;
const mockDeepseek = { streamChat: jest.fn() } as any;

const service = new RagService(mockPrisma, mockEmbedding, mockDeepseek);

describe('RagService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retrieves top chunks, assembles prompt, and returns stream', async () => {
    mockEmbedding.embed.mockResolvedValue([Array(1536).fill(0.1)]);
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: 'c1', document_id: 'doc1', chunk_index: 0, content: 'chunk 1 content', metadata: {}, similarity: 0.92 },
    ]);
    mockDeepseek.streamChat.mockResolvedValue(new ReadableStream());

    const stream = await service.ask({
      question: '什么是REST API？',
      history: [],
    });

    expect(mockEmbedding.embed).toHaveBeenCalledWith(['什么是REST API？']);
    expect(mockDeepseek.streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining('研发知识库助手'),
      }),
    );
    expect(stream).toBeDefined();
  });

  it('returns empty context when no chunks above similarity threshold', async () => {
    mockEmbedding.embed.mockResolvedValue([Array(1536).fill(0.1)]);
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const stream = await service.ask({
      question: '火星上有什么？',
      history: [],
    });

    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    expect(mockDeepseek.streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining('知识库中未找到相关信息'),
      }),
    );
  });

  it('respects context window token budget', async () => {
    mockEmbedding.embed.mockResolvedValue([Array(1536).fill(0.1)]);
    // Return many chunks that collectively exceed budget
    const manyChunks = Array.from({ length: 30 }, (_, i) => ({
      id: `c${i}`,
      document_id: `doc${i}`,
      chunk_index: 0,
      content: 'x'.repeat(500),
      metadata: {},
      similarity: 0.88,
    }));
    mockPrisma.$queryRaw.mockResolvedValue(manyChunks);

    await service.ask({ question: 'test', history: [] });

    // Should truncate chunks to fit ~3500 token budget
    const call = mockDeepseek.streamChat.mock.calls[0][0];
    const contextLength = call.messages[0].content.length;
    expect(contextLength).toBeLessThan(6000 * 4); // roughly 6000 tokens * 4 chars
  });

  it('includes conversation history in the prompt', async () => {
    mockEmbedding.embed.mockResolvedValue([Array(1536).fill(0.1)]);
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: 'c1', document_id: 'doc1', chunk_index: 0, content: 'content', metadata: {}, similarity: 0.9 },
    ]);
    mockDeepseek.streamChat.mockResolvedValue(new ReadableStream());

    await service.ask({
      question: '具体怎么实现？',
      history: [
        { role: 'USER', content: '什么是缓存？' },
        { role: 'ASSISTANT', content: '缓存是一种...' },
      ],
    });

    const call = mockDeepseek.streamChat.mock.calls[0][0];
    expect(call.messages).toEqual(
      expect.arrayContaining([
        { role: 'assistant', content: '缓存是一种...' },
        { role: 'user', content: '具体怎么实现？' },
      ]),
    );
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/rag.service.spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement RAG service**

```ts
// backend/src/modules/workbench/knowledge/application/rag.service.ts
import { Injectable } from '@nestjs/common';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { EmbeddingService } from './embedding.service';
import { DeepSeekHttpService } from './deepseek-http.service';

const SYSTEM_PROMPT = `你是一个本地研发知识库助手，服务于研发主管的日常决策。
你的知识来源是用户本机的文档、会议纪要、方案和复盘。

规则：
1. 只根据 <context></context> 中提供的内容回答
2. 如果上下文中没有足够信息，诚实说明"知识库中未找到相关信息"
3. 回答末尾列出引用的文档标题
4. 用中文回答，简洁专业
5. 不要编造内容，不要使用外部知识`;

const TOP_K = 20;
const SIMILARITY_THRESHOLD = 0.7;
const MAX_CONTEXT_TOKENS = 3500;
const MAX_HISTORY_TOKENS = 2000;

@Injectable()
export class RagService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly embedding: EmbeddingService,
    private readonly deepseek: DeepSeekHttpService,
  ) {}

  async ask(params: {
    question: string;
    history: Array<{ role: string; content: string }>;
  }): Promise<{ stream: ReadableStream<Uint8Array>; citations: ChunkCitation[] }> {
    // 1. Embed the question
    const [questionEmbedding] = await this.embedding.embed([params.question]);
    if (!questionEmbedding) {
      throw new Error('Failed to embed question');
    }

    // 2. Vector search
    const chunks = await this.prisma.$queryRaw<ChunkRow[]>`
      SELECT dc.id, dc.document_id, dc.chunk_index, dc.content, dc.metadata,
             cd.title as document_title,
             1 - (dc.embedding <=> ${questionEmbedding}::vector) AS similarity
      FROM app.document_chunks dc
      JOIN app.content_documents cd ON cd.id = dc.document_id
      WHERE dc.embedding IS NOT NULL
        AND cd.status = 'ACTIVE'
        AND cd.trashed_at IS NULL
      ORDER BY dc.embedding <=> ${questionEmbedding}::vector
      LIMIT ${TOP_K}
    `;

    const relevant = (chunks as ChunkRow[]).filter(
      (c) => c.similarity >= SIMILARITY_THRESHOLD,
    );

    // 3. Build context from chunks
    const citations: ChunkCitation[] = [];
    let contextUsed = 0;
    const contextParts: string[] = [];

    for (const chunk of relevant) {
      const chunkTokens = Math.ceil(chunk.content.length / 2); // rough estimate
      if (contextUsed + chunkTokens > MAX_CONTEXT_TOKENS) break;
      contextParts.push(`[来源: ${chunk.document_title}]\n${chunk.content}`);
      citations.push({
        documentId: chunk.document_id,
        title: chunk.document_title,
        chunkIndex: chunk.chunk_index,
        text: chunk.content.slice(0, 200),
      });
      contextUsed += chunkTokens;
    }

    // 4. Build messages
    const systemPrompt = contextParts.length > 0
      ? `${SYSTEM_PROMPT}\n\n<context>\n${contextParts.join('\n---\n')}\n</context>`
      : `${SYSTEM_PROMPT}\n\n知识库中未找到与该问题相关的信息。请如实告知用户。`;

    const historyMessages = this.truncateHistory(params.history, MAX_HISTORY_TOKENS);
    const messages = [
      ...historyMessages.map((m) => ({
        role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
        content: m.content,
      })),
      { role: 'user' as const, content: params.question },
    ];

    // 5. Stream from DeepSeek
    const stream = await this.deepseek.streamChat({ messages, systemPrompt });

    return { stream, citations };
  }

  private truncateHistory(
    history: Array<{ role: string; content: string }>,
    maxTokens: number,
  ) {
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

interface ChunkRow {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  document_title: string;
  similarity: number;
}

interface ChunkCitation {
  documentId: string;
  title: string;
  chunkIndex: number;
  text: string;
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/rag.service.spec.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/workbench/knowledge/application/rag.service.ts backend/test/unit/modules/workbench/rag.service.spec.ts
git commit -m "feat: add RAG orchestration service with vector search and streaming"
```

---

## Task 6: Session and message service

**Files:**
- Create: `backend/src/modules/workbench/knowledge/application/session.service.ts`
- Create: `backend/test/unit/modules/workbench/session.service.spec.ts`

- [ ] **Step 1: Write failing session tests**

```ts
// backend/test/unit/modules/workbench/session.service.spec.ts
import { SessionService } from '../../../../src/modules/workbench/knowledge/application/session.service';

const mockPrisma = {
  knowledgeSession: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  knowledgeMessage: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
} as any;

const service = new SessionService(mockPrisma);

describe('SessionService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a session with auto-generated title from first question', async () => {
    mockPrisma.knowledgeSession.create.mockResolvedValue({
      id: 's1',
      title: '什么是REST API？',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const session = await service.create('什么是REST API？以及如何设计？这是一段很长的...');
    expect(session.title).toBe('什么是REST API？以及如何设计');
    expect(session.title.length).toBeLessThanOrEqual(30);
  });

  it('lists sessions ordered by updatedAt desc', async () => {
    mockPrisma.knowledgeSession.findMany.mockResolvedValue([
      { id: 's2', title: 'Recent', status: 'ACTIVE' },
      { id: 's1', title: 'Old', status: 'ACTIVE' },
    ]);

    const sessions = await service.list();
    expect(sessions).toHaveLength(2);
    expect(mockPrisma.knowledgeSession.findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, status: true, createdAt: true, updatedAt: true },
    });
  });

  it('adds a message to a session', async () => {
    mockPrisma.knowledgeMessage.create.mockResolvedValue({
      id: 'm1',
      sessionId: 's1',
      role: 'USER',
      content: 'hello',
      citations: null,
      tokenCount: null,
      createdAt: new Date(),
    });

    const msg = await service.addMessage('s1', {
      role: 'USER',
      content: 'hello',
    });

    expect(msg.role).toBe('USER');
    expect(mockPrisma.knowledgeMessage.create).toHaveBeenCalled();
  });

  it('archives a session', async () => {
    mockPrisma.knowledgeSession.update.mockResolvedValue({
      id: 's1',
      status: 'ARCHIVED',
      title: 'test',
    });

    const result = await service.archive('s1');
    expect(result.status).toBe('ARCHIVED');
  });

  it('returns messages with history for context', async () => {
    mockPrisma.knowledgeMessage.findMany.mockResolvedValue([
      { id: 'm1', role: 'USER', content: 'q1', citations: null, tokenCount: 10, createdAt: new Date() },
      { id: 'm2', role: 'ASSISTANT', content: 'a1', citations: [], tokenCount: 50, createdAt: new Date() },
    ]);

    const history = await service.getHistory('s1');
    expect(history).toHaveLength(2);
    expect(history[0].role).toBe('USER');
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/session.service.spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement session service**

```ts
// backend/src/modules/workbench/knowledge/application/session.service.ts
import { Injectable } from '@nestjs/common';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  async create(firstQuestion: string) {
    const title = firstQuestion.replace(/\s+/g, '').slice(0, 30);
    return this.prisma.knowledgeSession.create({
      data: { title },
    });
  }

  async list() {
    return this.prisma.knowledgeSession.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async get(id: string) {
    return this.prisma.knowledgeSession.findUnique({
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
            createdAt: true,
          },
        },
      },
    });
  }

  async addMessage(
    sessionId: string,
    data: {
      role: 'USER' | 'ASSISTANT';
      content: string;
      citations?: Record<string, unknown>[];
      tokenCount?: number;
    },
  ) {
    // Touch session updatedAt
    await this.prisma.knowledgeSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });

    return this.prisma.knowledgeMessage.create({
      data: {
        sessionId,
        role: data.role,
        content: data.content,
        citations: data.citations as any,
        tokenCount: data.tokenCount,
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
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/session.service.spec.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/workbench/knowledge/application/session.service.ts backend/test/unit/modules/workbench/session.service.spec.ts
git commit -m "feat: add knowledge session and message service"
```

---

## Task 7: Knowledge controller with SSE streaming endpoint

**Files:**
- Create: `backend/src/modules/workbench/knowledge/interface/http/dto/knowledge.dto.ts`
- Create: `backend/src/modules/workbench/knowledge/interface/http/knowledge.controller.ts`
- Create: `backend/src/modules/workbench/knowledge/knowledge.module.ts`
- Create: `backend/src/modules/workbench/knowledge/knowledge.gateway.ts`
- Modify: `backend/src/modules/workbench/workbench.module.ts`
- Create: `backend/test/integration/modules/workbench/knowledge.controller.spec.ts`

- [ ] **Step 1: Write failing integration test**

```ts
// backend/test/integration/modules/workbench/knowledge.controller.spec.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

describe('Knowledge API', () => {
  const prefix = `TEST-KNOWLEDGE-${Date.now()}`;
  const prisma = new PrismaClient();
  let app: INestApplication;

  beforeAll(async () => {
    const { AppModule } = await import('../../../../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await prisma.knowledgeMessage.deleteMany({ where: { session: { title: { startsWith: prefix } } } });
    await prisma.knowledgeSession.deleteMany({ where: { title: { startsWith: prefix } } });
    await prisma.$disconnect();
    await app?.close();
  });

  it('creates a session, sends a message, and gets session history', async () => {
    const session = await request(app.getHttpServer())
      .post('/api/knowledge/sessions')
      .send({ question: `${prefix} test question` })
      .expect(201);

    expect(session.body.data.title).toBe(`${prefix} test question`);
    const sessionId = session.body.data.id;

    const list = await request(app.getHttpServer())
      .get('/api/knowledge/sessions')
      .expect(200);

    expect(list.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: sessionId })]),
    );

    const detail = await request(app.getHttpServer())
      .get(`/api/knowledge/sessions/${sessionId}`)
      .expect(200);

    expect(detail.body.data.messages).toEqual([]);

    await request(app.getHttpServer())
      .patch(`/api/knowledge/sessions/${sessionId}`)
      .send({ status: 'ARCHIVED' })
      .expect(200);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
cd backend
pnpm test:integration -- --runInBand test/integration/modules/workbench/knowledge.controller.spec.ts
```

Expected: FAIL — module/controller not registered.

- [ ] **Step 3: Implement DTOs, controller, and module**

```ts
// backend/src/modules/workbench/knowledge/interface/http/dto/knowledge.dto.ts
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsEnum, IsNotEmpty } from 'class-validator';
import { KnowledgeSessionStatus } from '@prisma/client';

export class CreateSessionDto {
  @Transform(({ value }) => (typeof value === 'string' ? value : ''))
  @IsString()
  @IsNotEmpty()
  question!: string;
}

export class ChatMessageDto {
  @Transform(({ value }) => (typeof value === 'string' ? value : ''))
  @IsString()
  @IsNotEmpty()
  question!: string;
}

export class UpdateSessionDto {
  @IsOptional()
  @IsEnum(KnowledgeSessionStatus)
  status?: KnowledgeSessionStatus;
}
```

```ts
// backend/src/modules/workbench/knowledge/interface/http/knowledge.controller.ts
import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, Query, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { SessionService } from '../../application/session.service';
import { RagService } from '../../application/rag.service';
import { CreateSessionDto, ChatMessageDto, UpdateSessionDto } from './dto/knowledge.dto';

@Controller('knowledge')
export class KnowledgeController {
  constructor(
    private readonly sessions: SessionService,
    private readonly rag: RagService,
  ) {}

  @Post('sessions')
  async createSession(@Body() dto: CreateSessionDto) {
    return this.sessions.create(dto.question);
  }

  @Get('sessions')
  async listSessions() {
    return this.sessions.list();
  }

  @Get('sessions/:id')
  async getSession(@Param('id') id: string) {
    return this.sessions.get(id);
  }

  @Patch('sessions/:id')
  async updateSession(@Param('id') id: string, @Body() dto: UpdateSessionDto) {
    return this.sessions.archive(id);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSession(@Param('id') id: string) {
    await this.sessions.archive(id);
  }

  @Post('chat/:sessionId/messages')
  async chat(
    @Param('sessionId') sessionId: string,
    @Body() dto: ChatMessageDto,
    @Res() res: Response,
  ) {
    // Save user message
    await this.sessions.addMessage(sessionId, { role: 'USER', content: dto.question });

    // Get history
    const history = await this.sessions.getHistory(sessionId);

    // Run RAG
    const { stream, citations } = await this.rag.ask({
      question: dto.question,
      history: history.slice(0, -1), // exclude the just-saved user message
    });

    // Stream SSE response
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        buffer += text;

        // Parse SSE lines from DeepSeek
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                res.write(`event: token\ndata: ${JSON.stringify({ content, index: fullContent.length })}\n\n`);
              }
            } catch {
              // Skip unparseable chunks
            }
          }
        }
      }
    } finally {
      // Send citations
      res.write(`event: citations\ndata: ${JSON.stringify(citations)}\n\n`);
      res.write(`event: done\ndata: ${JSON.stringify({ finished: true })}\n\n`);
      res.end();

      // Save assistant message
      await this.sessions.addMessage(sessionId, {
        role: 'ASSISTANT',
        content: fullContent,
        citations,
        tokenCount: Math.ceil(fullContent.length / 2),
      });
    }
  }
}
```

```ts
// backend/src/modules/workbench/knowledge/knowledge.module.ts
import { Module } from '@nestjs/common';
import { ChunkingService } from './application/chunking.service';
import { EmbeddingService } from './application/embedding.service';
import { DeepSeekHttpService } from './application/deepseek-http.service';
import { RagService } from './application/rag.service';
import { SessionService } from './application/session.service';
import { KnowledgeController } from './interface/http/knowledge.controller';
import { EmbeddingCache } from './domain/embedding-cache';

@Module({
  controllers: [KnowledgeController],
  providers: [
    ChunkingService,
    {
      provide: EmbeddingCache,
      useClass: EmbeddingCache,
    },
    {
      provide: EmbeddingService,
      useFactory: (cache: EmbeddingCache) => {
        const apiKey = process.env.DEEPSEEK_API_KEY || '';
        return new EmbeddingService(cache, apiKey);
      },
      inject: [EmbeddingCache],
    },
    {
      provide: DeepSeekHttpService,
      useFactory: () => {
        const apiKey = process.env.DEEPSEEK_API_KEY || '';
        return new DeepSeekHttpService(apiKey);
      },
    },
    RagService,
    SessionService,
  ],
  exports: [
    ChunkingService,
    EmbeddingService,
    RagService,
    SessionService,
  ],
})
export class KnowledgeModule {}
```

Register in `workbench.module.ts`:
```ts
import { KnowledgeModule } from './knowledge/knowledge.module';

@Module({
  imports: [
    // ... existing imports
    KnowledgeModule,
  ],
})
export class WorkbenchModule {}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd backend
pnpm test:integration -- --runInBand test/integration/modules/workbench/knowledge.controller.spec.ts
pnpm build
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/workbench/knowledge backend/src/modules/workbench/workbench.module.ts backend/test/integration/modules/workbench/knowledge.controller.spec.ts
git commit -m "feat: add knowledge controller with SSE streaming chat endpoint"
```

---

## Task 8: Indexing service + document indexing trigger

**Files:**
- Create: `backend/src/modules/workbench/knowledge/application/indexing.service.ts`
- Create: `backend/test/unit/modules/workbench/indexing.service.spec.ts`
- Modify: `backend/src/modules/workbench/content/application/documents.service.ts`
- Modify: `backend/src/modules/workbench/content/content.module.ts`

- [ ] **Step 1: Write failing indexing tests**

```ts
// backend/test/unit/modules/workbench/indexing.service.spec.ts
import { IndexingService } from '../../../../src/modules/workbench/knowledge/application/indexing.service';

const mockPrisma = {
  documentChunk: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
    count: jest.fn(),
  },
  contentDocument: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
} as any;

const mockChunking = { chunk: jest.fn() } as any;
const mockEmbedding = { embed: jest.fn() } as any;

const service = new IndexingService(mockPrisma, mockChunking, mockEmbedding);

describe('IndexingService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('indexes one document: chunk → embed → write', async () => {
    mockChunking.chunk.mockReturnValue([
      { chunkIndex: 0, content: 'chunk 1', tokenCount: 10, metadata: {} },
      { chunkIndex: 1, content: 'chunk 2', tokenCount: 10, metadata: {} },
    ]);
    mockEmbedding.embed.mockResolvedValue([
      Array(1536).fill(0.1),
      Array(1536).fill(0.2),
    ]);
    mockPrisma.documentChunk.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.documentChunk.createMany.mockResolvedValue({ count: 2 });

    await service.indexDocument('doc1', 'full text');

    expect(mockChunking.chunk).toHaveBeenCalledWith('full text');
    expect(mockEmbedding.embed).toHaveBeenCalledWith(['chunk 1', 'chunk 2']);
    expect(mockPrisma.documentChunk.deleteMany).toHaveBeenCalledWith({
      where: { documentId: 'doc1' },
    });
    expect(mockPrisma.documentChunk.createMany).toHaveBeenCalled();
  });

  it('handles embedding failure gracefully — stores chunk without embedding', async () => {
    mockChunking.chunk.mockReturnValue([
      { chunkIndex: 0, content: 'chunk 1', tokenCount: 10, metadata: {} },
    ]);
    mockEmbedding.embed.mockResolvedValue([null]); // embedding failed

    await service.indexDocument('doc1', 'text');

    const call = mockPrisma.documentChunk.createMany.mock.calls[0][0];
    expect(call.data[0].embedding).toBeUndefined(); // no embedding stored
  });

  it('reports indexing progress', async () => {
    mockPrisma.documentChunk.count.mockResolvedValue(150);
    mockPrisma.contentDocument.count.mockResolvedValue(152);

    const status = await service.getStatus();
    expect(status).toEqual({
      indexedDocuments: 150,
      totalDocuments: 152,
      missingEmbeddingChunks: 0,
      complete: false,
    });
  });
});
```

- [ ] **Step 2: Run, verify failure** then implement and pass

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/indexing.service.spec.ts
```

Expected: FAIL → implement → PASS.

Implementation key points:
- `indexDocument(id, plainText)` → chunk → embed → `deleteMany` old chunks → `createMany` new chunks
- `indexAll()` → batch iterate ACTIVE documents → `indexDocument` per batch of 10
- `getStatus()` → query counts
- Embedding failure: chunk stored without embedding (text available for keyword fallback)

- [ ] **Step 3: Integrate with DocumentsService**

In `documents.service.ts`, after `create` and `update` transactions:

```ts
// After successful document create/update
if (document.plainText) {
  this.indexing.schedule(document.id).catch((error) => {
    this.logger.error({ documentId: document.id, error }, 'Post-save indexing failed');
  });
}
```

In `content.module.ts`, import `KnowledgeModule`.

- [ ] **Step 4: Run tests and commit**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/indexing.service.spec.ts
pnpm build
git add backend/src/modules/workbench/knowledge/application/indexing.service.ts backend/test/unit/modules/workbench/indexing.service.spec.ts backend/src/modules/workbench/content
git commit -m "feat: add indexing service with document auto-indexing trigger"
```

---

## Task 9: DeepSeek migration — Extensions

**Files:**
- Modify: `backend/src/modules/workbench/extensions/application/extensions.service.ts`
- Modify: `backend/src/modules/workbench/extensions/domain/contracts.ts` (if exists, else inline)
- Modify: `backend/src/modules/workbench/extensions/application/ai-context.service.ts`
- Modify: `backend/src/modules/workbench/shared/errors/error-codes.ts`

- [ ] **Step 1: Update extensions.service.ts**

Change `OPENAI_RESPONSES` references to `DEEPSEEK_CHAT`:

```ts
// Before:
AI: ['LOCAL_MANUAL', 'OPENAI_RESPONSES'],
OPENAI_RESPONSES: ['TEST_CONNECTION', 'AI_SUMMARIZE_MEETING', 'AI_SUMMARIZE_DOCUMENT', 'AI_KNOWLEDGE_QA'],

// After:
AI: ['LOCAL_MANUAL', 'DEEPSEEK_CHAT'],
DEEPSEEK_CHAT: ['TEST_CONNECTION', 'AI_SUMMARIZE_MEETING', 'AI_SUMMARIZE_DOCUMENT', 'AI_KNOWLEDGE_QA'],
```

Update zod schema labels.

- [ ] **Step 2: Wire browser-direct provider routing**

In `ai-context.service.ts`, detect Electron availability:

```ts
constructor(
  private readonly prisma: PlatformPrismaService,
  private readonly extensions: ExtensionsService,
  private readonly rag: RagService, // NEW: injected for direct mode
  private readonly gateway: ExtensionsGateway, // NEW: check connection
) {}

async prepare(profileId: string, dto: PrepareAiDto) {
  if (dto.operation === 'AI_KNOWLEDGE_QA') {
    // RAG path: always use local embedding + vector search
    return this.prepareRag(dto);
  }
  // Summarization: Electron bridge or direct HTTP
  if (this.gateway.hasActiveConnection()) {
    return this.extensions.prepareRun(profileId, { operation: dto.operation, payload: context.payload });
  }
  return this.prepareDirect(dto);
}
```

- [ ] **Step 3: Run focused tests and commit**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/extensions.service.spec.ts test/unit/modules/workbench/ai-context.service.spec.ts
pnpm build
git add backend/src/modules/workbench/extensions
git commit -m "feat: migrate AI provider to DeepSeek with browser-direct fallback"
```

---

## Task 10: Electron deepseek provider + streaming bridge

**Files:**
- Create: `desktop/src/extensions/providers/deepseek.ts`
- Create: `desktop/src/extensions/__tests__/deepseek.test.ts`
- Modify: `desktop/src/extensions/contracts.ts`
- Modify: `desktop/src/extensions/provider-registry.ts`
- Modify: `desktop/src/extension-run-broker.ts`
- Modify: `desktop/src/extensions/providers/openai.ts`

This task adds the Electron-side DeepSeek provider and streaming bridge. Key changes:

- `contracts.ts`: add `'DEEPSEEK_CHAT'` to `extensionProviders`
- `provider-registry.ts`: register new provider
- `deepseek.ts`: implement `execute` (for one-shot) and `executeStream` (for streaming) — calls `https://api.deepseek.com/v1/chat/completions` with `stream: true`, yields SSE chunks via callback
- `extension-run-broker.ts`: handle `extension.stream` event — call `executeStream` on the registered provider, relay each token chunk back to backend via WebSocket as `extension.token` event
- `openai.ts`: add comment `/** @deprecated Use DEEPSEEK_CHAT instead */`

Commit message: `feat: add DeepSeek Electron provider with streaming bridge`

---

## Task 11: Frontend knowledge chat — types, API, query keys

**Files:**
- Create: `frontend/src/modules/knowledge/types.ts`
- Create: `frontend/src/modules/knowledge/api.ts`
- Create: `frontend/src/modules/knowledge/queryKeys.ts`
- Create: `frontend/src/modules/knowledge/format.ts`
- Create: `frontend/src/modules/knowledge/__tests__/api.test.ts`

- [ ] **Step 1: Define types and API**

```ts
// frontend/src/modules/knowledge/types.ts
export interface KnowledgeSession {
  id: string;
  title: string;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  messages?: KnowledgeMessage[];
}

export interface KnowledgeMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  citations?: ChunkCitation[];
  tokenCount?: number;
  createdAt: string;
}

export interface ChunkCitation {
  documentId: string;
  title: string;
  chunkIndex: number;
  text: string;
}

export interface IndexStatus {
  indexedDocuments: number;
  totalDocuments: number;
  missingEmbeddingChunks: number;
  lastIndexedAt?: string;
  complete: boolean;
}

export interface AiUsageStats {
  today: { tokens: number; cost: number };
  week: { tokens: number; cost: number };
  month: { tokens: number; cost: number };
  total: { tokens: number; cost: number };
}
```

```ts
// frontend/src/modules/knowledge/api.ts
import { request, apiUrl } from '@/lib/http';
import type { KnowledgeSession, IndexStatus, AiUsageStats } from './types';

export function listSessions() {
  return request<KnowledgeSession[]>('/knowledge/sessions');
}

export function createSession(question: string) {
  return request<KnowledgeSession>('/knowledge/sessions', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

export function getSession(id: string) {
  return request<KnowledgeSession>(`/knowledge/sessions/${encodeURIComponent(id)}`);
}

export function archiveSession(id: string) {
  return request<void>(`/knowledge/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function chatStream(
  sessionId: string,
  question: string,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(apiUrl(`/knowledge/chat/${sessionId}/messages`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
    signal,
  });
}

export function getIndexStatus() {
  return request<IndexStatus>('/knowledge/reindex/status');
}

export function triggerReindex() {
  return request<{ jobId: string }>('/knowledge/reindex', { method: 'POST' });
}

export function getAiUsage() {
  return request<AiUsageStats>('/knowledge/usage');
}
```

- [ ] **Step 2: Run tests, commit**

```bash
cd frontend
pnpm test -- src/modules/knowledge/__tests__/api.test.ts
pnpm typecheck
git add frontend/src/modules/knowledge
git commit -m "feat: add knowledge chat frontend types, API, and query keys"
```

---

## Task 12: Knowledge chat UI components

**Files:**
- Create: `frontend/src/modules/knowledge/components/KnowledgeSessionList.tsx`
- Create: `frontend/src/modules/knowledge/components/KnowledgeChatPanel.tsx`
- Create: `frontend/src/modules/knowledge/components/KnowledgeMessageBubble.tsx`
- Create: `frontend/src/modules/knowledge/components/KnowledgeChatInput.tsx`
- Create: `frontend/src/modules/knowledge/components/KnowledgeMarkdown.tsx`
- Create: `frontend/src/modules/knowledge/components/KnowledgeCitationCard.tsx`
- Create: `frontend/src/modules/knowledge/__tests__/KnowledgeChatPanel.test.tsx`
- Create: `frontend/src/modules/knowledge/__tests__/KnowledgeSessionList.test.tsx`

Implement all 6 components with full test coverage. Key design:

- **KnowledgeSessionList**: Semi `List` with search, "新建对话" button, active session highlight, archive action
- **KnowledgeChatPanel**: main chat area — maps messages to bubbles, scrolls to bottom on new message, shows streaming content
- **KnowledgeMessageBubble**: renders user messages as right-aligned Semi `Card`, AI messages as left-aligned with `KnowledgeMarkdown` + `KnowledgeCitationCard`
- **KnowledgeChatInput**: Semi `TextArea` + Send/Stop buttons. Disabled during streaming. Stop aborts fetch
- **KnowledgeMarkdown**: wraps `react-markdown` + `remark-gfm` + `rehype-highlight`, custom `a`/`img`/`code` components
- **KnowledgeCitationCard**: Semi `Tag` group, each tag links to document, greyed out if deleted

SSE streaming hook:
```ts
// useKnowledgeChat hook (inline in KnowledgeChatPanel)
const [streamingContent, setStreamingContent] = useState('');
const abortRef = useRef<AbortController | null>(null);

async function send(question: string) {
  abortRef.current = new AbortController();
  const response = await chatStream(sessionId, question, abortRef.current.signal);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let content = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Parse SSE events...
    // On 'token': content += data.content; setStreamingContent(content);
    // On 'citations': citations = data; re-render
    // On 'done': finalize, invalidate session query
  }
}
```

Commit message: `feat: add knowledge chat UI with SSE streaming`

---

## Task 13: Knowledge file browser components

**Files:**
- Create: `frontend/src/modules/knowledge/components/KnowledgeFileBrowser.tsx`
- Create: `frontend/src/modules/knowledge/components/KnowledgeFileDetail.tsx`
- Create: `frontend/src/modules/knowledge/components/KnowledgeFileUploadModal.tsx`
- Create: `frontend/src/modules/knowledge/__tests__/KnowledgeFileBrowser.test.tsx`

Implement file browser with:
- Three-column layout (space tree + file table + detail panel)
- File table: Semi `Table` with columns (name/type/size/version/date/actions)
- Upload modal: drag-drop zone + file list + space selector + progress
- Detail panel: metadata + download/rename/delete/convert-to-document actions
- Batch operations: checkbox select → batch trash/move
- Recycle bin tab: list trashed files + restore/permanent-delete

Commit message: `feat: add knowledge file browser with full CRUD`

---

## Task 14: KnowledgeHomePage integration + settings page

**Files:**
- Modify: `frontend/src/pages/KnowledgeHomePage.tsx`
- Modify: `frontend/src/pages/KnowledgeHomePage.less`
- Modify: `frontend/src/pages/ExtensionsSettingsPage.tsx`
- Create: `frontend/src/modules/knowledge/components/KnowledgeIndexStatus.tsx`

Integrate everything:
- KnowledgeHomePage: add Semi `Tabs` — `文档浏览` | `AI 问答` | `文件管理` | `回收站`
- AI 问答 Tab: `KnowledgeSessionList` (left 280px) + `KnowledgeChatPanel` (right flex)
- 文件管理 Tab: `KnowledgeFileBrowser`
- 回收站 Tab: reuse FileBrowser with `trash` filter
- ExtensionsSettingsPage: rename OpenAI→DeepSeek, add AI usage dashboard card, add knowledge index health card (`KnowledgeIndexStatus`)

Commit message: `feat: integrate knowledge chat, file browser, and settings dashboard`

---

## Task 15: File download endpoint + backend file operations

**Files:**
- Modify: `backend/src/modules/workbench/content/application/files.service.ts`
- Create/modify: `backend/src/modules/workbench/content/interface/http/files.controller.ts`
- Modify: `backend/src/shared/errors/error-codes.ts`

Add missing endpoints:
- `GET /api/files/:id/download` — stream file with Content-Disposition
- `POST /api/files/batch` — `{ ids: string[], action: 'trash' | 'move', spaceId?: string }`
- `DELETE /api/files/:id/permanent` — permanent delete with storage cleanup

Commit message: `feat: add file download, batch operations, and permanent delete endpoints`

---

## Task 16: Document import (upload → convert → index)

**Files:**
- Create: `backend/src/modules/workbench/knowledge/application/document-import.service.ts`
- Create: `backend/src/modules/workbench/knowledge/interface/http/knowledge-import.controller.ts`
- Create: `backend/test/unit/modules/workbench/document-import.service.spec.ts`

Implement file-to-document conversion:
- `POST /api/knowledge/documents/upload` — multipart upload → detect type → extract text → create ContentDocument → trigger index
- TXT/MD: direct read → auto-convert
- DOCX: mammoth extract
- PDF: pdf-parse extract
- Return `{ documentId, title, plainTextPreview, wordCount, fileAssetId }`

Add `mammoth` and `pdf-parse` to backend `package.json`.

Commit message: `feat: add document import from uploaded files with text extraction`

---

## Task 17: Usage tracking + concurrency + markdown rendering

**Files:**
- Modify: backend RAG/embedding services to log to AiUsageLog
- Modify: frontend chat panel for stop-during-generation
- Finalize: KnowledgeMarkdown with copy button + syntax highlight CSS

- AiUsageLog: write after each API call (embedding batch, chat completion, summarization)
- Concurrency: `abortRef.current?.abort()` on stop, disable input during streaming, different sessions independent
- Markdown CSS: Semi-consistent typography, GitHub light theme for code blocks

Commit message: `feat: add usage tracking, concurrency control, and markdown rendering`

---

## Task 18: Full backend and frontend verification

**Files:**
- Run: backend `pnpm lint && pnpm test:unit && pnpm test:integration && pnpm build`
- Run: frontend `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- Run: `git diff --check`
- Fix any failures. Commit any final tweaks.

Commit message: `chore: final verification and cleanup for knowledge RAG upgrade`

---

## Task 19: End-to-end test

**Files:**
- Create: `frontend/e2e/knowledge-rag.spec.ts`

Thirteen-step E2E scenario:
1. Configure DeepSeek API key in settings
2. Upload a DOCX file → verify it becomes a document
3. Verify the document is indexed (status shows indexed)
4. Open AI 问答 tab
5. Create a new session
6. Ask a question about the uploaded document content
7. Verify streaming response appears character by character
8. Verify citations link to the uploaded document
9. Ask a follow-up question — verify history is preserved
10. Stop a mid-generation response
11. Upload a second document, verify it's indexed
12. Ask a question that spans both documents
13. Check AI usage stats updated

Commit message: `test: add knowledge RAG end-to-end acceptance test`

---

## Final Acceptance Checklist

- [ ] pgvector extension installed and HNSW index active
- [ ] Documents auto-indexed on create/update
- [ ] Vector search returns semantically relevant results (not just keyword match)
- [ ] Streaming SSE responses render token-by-token in UI
- [ ] Multi-turn conversation history preserved
- [ ] Citations link to correct documents
- [ ] Deleted/archived document citations show "已删除"/"已归档"
- [ ] AI 摘要功能切到 DeepSeek 后仍正常工作
- [ ] 浏览器直接模式可用（无 Electron 时）
- [ ] Electron 安全桥模式可用
- [ ] 文件浏览器可上传、下载、重命名、移动、删除、批量操作
- [ ] 文件转文档后可被 AI 问答检索
- [ ] AI 用量仪表盘数据正确
- [ ] 并发控制正常（单会话防重、多会话可并行）
- [ ] Markdown 渲染安全（无 XSS、无外部资源加载）
- [ ] 后端 lint/unit/integration/build 全绿
- [ ] 前端 lint/typecheck/test/build/e2e 全绿
