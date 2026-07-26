# 知识库 RAG 全面升级 + DeepSeek 全量迁移 设计规格

**日期：** 2026-07-26  
**版本：** v3.0（补全错误降级、初始索引、健康监控、流式摘要、协议改造、浏览器直接模式）  
**状态：** 待用户审阅  
**依赖：** 现有知识库(content)、AI 扩展(extensions)、搜索(search)、Electron 凭据桥(desktop)

---

## 1. 目标与范围

### 1.1 当前状态

| 能力 | 当前实现 | 差距 |
|------|---------|------|
| 知识检索 | PostgreSQL `contains` / `ilike` 关键词匹配 | 无语义理解，同义词/近义表达搜不到 |
| AI 问答 | 关键词匹配 8 篇文档 → 原文切片拼接 → OpenAI 一次性返回 | 无 chunking、无向量召回、无对话历史、无流式 |
| AI 摘要 | 文档/会议全文 → OpenAI 一次性返回 | 同上，非流式 |
| 对话体验 | 不存在 | 每次问答独立，需重复输入上下文 |
| AI Provider | `OPENAI_RESPONSES`，凭据由 Electron safeStorage 保管 | 仅支持 OpenAI |

### 1.2 目标架构

```
知识库文档 ──→ 智能分块(chunking) ──→ DeepSeek Embeddings ──→ pgvector 向量库
                                                                      ↓
用户提问 ──→ DeepSeek Embeddings ──→ 向量相似搜索(余弦/HNSW) ──→ 召回相关块
                                                                      ↓
                                    召回块 + 对话历史 + 问题 ──→ DeepSeek Chat（SSE 流式）──→ 回答 + 引用
```

### 1.3 范围清单

| 序号 | 功能 | 说明 |
|------|------|------|
| 1 | pgvector 向量存储 | PostgreSQL 扩展，存文档块的 embedding 向量 |
| 2 | 文档智能分块 | 按段落/标题切分，带重叠窗口 |
| 3 | DeepSeek Embeddings API | 用 `deepseek-chat` 兼容接口生成向量 |
| 4 | RAG 问答（流式） | SSE 推送 token，前端逐字渲染 |
| 5 | 引用溯源 | 回答附引用块来源，点击跳转到原文档 |
| 6 | 多轮对话 | 会话管理(CRUD)、历史消息、上下文窗口管理 |
| 7 | 自动索引 | 文档创建/更新→自动分块→自动 embedding →入库 |
| 8 | DeepSeek 全量迁移 | AI 摘要（文档/会议）切 DeepSeek，`OPENAI_RESPONSES`→`DEEPSEEK_CHAT` |
| 9 | 知识库问答界面 | 聊天面板 + 会话列表 + 引用展开 |
| 10 | 重索引管理 | 管理页手动触发全量/增量重索引 |
| 11 | 错误与降级 | L1 正常 RAG / L2 关键词降级 / L3 全文搜索兜底 / L0 未配置 |
| 12 | 既有文档初始索引 | 分批异步、进度可查、失败可重试 |
| 13 | 索引健康监控 | 仪表盘 + 自动补建 + 健康检查集成 |
| 14 | AI 摘要流式化 | 文档/会议摘要改为流式输出，采纳逻辑不变 |
| 15 | 流式协议改造 | Electron 扩展桥新增 `extension.stream` 事件 + SSE 中继 |
| 16 | 浏览器直接模式 | 无 Electron 时后端从 `.env` 读 key 直调 DeepSeek，前端无感知 |

---

## 2. DeepSeek 迁移策略

### 2.1 Provider 变更

| 项目 | 旧值 | 新值 |
|------|------|------|
| Provider ID | `OPENAI_RESPONSES` | `DEEPSEEK_CHAT` |
| API Base | `https://api.openai.com/v1` | `https://api.deepseek.com/v1` |
| Chat Model | `gpt-4o`（用户配置） | `deepseek-chat` |
| Embedding Model | — | `deepseek-chat`（复用 chat 模型的嵌入能力，维度按 API 实际响应确认） |
| 凭据字段 | `apiKey` | `apiKey`（不兼容变更） |
| 操作 | `TEST_CONNECTION`, `AI_SUMMARIZE_MEETING`, `AI_SUMMARIZE_DOCUMENT`, `AI_KNOWLEDGE_QA` | 相同，新增 `AI_KNOWLEDGE_SEARCH` |
| 流式 | 不支持（全文一次性返回） | **全部操作支持流式**（SSE 推送 token） |

### 2.2 流式协议改造

现有的扩展执行桥（`extension-run-broker.ts`）是一次性请求-响应模式：后端通过 WebSocket 发送 `extension.run` 事件 → Electron 主进程调用 DeepSeek API → 完整结果通过 `completionToken` 回调。要支持流式，需要改桥接层：

**新协议：**

```
后端 ──WebSocket──→ Electron 主进程
  event: extension.stream
  payload: { runId, profile, operation, payload, inputSha256, completionToken }

Electron 主进程 → DeepSeek API（stream: true）
  → 每收到一个 SSE chunk：
    通过 WebSocket 发送：
    event: extension.token
    payload: { runId, completionToken, content, index }

  → 流结束：
    event: extension.stream_done
    payload: { runId, completionToken, finishReason, totalTokens }

  → 流出错：
    event: extension.stream_error
    payload: { runId, completionToken, errorCode, message }
```

**改动范围：**
- `extension-run-broker.ts`：新增 `stream` 事件处理，复用 `canonicalize` + `payloadHash` 校验，不做内容审计（与现有策略一致）
- `extensions.gateway.ts`（后端）：新增 `handleStreamToken` 方法，将 token 转发到等待的 SSE 连接
- `rag.service.ts`：通过 WebSocket 监听 `extension.token` 事件，转为 SSE 推送给前端
- `ai-context.service.ts` 和 `ai-adoption.service.ts`：流式结果不直接采纳——完整回答收集完毕后，用户决定是否采纳（与现有摘要采纳流程一致）

旧的 `extension.run`（一次性）保留，用于 `TEST_CONNECTION` 和不需要流式的操作。

### 2.3 浏览器直接模式

当前所有 AI 调用必须经过 Electron 桥（后端 → WebSocket → Electron 主进程 → API），浏览器模式下（`localhost:4312` 无 Electron）AI 功能完全不可用。新增**双通道 Provider 执行模式**：

```
                 ┌── Electron 可用？──→ extension.stream（安全桥，key 在保险箱）
                 │
RAG/Embedding ──┤
                 │
                 └── 浏览器模式 ──→ DirectHttpProvider（后端从 .env 读 key，直调 DeepSeek）
```

**实现：**

```ts
// embedding.service.ts / rag.service.ts
class AiProviderRouter {
  constructor(
    private readonly extensionGateway: ExtensionsGateway,  // WebSocket to Electron
    private readonly deepseekHttp: DeepSeekHttpProvider,    // Direct HTTP client
  ) {}

  async chat(params: ChatParams): Promise<ReadableStream> {
    if (this.extensionGateway.hasActiveConnection()) {
      // 安全桥模式：API key 在 Electron safeStorage 中，后端不可见
      return this.extensionGateway.streamChat(params);
    }
    // 浏览器模式：后端从 DEEPSEEK_API_KEY 环境变量读取
    return this.deepseekHttp.streamChat(params);
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (this.extensionGateway.hasActiveConnection()) {
      return this.extensionGateway.embed(texts);
    }
    return this.deepseekHttp.embed(texts);
  }
}
```

**规则：**

| 模式 | API Key 来源 | 数据出本机 | 适用场景 |
|------|-------------|-----------|---------|
| Electron 桥 | `safeStorage` 加密存储 | Electron 主进程发出 | 生产使用 |
| 浏览器直接 | `.env` 中 `DEEPSEEK_API_KEY` | NestJS 后端发出 | 开发调试、纯浏览器使用 |

- 检测方式：`ExtensionsGateway` 启动时设置 `hasActiveConnection` 标志（WebSocket 客户端连接后为 true）
- 降级行为：Electron 断开时自动切到直连模式（如果 `.env` 有 key），反之亦然
- 安全边界：浏览器模式下 API key 明文存在 `.env`（已被 `.gitignore`），不经过前端
- 前端无感知：API 端点、SSE 格式、流式渲染完全一致

### 2.4 迁移影响的文件

**后端**
- `extensions/application/extensions.service.ts` — Provider 注册、操作映射、zod schema → `DEEPSEEK_CHAT`
- `extensions/application/ai-context.service.ts` — 上下文准备逻辑不变，payload 字段不变
- `extensions/application/ai-adoption.service.ts` — 采纳逻辑不变
- `extensions/domain/` — 新增 `RAG` 相关类型

**Electron Desktop**
- `desktop/src/extensions/contracts.ts` — 枚举值 `OPENAI_RESPONSES`→`DEEPSEEK_CHAT`
- `desktop/src/extensions/provider-registry.ts` — 校验逻辑更新
- `desktop/src/extensions/providers/openai.ts` → `deepseek.ts` — 指向 DeepSeek API
- `desktop/src/extension-run-broker.ts` — 不变（通用执行桥）

**前端**
- `ExtensionsSettingsPage.tsx` — Provider 选择项更新、凭据字段标签更新
- 其他不变

### 2.3 兼容性策略

Electron 保险箱已存的 `OPENAI_RESPONSES` 凭据标记为 `deprecated`，不自动迁移（两个 provider 的 API key 不同）。用户在设置页重新录入 DeepSeek API key 后启用 `DEEPSEEK_CHAT`。旧 OpenAI 凭据保留在保险箱中不删除，用户可手动删除。

---

## 3. 向量存储设计

### 3.1 pgvector 扩展

```sql
CREATE EXTENSION IF NOT EXISTS vector;

-- 文档块表：存储每个文档的分块及其 embedding
CREATE TABLE app.document_chunks (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_id TEXT NOT NULL REFERENCES app.content_documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,                              -- 块序号（从 0 开始）
  content     TEXT NOT NULL,                             -- 块原始文本
  token_count INT NOT NULL DEFAULT 0,                    -- 估算的 token 数
  embedding   vector(1536),                              -- DeepSeek embedding 维度（待确认，先用 1536）
  metadata    JSONB NOT NULL DEFAULT '{}',               -- 来源段落、标题层级等
  created_at  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  UNIQUE (document_id, chunk_index)
);

-- HNSW 索引（高召回、近实时）
CREATE INDEX ON app.document_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);
```

### 3.2 分块策略

```
策略：RecursiveCharacterTextSplitter 风格
- 优先按 ## 标题切分，其次按段落（双换行），再次按句子
- chunk_size：512 tokens（约 800 中文字）
- chunk_overlap：64 tokens（约 100 中文字）
- 保留元数据：documentId, chunkIndex, headingPath（标题层级路径）
```

分块在**后端**执行（NestJS service，不依赖外部库——简单的中文标点断句即可）。

### 3.3 Embedding 生成

调用 DeepSeek API（OpenAI 兼容格式）：

```
POST https://api.deepseek.com/v1/embeddings
{
  "model": "deepseek-chat",
  "input": ["文本1", "文本2", ...]
}
```

- 批量上限：20 块/请求（减少 API 调用次数）
- 重试策略：429/5xx 有界重试 3 次，指数退避
- 本地缓存：相同内容的 SHA-256 → embedding 映射（避免重复调用 API）

### 3.4 向量搜索

```sql
SELECT id, document_id, chunk_index, content, metadata,
       1 - (embedding <=> $query_embedding) AS similarity
FROM app.document_chunks
WHERE embedding IS NOT NULL
ORDER BY embedding <=> $query_embedding  -- cosine distance
LIMIT $top_k;
```

- `top_k`：20（召回 20 个最相关块）
- 后处理：按相似度阈值 0.7 过滤、去重相邻块、按文档聚合并截断到上下文窗口

---

## 4. RAG 问答设计

### 4.1 问答流程（流式）

```
1. 用户输入问题 q
2. 后端：q → DeepSeek Embeddings → 向量检索 top 20 chunks
3. 后端：检索对话历史最近 N 轮（token 预算内）
4. 后端：组装 prompt：
     system: "你是一个本地研发知识库助手。只根据提供的文档内容回答，无法回答时如实说明。"
     context: "相关文档内容：\n[chunk1]\n---\n[chunk2]\n..."
     messages: [...历史消息, { role: "user", content: q }]
5. 后端：调用 DeepSeek Chat API（stream: true）
6. 后端：通过 WebSocket 逐 token 推送
7. 前端：逐字渲染 + 引用标签实时显示
```

### 4.2 API 设计

```
POST /api/knowledge/chat/:sessionId/messages
  Body: { question: string }
  Response: SSE stream（非 WebSocket，选 SSE 因为更简单且满足需求）
    或：WebSocket 事件流（如已有 WebSocket 基础设施则复用）

事件格式（SSE）：
  event: token
  data: {"content": "根据", "index": 0}

  event: token
  data: {"content": "文档", "index": 1}

  event: citations
  data: [{"documentId": "xxx", "title": "方案设计", "chunkIndex": 3, "text": "..."}]

  event: done
  data: {"messageId": "yyy", "totalTokens": 1234}
```

### 4.3 Prompt 模板

```
你是一个本地研发知识库助手，服务于研发主管的日常决策。
你的知识来源是用户本机的文档、会议纪要、方案和复盘。

规则：
1. 只根据 <context></context> 中提供的内容回答
2. 如果上下文中没有足够信息，诚实说明"知识库中未找到相关信息"
3. 回答末尾列出引用的文档标题
4. 用中文回答，简洁专业
5. 不要编造内容，不要使用外部知识

<context>
{chunks}
</context>
```

### 4.4 上下文窗口预算

- 总预算：~6000 tokens（DeepSeek 上下文窗口 128K，用 6K 足够且经济）
- 系统 prompt：~200 tokens
- 对话历史：~2000 tokens（最近 5 轮）
- 召回 chunks：~3500 tokens
- 回答预算：~300 tokens

### 4.5 引用溯源

回答末尾附加引用格式：

```markdown
> **参考来源：**
> 1. [方案设计 - 第2段](/docs?documentId=xxx) — "接口采用 RESTful 风格..."
> 2. [2026Q3 复盘 - 第5段](/docs?documentId=yyy) — "性能瓶颈在数据库查询..."
```

前端渲染为可点击卡片，点击跳转到原文档指定段落。

---

## 5. 对话管理设计

### 5.1 数据模型

```prisma
model KnowledgeSession {
  id        String   @id @default(cuid())
  title     String                           // 自动生成：首条问题的前 30 字
  status    KnowledgeSessionStatus @default(ACTIVE)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  messages  KnowledgeMessage[]

  @@map("knowledge_sessions")
  @@schema("app")
}

model KnowledgeMessage {
  id           String           @id @default(cuid())
  sessionId    String           @map("session_id")
  role         MessageRole                      // USER | ASSISTANT
  content      String
  citations    Json?                            // 引用文档块
  tokenCount   Int?             @map("token_count")
  createdAt    DateTime         @default(now()) @map("created_at")
  session      KnowledgeSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId, createdAt])
  @@map("knowledge_messages")
  @@schema("app")
}

enum KnowledgeSessionStatus { ACTIVE ARCHIVED }
enum MessageRole { USER ASSISTANT }
```

### 5.2 会话 API

```
GET    /api/knowledge/sessions            — 会话列表（按更新时间倒序）
POST   /api/knowledge/sessions            — 创建新会话
GET    /api/knowledge/sessions/:id        — 会话详情 + 消息列表
PATCH  /api/knowledge/sessions/:id        — 更新（重命名/归档）
DELETE /api/knowledge/sessions/:id        — 删除会话
```

### 5.3 前端界面

```
┌──────────────────┬──────────────────────────────────────┐
│  知识库问答       │                                      │
│  ┌──────────────┐│  ┌────────────────────────────────┐  │
│  │ 新建对话      ││  │ AI: 根据知识库中的文档，上周...  │  │
│  ├──────────────┤│  │     引用：方案设计 / 复盘记录     │  │
│  │ Q3 架构讨论   ││  │                                │  │
│  │ 接口方案咨询  ││  │ 用户：PostgreSQL 连接池怎么配？ │  │
│  │ 性能复盘     ││  │                                │  │
│  │ ...          ││  │ AI: （逐字流式输出中...）       │  │
│  └──────────────┘│  └────────────────────────────────┘  │
│                  │  ┌────────────────────────────────┐  │
│                  │  │ [输入问题...]          [发送]   │  │
│                  │  └────────────────────────────────┘  │
└──────────────────┴──────────────────────────────────────┘
```

左侧是会话列表（可搜索/归档）。右侧是对话面板：消息气泡、流式渲染、引用卡片、输入框。纯 Semi Design 组件，不动现有知识库页面的三栏布局。新增一个顶级入口 `知识问答` 或在 `文档与知识库` 页内增加一个 Tab `AI 问答`——放在文档与知识库页内的左侧导航作为子入口，不改顶级导航。

---

## 6. 自动索引设计

### 6.1 触发时机

| 事件 | 行为 |
|------|------|
| 文档创建 | 分块 → embedding → 写入 document_chunks |
| 文档内容更新 | 删除旧 chunks → 重新分块 → embedding → 写入新 chunks |
| 文档删除/归档 | 级联删除关联 chunks（ON DELETE CASCADE） |
| 手动重建索引 | 清空所有 chunks → 全量重建 |

### 6.2 实现

在 `DocumentsService` 的 create/update 方法中，事务提交后异步触发索引（不阻塞保存响应）：

```ts
// documents.service.ts
async update(id: string, input: UpdateDocumentDto) {
  const document = await this.prisma.$transaction(async (tx) => {
    const updated = await tx.contentDocument.update(...);
    return updated;
  });
  // 异步索引，不阻塞 HTTP 响应
  this.indexer.schedule(document.id).catch((error) => {
    this.logger.error({ documentId: document.id, error }, 'Document indexing failed');
  });
  return document;
}
```

### 6.3 重索引管理 API

```
POST /api/knowledge/reindex              — 全量重建索引（异步，返回 jobId）
GET  /api/knowledge/reindex/:jobId       — 查询索引任务进度
POST /api/knowledge/reindex/:documentId  — 单文档重索引
```

---

## 7. 后端模块边界

### 7.1 新增 `knowledge` 模块

```
backend/src/modules/workbench/knowledge/
├── knowledge.module.ts
├── domain/
│   └── knowledge.types.ts              — RAG 相关类型
├── application/
│   ├── chunking.service.ts             — 文档分块
│   ├── embedding.service.ts            — DeepSeek Embeddings 调用
│   ├── rag.service.ts                  — 问答编排（检索+prompt+调用+流式）
│   ├── session.service.ts              — 会话 CRUD
│   └── indexing.service.ts             — 全量/增量索引管理
├── interface/
│   └── http/
│       ├── knowledge.controller.ts     — 问答/会话/重索引端点
│       └── dto/
│           └── knowledge.dto.ts
└── __tests__/
```

### 7.2 修改现有模块

| 模块 | 文件 | 改动 |
|------|------|------|
| extensions | `extensions.service.ts` | Provider `DEEPSEEK_CHAT` + 操作映射 + schema |
| extensions | `ai-context.service.ts` | `knowledgeQuestion` → 改用向量检索取上下文（切到 RAG） |
| extensions | `ai-adoption.service.ts` | 不变 |
| content | `documents.service.ts` | create/update 后异步触发索引 |
| content | `content.module.ts` | 导入 KnowledgeModule |
| search | `search.types.ts` | 新增 `KNOWLEDGE_SESSION` 类型（可选） |
| Prisma | `schema.prisma` | 新增 KnowledgeSession/Message + DocumentChunk |
| DB | migration | pgvector 扩展 + 表 + 索引 |

---

## 8. 前端模块边界

### 8.1 新增文件

```
frontend/src/modules/knowledge/
├── api.ts                    — 会话 CRUD、问答流式、重索引 API
├── types.ts                  — KnowledgeSession、Message、Citation 等类型
├── queryKeys.ts              — React Query keys
├── components/
│   ├── KnowledgeChatPanel.tsx       — 对话面板（流式渲染）
│   ├── KnowledgeSessionList.tsx     — 会话列表
│   ├── KnowledgeMessageBubble.tsx   — 消息气泡（用户/AI + 引用）
│   ├── KnowledgeCitationCard.tsx    — 引用来源卡片
│   └── KnowledgeChatInput.tsx       — 输入框（发送/停止生成）
├── hooks/
│   └── useKnowledgeChat.ts          — 流式 SSE 消费 hook
```

### 8.2 修改文件

| 文件 | 改动 |
|------|------|
| `KnowledgeHomePage.tsx` | 增加 Tab：`文档浏览` / `AI 问答` |
| `ExtensionsSettingsPage.tsx` | Provider 名改为 DeepSeek |
| `WorkspaceNavigation.tsx` | 不变（不新增顶级入口） |

### 8.3 流式渲染策略

使用 `EventSource`（SSE）或 `fetch` + `ReadableStream`：

```ts
// hooks/useKnowledgeChat.ts
const response = await fetch(`/api/knowledge/chat/${sessionId}/messages`, {
  method: 'POST',
  body: JSON.stringify({ question }),
  headers: { 'Content-Type': 'application/json' },
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();
let content = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value, { stream: true });
  // 解析 SSE 事件 → 更新 React state
  content += parseChunk(text);
  setStreamingContent(content);
}
```

---

## 9. Electron Desktop 改动

| 文件 | 改动 |
|------|------|
| `contracts.ts` | `extensionProviders` 新增 `DEEPSEEK_CHAT` |
| `providers/deepseek.ts` | 新建：基于现有 `openai.ts` 模板，改 base URL + model name |
| `providers/openai.ts` | 保留并标记 `deprecated`（用户可能仍有旧凭据） |
| `provider-registry.ts` | 注册 DeepSeek provider |
| `extension-ipc.ts` | 不变（通用桥） |

Preload 和凭据保险箱不变。DeepSeek API key 同样走 `safeStorage` 加密存储，renderer 不可读。

---

## 10. 数据库迁移

```sql
-- 1. pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 文档块表
CREATE TABLE app.document_chunks (...);  -- 见第 3 节

-- 3. 会话表
CREATE TABLE app.knowledge_sessions (...);

-- 4. 消息表
CREATE TABLE app.knowledge_messages (...);

-- 5. HNSW 索引
CREATE INDEX ON app.document_chunks USING hnsw (embedding vector_cosine_ops);

-- 6. 初始索引任务：现有 ACTIVE 文档加入索引队列（后台异步）
```

---

## 11. 用户流

### 11.1 首次使用

1. 打开应用 → 设置 → 扩展管理 → 输入 DeepSeek API key → 测试连接 → 启用
2. 进入 文档与知识库 → AI 问答
3. 首次进入时提示"正在为现有文档建立索引..."（如文档较多）
4. 索引完成 → 可开始提问

### 11.2 日常使用

1. 在文档编辑器中撰写方案/会议纪要/复盘 → 保存 → 后台自动索引
2. 切换到 AI 问答 → 开启新对话 → 输入问题 → 流式返回答案 + 引用
3. 点击引用卡片 → 跳转到原文档段落
4. 可以继续追问（对话上下文保留）
5. 对话列表持久化，随时回来继续

---

## 12. 验证策略

| 验证项 | 方法 |
|--------|------|
| 分块正确性 | 单测：中文文档切段，验证重叠窗口和 token 计数 |
| Embedding 调用 | 单测：Mock DeepSeek API，验证批量/重试/缓存 |
| 向量搜索精度 | 集成测试：已知文档库，固定问题，验证召回文档排前 |
| RAG 答案质量 | E2E：真实 DeepSeek API，验证答案引用正确文档 |
| 流式渲染 | E2E：验证 SSE 事件被逐 token 渲染到页面 |
| DeepSeek 迁移 | 手动：在设置页录入 API key，执行连接测试和摘要测试 |
| 向后兼容 | 旧 OpenAI 凭据不丢失，可手动删除；AI 摘要功能继续可用（切到 DeepSeek） |

---

## 13. 错误与降级策略

本机应用不能依赖云端完全可用。分三级降级：

### 13.1 降级层级

| 层级 | 触发条件 | 行为 |
|------|---------|------|
| **L1：正常** | DeepSeek API 可用 | 完整 RAG：向量检索 + 流式回答 + 引用 |
| **L2：Embedding 降级** | Embeddings API 超限/故障，Chat API 可用 | 回退到**关键词检索**取 top 文档块，仍走流式 Chat 回答 |
| **L3：完全离线** | 所有 DeepSeek API 不可用 | 回退到 PostgreSQL 全文搜索（`plainto_tsquery`），展示相关文档列表，不生成回答 |
| **L0：服务未配置** | 用户未录入 API key | 提示配置 DeepSeek，**索引功能仍正常运行**（分块+存文本，缺少 embedding 向量），后续配置后可补建 |

### 13.2 具体实现

- **Embedding 调用保护**：5 秒超时，3 次重试（间隔 1s/2s/4s），全部失败 → 标记该批次 chunks 的 `embedding` 为 NULL（文本仍在，可关键词搜索），不阻塞文档保存
- **Chat API 保护**：流式连接 30 秒超时无数据则关闭，前端显示"生成中断，可重试"
- **429 限流**：读取 `Retry-After` 头，等待后重试，前端显示"API 繁忙，稍后重试"
- **全局兜底**：所有 API 错误码归于三个用户可见错误：`API 暂时不可用`（429/5xx）、`API 配置错误`（401/403）、`网络异常`（连接超时/DNS 失败）
- **索引独立于问答**：即使 DeepSeek 完全不可用，文档保存照常（分块写库），用户录入 key 后后端自动补建缺失的 embedding 向量

---

## 14. 既有文档初始索引

### 14.1 启动条件

- 用户在设置页配置 DeepSeek API key 并测试连接成功
- 后端检测到 **第一次启用**（`app_metadata` 表中无 `knowledge.index.initial` 标记）
- **或**用户手动在管理页触发"全量重建索引"

### 14.2 索引流程

```
1. 查询所有 ACTIVE 状态的文档总数 N
2. 分批处理（每批 10 篇，避免一次性消耗大量 API 配额）
3. 每篇文档：分块 → 去重（SHA-256 缓存检查）→ 批量 embedding → 写入 document_chunks
4. 进度可查询：GET /api/knowledge/reindex/status
    返回：{ total: 150, indexed: 87, failed: 2, inProgress: true }
5. 完成后写入 app_metadata 标记 knowledge.index.initial = complete
6. 失败文档记录在 app_metadata knowledge.index.failed_documents，可单篇重试
```

### 14.3 前端展示

- 首次进入 AI 问答 → 顶部横幅："正在为 150 篇文档建立索引...（87/150）" + 进度条
- 索引完成 → 横幅消失，可正常提问
- 有失败的文档 → 横幅变为黄色："2 篇文档索引失败 [查看详情] [重试]"
- 管理页 `/settings/extensions` 增加"知识库索引"卡片：进度、失败列表、手动重建按钮

---

## 15. 索引健康监控

### 15.1 健康指标

| 指标 | 获取方式 | 阈值 |
|------|---------|------|
| 已索引文档数 | `SELECT count(DISTINCT document_id) FROM app.document_chunks WHERE embedding IS NOT NULL` | — |
| 未索引文档数 | `SELECT count(*) FROM app.content_documents WHERE status='ACTIVE' AND trashed_at IS NULL` MINUS 已索引数 | >0 时提示 |
| embedding 缺失块数 | `SELECT count(*) FROM app.document_chunks WHERE embedding IS NULL` | >0 时提示 |
| 最后索引时间 | `app_metadata` 记录 | — |
| 总块数/总 token 数 | 聚合查询 | — |

### 15.2 展示位置

在管理设置页的"知识库索引"卡片中展示仪表盘：

```
索引状态 ● 正常
├── 已索引文档：148/150
├── 总块数：2,340
├── 最近索引：2026-07-26 15:30
├── 2 篇未索引 [查看]
└── [重建全部索引]
```

### 15.3 自动修复

- 文档更新后后台自动重索引（已设计，第 6 节）
- 每 6 小时自动扫描缺失 embedding 的块，尝试补调（轻量静默操作，失败不报警）
- 索引健康检查集成到现有的 `/api/health` 端点（新增 `knowledgeIndex` 检查项）

---

## 16. AI 摘要流式化

当前 AI 摘要是全文一次性返回（`AI_SUMMARIZE_DOCUMENT` / `AI_SUMMARIZE_MEETING`）。切到 DeepSeek 后改为流式。

### 16.1 流程

```
1. 用户在文档/会议页面点击「AI 摘要」
2. 后端准备上下文（与现在相同：截取文档正文或组装会议信息）
3. 通过 Electron 桥发起流式请求（extension.stream 事件）
4. 前端 SSE 接收 token → 在摘要预览区逐字渲染
5. 流结束 → 显示完整摘要 + 「采纳」按钮
6. 用户点击「采纳」→ 摘要写入文档/会议（与现有 ai-adoption.service 一致）
7. 用户不采纳 → 摘要丢弃
```

### 16.2 改动点

- `ai-context.service.ts`：`documentSummary` / `meetingSummary` 方法不变，只改调用方式为流式
- `ExtensionsSettingsPage.tsx` 或对应设置页：无需改动——摘要功能由 provider 能力决定，"启用后所有 AI 功能自动可用"
- Electron provider：`deepseek.ts` 实现 `streamChat` 方法（调用 `/v1/chat/completions` with `stream: true`）
- 摘要采纳：流式收集完整文本后存入 `AiAdoptionService`，逻辑不变

---

## 17. 不做的

- 不引入第三方向量数据库（Pinecone/Weaviate/Qdrant）— pgvector 够用
- 不做图像/PDF 内容提取——当前知识库只有纯文本
- 不做多知识库/RBAC——仍是单人本地应用
- 不做知识图谱或自动分类
- 不做联网检索（RAG 只用本地文档）
- 不引入 LangChain/LlamaIndex——自己实现分块和编排，依赖更少
