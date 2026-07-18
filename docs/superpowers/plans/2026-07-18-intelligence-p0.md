# 行业情报 P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在本地研发主管工作台交付可手工维护、可追溯、可去重并能转化为工作行动的行业情报闭环。

**Architecture:** 情报域以 NestJS 的 `workbench/intelligence` 垂直模块和 PostgreSQL `app` schema 为边界；主题、来源、计划、执行记录、规范化卡片、来源出现、简报与会议议题均保存为独立实体。P0 的“采集”只记录已配置计划和用户触发的手工执行结果，不访问网页、不运行爬虫、不调用 AI；摘要、影响与建议全部由用户填写。React 通过类型化 HTTP client 提供桌面优先的情报工作台，并复用已有项目、任务、风险和会议 API 完成真实转换。

**Tech Stack:** React 19、Vite、TanStack Query、React Router、Tailwind/shadcn、NestJS 10、Prisma 6、PostgreSQL 17、class-validator、Jest/Supertest、Vitest。

---

## 范围、依赖与验收

- 本计划在“管理闭环 P0”已合入 `main` 后执行；它依赖 `Risk`、`Meeting`、`ProjectsModule` 与 `TasksModule` 的真实服务，而不是复制这些领域模型或在情报表中存 JSON 假对象。
- P0 支持主题关键词/同义词/排除词/优先级/关联项目，来源的可信度和启停，配置化手工/每日/每周采集计划，及每次手工运行的成功或失败日志。
- 情报卡必须保存规范化标题、原文链接、正文、发布日期、分类、人工摘要、影响判断、建议动作、优先级、收藏和标记；同一事件可记录多个来源出现。
- 去重使用服务端计算的稳定 `dedupeKey`：优先规范化 URL；无 URL 时使用 `SHA-256(normalizedTitle + "\\n" + normalizedPublishedDate + "\\n" + normalizedBody)`。同一个 `dedupeKey` 永远只对应一张未归档情报卡；重复录入只能新增来源出现，不能覆盖人工字段。
- 卡片可关联多个主题和项目，可按主题、项目、来源、优先级、收藏、标签、发布时间与文本检索；删除为软归档，来源出现和运行日志保留历史。
- `POST /api/intelligence-items/:id/task` 在同一事务创建 `WorkTask`，必须写入 `sourceType: 'INTELLIGENCE_ITEM'` 与 `sourceId: item.id`。`POST /api/intelligence-items/:id/risk` 调用管理域的事务内风险创建入口；`POST /api/intelligence-items/:id/meeting-agendas` 创建真实、可在会议详情显示的 `MeetingAgendaItem`。
- 日报和周报是人工选择卡片后生成的可编辑快照，按 `briefDate + kind` 幂等；不会自动发送通知、不会自动生成周报正文、不会使用 AI。
- 所有时间均按 UTC 存取，HTTP 使用 ISO-8601；列表沿用 `{ data, meta: { page, pageSize, total } }`，默认 `page=1/pageSize=20`、最大 100；未知字段由全局 `forbidNonWhitelisted` 拒绝。

## 数据模型与 HTTP 契约

### 前向 Prisma 模型

在 `backend/prisma/schema.prisma` 新增下列枚举。每一个都有 `@@schema("app")`：

```prisma
enum IntelligencePriority { LOW MEDIUM HIGH CRITICAL @@schema("app") }
enum IntelligenceSourceKind { WEBSITE RSS NEWSLETTER MANUAL OTHER @@schema("app") }
enum IntelligenceScheduleFrequency { MANUAL DAILY WEEKLY @@schema("app") }
enum IntelligenceRunStatus { SUCCEEDED FAILED @@schema("app") }
enum IntelligenceRunTrigger { MANUAL SCHEDULED @@schema("app") }
enum IntelligenceBriefKind { DAILY WEEKLY @@schema("app") }
```

新模型（每个表均有 `id String @id @default(cuid())`、`createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)`，并有 `@@map`、`@@schema("app")`）如下。`IntelligenceItem`、主题、来源、计划与简报使用 `archivedAt` 软归档；运行、来源出现、关联和会议议题不软删，保证审计链完整。

```text
IntelligenceTopic:
  name @unique, keywords String[] default [], synonyms String[] default [],
  excludedKeywords String[] default [], priority default MEDIUM, isEnabled default true,
  archivedAt?, updatedAt; topicProjects, itemTopics

IntelligenceTopicProject:
  topicId, projectId; @@id([topicId, projectId]); Project onDelete Restrict

IntelligenceSource:
  name @unique, kind default WEBSITE, baseUrl?, credibility Int (1..5 enforced by DTO),
  isEnabled default true, notes?, archivedAt?, updatedAt; schedules, occurrences

IntelligenceSchedule:
  sourceId, name, frequency default MANUAL, runAtLocalTime? (HH:mm),
  weekday? (1..7), isEnabled default true, archivedAt?, lastRunAt?, updatedAt; runs

IntelligenceRun:
  scheduleId?, sourceId, trigger, status, startedAt, finishedAt, itemCount default 0,
  errorMessage?, inputSummary?; schedule onDelete SetNull, source onDelete Restrict

IntelligenceItem:
  dedupeKey @unique, canonicalUrl?, title, body?, publishedAt?, category?, summary?,
  impactAssessment?, recommendedAction?, priority default MEDIUM, isFavorite default false,
  labels String[] default [], archivedAt?, updatedAt; occurrences, itemTopics, itemProjects,
  taskConversions, riskConversions, meetingAgendaItems, briefItems

IntelligenceSourceOccurrence:
  intelligenceItemId, sourceId, sourceKey, sourceUrl?, sourceTitle?, rawBody?,
  publishedAt?, capturedAt; @@unique([sourceId, sourceKey])

IntelligenceItemTopic:
  intelligenceItemId, topicId; @@id([intelligenceItemId, topicId])

IntelligenceItemProject:
  intelligenceItemId, projectId; @@id([intelligenceItemId, projectId])

IntelligenceTaskConversion:
  intelligenceItemId, taskId @unique, createdAt; item and task relations onDelete Restrict

IntelligenceRiskConversion:
  intelligenceItemId, riskId @unique, createdAt; item and risk relations onDelete Restrict

MeetingAgendaItem:
  meetingId, intelligenceItemId?, title, detail?, sequence, createdAt, updatedAt;
  meeting onDelete Restrict, intelligence item onDelete SetNull

IntelligenceBrief:
  kind, briefDate DateTime @db.Date, title, introduction?, archivedAt?, updatedAt;
  @@unique([kind, briefDate]); briefItems

IntelligenceBriefItem:
  intelligenceBriefId, intelligenceItemId, sequence, note?, snapshot Json;
  @@unique([intelligenceBriefId, intelligenceItemId])
```

给 `Project` 添加 `intelligenceTopics`、`intelligenceItems`，给 `WorkTask` 添加 `intelligenceConversion`，给管理闭环的 `Risk` 添加 `intelligenceConversion`，给 `Meeting` 添加 `agendaItems` 反向关系。`IntelligenceItem` 的索引为 `[archivedAt, publishedAt]`、`[archivedAt, priority]`、`[isFavorite, archivedAt]`；来源出现为 `[intelligenceItemId, capturedAt]`；计划为 `[sourceId, archivedAt, isEnabled]`；运行记录为 `[sourceId, startedAt]`；简报条目为 `[intelligenceBriefId, sequence]`。迁移目录固定为 `backend/prisma/migrations/20260718030000_intelligence_p0/`，只允许前向 `CREATE TYPE/TABLE/INDEX` 与 `ALTER TABLE ... ADD`，不允许 `DROP`、`db push` 或数据库重建。

### REST 路由

```text
GET/POST/PATCH/DELETE /api/intelligence-topics
GET/POST/PATCH/DELETE /api/intelligence-sources
GET/POST/PATCH/DELETE /api/intelligence-schedules
POST /api/intelligence-schedules/:id/runs
GET /api/intelligence-runs
GET/POST/PATCH/DELETE /api/intelligence-items
GET /api/intelligence-items/:id
POST /api/intelligence-items/:id/task
POST /api/intelligence-items/:id/risk
POST /api/intelligence-items/:id/meeting-agendas
GET/POST/PATCH/DELETE /api/intelligence-briefs
GET /api/intelligence-briefs/:id
```

`POST /intelligence-schedules/:id/runs` 接受 `{ status, itemCount?, errorMessage?, inputSummary?, startedAt?, finishedAt? }`，由用户明确记录本次手工运行结果；它绝不发起网络请求。`POST /intelligence-items` 接受一个必填 `sourceOccurrence`（`sourceId`、`sourceKey`、`sourceUrl?`、`sourceTitle?`、`rawBody?`、`publishedAt?`）和卡片字段；若 key 已存在，返回 `200`、已有卡片及 `deduplicated: true`，并只新增尚不存在的来源出现。所有首次创建成功返回 `201`。更新不得修改 `dedupeKey` 或删除历史出现。

稳定错误码：`INTELLIGENCE_TOPIC_NOT_FOUND`、`INTELLIGENCE_SOURCE_NOT_FOUND`、`INTELLIGENCE_SCHEDULE_NOT_FOUND`、`INTELLIGENCE_ITEM_NOT_FOUND`、`INTELLIGENCE_BRIEF_NOT_FOUND`、`INTELLIGENCE_SOURCE_ARCHIVED`、`INTELLIGENCE_SOURCE_OCCURRENCE_EXISTS`、`INTELLIGENCE_DEDUPE_CONFLICT`、`INTELLIGENCE_INVALID_SCHEDULE`、`INTELLIGENCE_BRIEF_ITEM_DUPLICATE`、`INTELLIGENCE_CONVERSION_EXISTS`、`MEETING_NOT_FOUND`、`RISK_NOT_FOUND`。项目、任务、风险、会议引用不存在或已归档时继续使用各域既有错误码或 `MANAGEMENT_REFERENCE_INVALID`。

## 文件结构

```text
backend/
  prisma/schema.prisma
  prisma/migrations/20260718030000_intelligence_p0/migration.sql
  src/modules/workbench/intelligence/
    application/intelligence-reference.service.ts
    application/intelligence.service.ts
    application/intelligence-briefs.service.ts
    interface/http/intelligence-topics.controller.ts
    interface/http/intelligence-sources.controller.ts
    interface/http/intelligence-schedules.controller.ts
    interface/http/intelligence-items.controller.ts
    interface/http/intelligence-briefs.controller.ts
    interface/http/dto/*.dto.ts
    intelligence.module.ts
  src/modules/workbench/management/application/risks.service.ts
  src/modules/workbench/management/application/meetings.service.ts
  src/modules/workbench/management/interface/http/meetings.controller.ts
  src/modules/workbench/tasks/application/tasks.service.ts
  src/modules/workbench/workbench.module.ts
  src/shared/errors/error-codes.ts
  test/unit/modules/workbench/intelligence*.spec.ts
  test/integration/prisma/intelligence-catalog.spec.ts
  test/integration/modules/workbench/intelligence.controller.spec.ts

frontend/
  src/modules/workbench/api/intelligence.ts
  src/modules/workbench/api/__tests__/intelligence.contracts.test.ts
  src/modules/workbench/types.ts
  src/modules/workbench/components/intelligence/TopicForm.tsx
  src/modules/workbench/components/intelligence/SourceForm.tsx
  src/modules/workbench/components/intelligence/IntelligenceItemForm.tsx
  src/modules/workbench/components/intelligence/IntelligenceItemDetail.tsx
  src/modules/workbench/components/intelligence/BriefForm.tsx
  src/pages/IntelligencePage.tsx
  src/pages/IntelligenceBriefsPage.tsx
  src/pages/__tests__/IntelligencePage.test.tsx
  src/pages/__tests__/IntelligenceBriefsPage.test.tsx
  src/constants/routes.ts
  src/router/routes.ts
```

## 实施任务

### Task 1: 锁定可迁移的情报数据库目录

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260718030000_intelligence_p0/migration.sql`
- Create: `backend/test/integration/prisma/intelligence-catalog.spec.ts`

- [ ] **Step 1: 写失败的 catalog 集成测试。**

  测试使用测试库的 `PrismaClient`，断言 `app` schema 已有 `intelligence_topics`、`intelligence_sources`、`intelligence_schedules`、`intelligence_runs`、`intelligence_items`、`intelligence_source_occurrences`、`intelligence_briefs`、`meeting_agenda_items`。创建主题、项目关联、来源、计划、卡片和来源出现，并读取 `pg_indexes` 断言 `intelligence_items_archived_at_published_at_idx` 与 `intelligence_source_occurrences_source_id_source_key_key` 存在。

  ```ts
  expect(await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'app' AND table_name = 'intelligence_items'
    ) AS "exists"
  `).toEqual([{ exists: true }])
  ```

- [ ] **Step 2: 运行测试，确认 RED。**

  Run: `cd backend && pnpm test:integration -- intelligence-catalog.spec.ts`

  Expected: FAIL，原因是情报 Prisma delegate 或表尚未存在；不得连接非 `_test` 数据库。

- [ ] **Step 3: 添加本计划“前向 Prisma 模型”中的全部模型、反向关系和索引。**

  迁移的关键约束必须显式落为 SQL：`"dedupe_key"` 唯一、`("source_id", "source_key")` 唯一、`("kind", "brief_date")` 唯一、任务/风险转换的目标 ID 唯一、简报条目的组合唯一。新表全部位于 `"app"`，日期时间使用 `TIMESTAMPTZ(6)`，`brief_date` 使用 `DATE`，数组默认 `ARRAY[]::TEXT[]`。审阅 `prisma migrate diff` 输出，移除任何 `DROP` 或无关改动。

- [ ] **Step 4: 生成 Prisma 客户端并让 catalog 测试变绿。**

  Run: `cd backend && pnpm prisma:generate && pnpm test:integration -- intelligence-catalog.spec.ts`

  Expected: PASS，且同一来源的重复 `sourceKey` 被数据库约束拒绝。

- [ ] **Step 5: 提交数据库结构。**

  ```bash
  git add backend/prisma/schema.prisma backend/prisma/migrations/20260718030000_intelligence_p0/migration.sql backend/test/integration/prisma/intelligence-catalog.spec.ts
  git commit -m "feat: add intelligence data model"
  ```

### Task 2: 实现主题、来源与手工计划配置 API

**Files:**
- Create: `backend/src/modules/workbench/intelligence/application/intelligence-reference.service.ts`
- Create: `backend/src/modules/workbench/intelligence/application/intelligence.service.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/intelligence-topics.controller.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/intelligence-sources.controller.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/intelligence-schedules.controller.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/dto/create-intelligence-topic.dto.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/dto/update-intelligence-topic.dto.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/dto/create-intelligence-source.dto.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/dto/update-intelligence-source.dto.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/dto/create-intelligence-schedule.dto.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/dto/update-intelligence-schedule.dto.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/dto/list-intelligence-query.dto.ts`
- Create: `backend/src/modules/workbench/intelligence/intelligence.module.ts`
- Modify: `backend/src/modules/workbench/workbench.module.ts`
- Modify: `backend/src/shared/errors/error-codes.ts`
- Test: `backend/test/unit/modules/workbench/intelligence.service.spec.ts`
- Test: `backend/test/integration/modules/workbench/intelligence.controller.spec.ts`

- [ ] **Step 1: 写主题、来源和计划的失败测试。**

  服务测试断言：主题创建会去重数组并拒绝不存在/归档项目；来源可信度 `0`、`6` 被 DTO 拒绝；`DAILY` 必须有 `runAtLocalTime`，`WEEKLY` 还必须有 1–7 的 `weekday`，`MANUAL` 不能保存时间或星期；归档来源不能新建计划。API 测试还要断言 `GET /api/intelligence-topics?page=1&pageSize=20` 只返回未归档记录，`DELETE` 返回 204 后列表不再出现。

  ```ts
  await request(app.getHttpServer())
    .post('/api/intelligence-schedules')
    .send({ sourceId, name: '工作日 09:00', frequency: 'DAILY' })
    .expect(400)
  ```

- [ ] **Step 2: 运行聚焦测试，确认 RED。**

  Run: `cd backend && pnpm test:unit -- intelligence.service.spec.ts && pnpm test:integration -- intelligence.controller.spec.ts`

  Expected: FAIL，因为模块、DTO 与路由尚不存在。

- [ ] **Step 3: 实现 DTO、引用校验和软归档服务。**

  `IntelligenceReferenceService.assertActiveProjectIds(tx, projectIds)` 必须去重输入、以 `id in projectIds AND archivedAt IS NULL` 查询，并在数量不一致时抛 `PROJECT_NOT_FOUND`。服务使用 `(archivedAt: null)` 作为每个主题、来源和计划详情/列表的固定过滤；更新主题时用 `deleteMany/createMany` 原子替换项目连接。计划验证应由服务和 DTO 同时执行，服务不可仅依赖前端。控制器使用资源复数名词和统一响应拦截器，不在 controller 直接访问 Prisma。

- [ ] **Step 4: 运行测试，确认 GREEN。**

  Run: `cd backend && pnpm test:unit -- intelligence.service.spec.ts && pnpm test:integration -- intelligence.controller.spec.ts`

  Expected: PASS，所有错误均是稳定错误码，且未知字段返回 400。

- [ ] **Step 5: 提交配置 API。**

  ```bash
  git add backend/src/modules/workbench/intelligence backend/src/modules/workbench/workbench.module.ts backend/src/shared/errors/error-codes.ts backend/test/unit/modules/workbench/intelligence.service.spec.ts backend/test/integration/modules/workbench/intelligence.controller.spec.ts
  git commit -m "feat: add intelligence source configuration"
  ```

### Task 3: 记录手工采集执行，不接入网络采集器

**Files:**
- Modify: `backend/src/modules/workbench/intelligence/application/intelligence.service.ts`
- Modify: `backend/src/modules/workbench/intelligence/interface/http/intelligence-schedules.controller.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/dto/create-intelligence-run.dto.ts`
- Test: `backend/test/unit/modules/workbench/intelligence.service.spec.ts`
- Test: `backend/test/integration/modules/workbench/intelligence.controller.spec.ts`

- [ ] **Step 1: 写失败测试，明确运行记录不是爬虫。**

  对一个启用计划 POST 运行结果，断言服务只调用 `intelligenceRun.create` 与计划 `lastRunAt` 更新，绝不调用 `fetch`、`axios`、`child_process` 或队列；`SUCCEEDED` 不可带 `errorMessage`，`FAILED` 必须带非空 `errorMessage`，`itemCount` 为非负整数；归档/禁用计划返回 422 `INTELLIGENCE_INVALID_SCHEDULE`。`GET /api/intelligence-runs?sourceId=...` 按 `startedAt desc` 返回记录。

  ```ts
  expect(prisma.intelligenceRun.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ trigger: 'MANUAL', status: 'FAILED' }) }),
  )
  expect(global.fetch).not.toHaveBeenCalled()
  ```

- [ ] **Step 2: 运行失败测试。**

  Run: `cd backend && pnpm test:unit -- intelligence.service.spec.ts && pnpm test:integration -- intelligence.controller.spec.ts`

  Expected: FAIL，因为运行写入和查询端点尚不存在。

- [ ] **Step 3: 实现 `recordManualRun` 与列表查询。**

  `recordManualRun(scheduleId, dto)` 在一个事务中读取活动的计划及其活动来源，写入 `IntelligenceRun`（`trigger: MANUAL`），然后将 `lastRunAt` 更新为 `finishedAt`。`startedAt` 缺省为当前 UTC；`finishedAt` 缺省为当前 UTC 且不得早于 `startedAt`。运行日志为不可编辑历史，控制器只暴露 POST 和 GET。不要安装 HTTP、RSS、浏览器自动化、定时器或 AI 依赖。

- [ ] **Step 4: 执行聚焦回归。**

  Run: `cd backend && pnpm test:unit -- intelligence.service.spec.ts && pnpm test:integration -- intelligence.controller.spec.ts`

  Expected: PASS，失败和成功运行均可追踪，且没有任何网络副作用。

- [ ] **Step 5: 提交手工运行记录。**

  ```bash
  git add backend/src/modules/workbench/intelligence backend/test/unit/modules/workbench/intelligence.service.spec.ts backend/test/integration/modules/workbench/intelligence.controller.spec.ts
  git commit -m "feat: record manual intelligence runs"
  ```

### Task 4: 以稳定去重键写入和管理规范化情报卡

**Files:**
- Modify: `backend/src/modules/workbench/intelligence/application/intelligence.service.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/intelligence-items.controller.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/dto/create-intelligence-item.dto.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/dto/update-intelligence-item.dto.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/dto/list-intelligence-items-query.dto.ts`
- Test: `backend/test/unit/modules/workbench/intelligence.service.spec.ts`
- Test: `backend/test/integration/modules/workbench/intelligence.controller.spec.ts`

- [ ] **Step 1: 写失败的去重与保护字段测试。**

  单测覆盖 URL 规范化（小写 host、移除 fragment、排序 query 参数）和无 URL SHA-256 两条路径；同 key 的第二次创建返回同一 item、写入第二个 `IntelligenceSourceOccurrence`，且第一个卡片的 `summary` 不变。相同 `sourceId/sourceKey` 的再次写入返回 `409 INTELLIGENCE_SOURCE_OCCURRENCE_EXISTS`。更新请求携带 `dedupeKey` 或 `sourceOccurrence` 时返回 400；归档后的卡片不参与默认列表。

  ```ts
  expect(buildDedupeKey({
    canonicalUrl: 'HTTPS://Example.com/news?b=2&a=1#part', title: 'ignored', body: 'ignored', publishedAt: null,
  })).toBe(buildDedupeKey({
    canonicalUrl: 'https://example.com/news?a=1&b=2', title: 'different', body: 'different', publishedAt: null,
  }))
  ```

- [ ] **Step 2: 运行失败测试。**

  Run: `cd backend && pnpm test:unit -- intelligence.service.spec.ts && pnpm test:integration -- intelligence.controller.spec.ts`

  Expected: FAIL，因为卡片、出现和去重函数尚不存在。

- [ ] **Step 3: 实现 `buildDedupeKey`、创建/查询/详情/更新/归档服务。**

  函数使用 Node `createHash('sha256')`；URL 解析失败时回退到标题日期正文 hash，不把原始链接当作可执行内容。创建操作必须在 transaction 内：验证来源/主题/项目活动状态，尝试按 `dedupeKey` 读取未归档卡片，创建或保留卡片，随后写入来源出现；遇唯一冲突必须重新读取已有卡片而不是返回 500。列表支持 `topicId`、`projectId`、`sourceId`、`priority`、`favorite`、`label`、`publishedFrom`、`publishedTo`、`q`，其中 `q` 仅做 `title/body/summary` 的 PostgreSQL `contains` 搜索，不执行原文中的任何 HTML 或脚本。详情返回 occurrences、topics、projects 和转换记录。

- [ ] **Step 4: 运行去重、列表和归档回归。**

  Run: `cd backend && pnpm test:unit -- intelligence.service.spec.ts && pnpm test:integration -- intelligence.controller.spec.ts`

  Expected: PASS，重复 URL/正文不产生第二张卡，人工摘要不被覆盖。

- [ ] **Step 5: 提交情报卡闭环。**

  ```bash
  git add backend/src/modules/workbench/intelligence backend/test/unit/modules/workbench/intelligence.service.spec.ts backend/test/integration/modules/workbench/intelligence.controller.spec.ts
  git commit -m "feat: add deduplicated intelligence items"
  ```

### Task 5: 让卡片关联、收藏与标签可查询

**Files:**
- Modify: `backend/src/modules/workbench/intelligence/application/intelligence.service.ts`
- Modify: `backend/src/modules/workbench/intelligence/interface/http/dto/create-intelligence-item.dto.ts`
- Modify: `backend/src/modules/workbench/intelligence/interface/http/dto/update-intelligence-item.dto.ts`
- Test: `backend/test/unit/modules/workbench/intelligence.service.spec.ts`
- Test: `backend/test/integration/modules/workbench/intelligence.controller.spec.ts`

- [ ] **Step 1: 写失败的关联替换和列表过滤测试。**

  创建带 `[topicA, topicB]`、`[projectA]`、`['政策','高优']` 标签和 `isFavorite: true` 的卡；PATCH 为 `[topicB]`、`[projectB]` 时断言旧 join 行被移除。按 `topicId`、`projectId`、`sourceId`、`favorite=true`、`label=政策` 的每个查询都精确返回该卡；`label` 的不存在值返回空数组而非 500。重复标签与重复 ID 应在 DTO/服务中去重。

- [ ] **Step 2: 运行聚焦测试并确认 RED。**

  Run: `cd backend && pnpm test:unit -- intelligence.service.spec.ts && pnpm test:integration -- intelligence.controller.spec.ts`

  Expected: FAIL，关联替换和过滤尚未实现。

- [ ] **Step 3: 实现原子关联写入和安全过滤。**

  创建使用 `createMany({ skipDuplicates: true })` 写 join；更新在同一个 transaction 中做 `deleteMany` 后 `createMany`，先验证全部项目与主题存在且未归档。`labels` 必须 trim、移除空值、保持输入顺序去重。查询针对 relation 使用 `some`，来源过滤针对 occurrences 使用 `some`，不拼接 SQL 字符串。

- [ ] **Step 4: 运行所有情报后端测试。**

  Run: `cd backend && pnpm test:unit -- intelligence.service.spec.ts && pnpm test:integration -- intelligence.controller.spec.ts`

  Expected: PASS，收藏、标记和项目/主题关联均可读回。

- [ ] **Step 5: 提交关联与筛选。**

  ```bash
  git add backend/src/modules/workbench/intelligence backend/test/unit/modules/workbench/intelligence.service.spec.ts backend/test/integration/modules/workbench/intelligence.controller.spec.ts
  git commit -m "feat: link intelligence items to projects"
  ```

### Task 6: 用真实领域对象实现三种人工转换

**Files:**
- Modify: `backend/src/modules/workbench/tasks/application/tasks.service.ts`
- Modify: `backend/src/modules/workbench/management/application/risks.service.ts`
- Modify: `backend/src/modules/workbench/management/application/meetings.service.ts`
- Modify: `backend/src/modules/workbench/management/interface/http/meetings.controller.ts`
- Modify: `backend/src/modules/workbench/intelligence/application/intelligence.service.ts`
- Modify: `backend/src/modules/workbench/intelligence/interface/http/intelligence-items.controller.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/dto/convert-intelligence-task.dto.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/dto/convert-intelligence-risk.dto.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/dto/create-intelligence-meeting-agenda.dto.ts`
- Test: `backend/test/unit/modules/workbench/intelligence.service.spec.ts`
- Test: `backend/test/unit/modules/workbench/tasks.service.spec.ts`
- Test: `backend/test/integration/modules/workbench/intelligence.controller.spec.ts`

- [ ] **Step 1: 写失败的原子转换测试。**

  任务转换测试断言一个事务内创建 `WorkTask` 和 `IntelligenceTaskConversion`，任务精确保存 `{ sourceType: 'INTELLIGENCE_ITEM', sourceId: item.id }`，重复转换同一 item/task 请求返回 `409 INTELLIGENCE_CONVERSION_EXISTS`。风险转换断言 `RisksService.createRiskInTransaction` 被调用、`IntelligenceRiskConversion` 写入且项目引用有效。会议议题转换断言 `MeetingAgendaItem` 被创建，随后 `GET /api/meetings/:id` 返回该议题及 `intelligenceItemId`；归档会议被拒绝。

  ```ts
  expect(createdTask).toMatchObject({ sourceType: 'INTELLIGENCE_ITEM', sourceId: item.id })
  expect(await prisma.intelligenceTaskConversion.count({ where: { taskId: createdTask.id } })).toBe(1)
  ```

- [ ] **Step 2: 运行失败测试。**

  Run: `cd backend && pnpm test:unit -- intelligence.service.spec.ts tasks.service.spec.ts && pnpm test:integration -- intelligence.controller.spec.ts`

  Expected: FAIL，因为各领域尚未导出事务内创建入口或转换路由尚不存在。

- [ ] **Step 3: 导出最小的事务内领域入口。**

  `TasksService.createTaskInTransaction(tx, dto)` 继续执行其全部任务引用、依赖、来源成对校验与健康度规则；不得由 intelligence service 直接访问 `tx.workTask.create`。`RisksService.createRiskInTransaction(tx, dto)` 同样复用风险引用和健康度规则；不得从 controller 调用另一个 controller。`MeetingsService.createIntelligenceAgendaInTransaction(tx, meetingId, dto)` 验证会议未归档、设置下一个 `sequence = max(sequence)+1`、创建议题。会议 detail/list select 必须 include `agendaItems`，使转换结果可见。

- [ ] **Step 4: 实现转换端点和幂等限制。**

  情报服务先锁定活动 item，再在单一 `$transaction` 调用上述入口并写转换表。任务转换 DTO 要求 `title`，风险转换要求管理域的 `title/likelihood/impact/level`，会议议题要求 `meetingId/title`。任务和风险创建后写唯一转换记录；若唯一约束冲突，整个事务回滚并返回 409。每个请求都只能使用用户显式提供的项目/会议，绝不自动猜测关联项目。

- [ ] **Step 5: 运行跨域回归。**

  Run: `cd backend && pnpm test:unit -- intelligence.service.spec.ts tasks.service.spec.ts && pnpm test:integration -- intelligence.controller.spec.ts tasks.controller.spec.ts management.controller.spec.ts`

  Expected: PASS，三种转换均可在目标领域工作台中查到，且任务来源链完整。

- [ ] **Step 6: 提交人工转换。**

  ```bash
  git add backend/src/modules/workbench/intelligence backend/src/modules/workbench/tasks/application/tasks.service.ts backend/src/modules/workbench/management backend/test/unit/modules/workbench backend/test/integration/modules/workbench
  git commit -m "feat: convert intelligence into work actions"
  ```

### Task 7: 生成可编辑的日报和周报快照

**Files:**
- Create: `backend/src/modules/workbench/intelligence/application/intelligence-briefs.service.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/intelligence-briefs.controller.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/dto/create-intelligence-brief.dto.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/dto/update-intelligence-brief.dto.ts`
- Modify: `backend/src/modules/workbench/intelligence/intelligence.module.ts`
- Test: `backend/test/unit/modules/workbench/intelligence-briefs.service.spec.ts`
- Test: `backend/test/integration/modules/workbench/intelligence.controller.spec.ts`

- [ ] **Step 1: 写失败的简报幂等和快照测试。**

  首次 POST `{ kind: 'DAILY', briefDate: '2026-07-18', itemIds: [a, b], introduction: '人工早报' }` 返回 201；同 kind/date 第二次 POST 返回 200、同一个 brief ID，并以输入顺序替换条目。归档卡片或重复 `itemIds` 返回 422；PATCH 修改 introduction 和条目后，详情依然返回写入时的 `title/summary/priority/publishedAt` 快照，即卡片随后更新不改变历史简报展示。

- [ ] **Step 2: 运行失败测试。**

  Run: `cd backend && pnpm test:unit -- intelligence-briefs.service.spec.ts && pnpm test:integration -- intelligence.controller.spec.ts`

  Expected: FAIL，因为简报服务、条目快照和路由尚不存在。

- [ ] **Step 3: 实现简报创建、更新、详情、列表和归档。**

  在 `IntelligenceBriefItem` 增加 `snapshot Json` 字段（同 Task 1 的迁移一起创建），包含 `{ title, summary, priority, publishedAt, canonicalUrl }`。服务为 `briefDate` 解析 UTC 日，不保存客户端时区偏移；用 `(kind, briefDate)` 唯一键在 transaction 内 upsert brief，然后完全替换其条目。默认标题分别为 `YYYY-MM-DD 行业情报日报` 和 `YYYY-MM-DD 行业情报周报`；用户提供的非空 title 优先。简报不自动挑选卡片、不发送消息、不产生 AI 内容。

- [ ] **Step 4: 运行简报和情报 API 回归。**

  Run: `cd backend && pnpm test:unit -- intelligence-briefs.service.spec.ts intelligence.service.spec.ts && pnpm test:integration -- intelligence.controller.spec.ts`

  Expected: PASS，重复生成不重复建简报，历史快照不随卡片改变。

- [ ] **Step 5: 提交简报功能。**

  ```bash
  git add backend/src/modules/workbench/intelligence backend/test/unit/modules/workbench/intelligence-briefs.service.spec.ts backend/test/integration/modules/workbench/intelligence.controller.spec.ts
  git commit -m "feat: add intelligence briefs"
  ```

### Task 8: 写前端类型化 API 与路由契约

**Files:**
- Modify: `frontend/src/modules/workbench/types.ts`
- Create: `frontend/src/modules/workbench/api/intelligence.ts`
- Create: `frontend/src/modules/workbench/api/__tests__/intelligence.contracts.test.ts`
- Modify: `frontend/src/constants/routes.ts`
- Modify: `frontend/src/router/routes.ts`
- Modify: `frontend/src/router/__tests__/routes.test.ts`

- [ ] **Step 1: 写失败的客户端和路由测试。**

  API 测试 mock `request`，断言 `listIntelligenceItems({ favorite: true, label: '政策' })` 请求 `/intelligence-items?favorite=true&label=%E6%94%BF%E7%AD%96`，转换任务发送 `POST /intelligence-items/{id}/task`，生成简报发送正确 JSON。类型测试要编译 `IntelligenceItem` 的 occurrences/topics/projects/conversions/briefs，拒绝 `any`。路由测试断言导航中同时含“情报”和“简报”，且既有首页、项目、任务、设置不消失。

- [ ] **Step 2: 运行前端测试并确认 RED。**

  Run: `cd frontend && pnpm test -- intelligence.contracts.test.ts routes.test.ts`

  Expected: FAIL，因为模块、类型和路由常量尚不存在。

- [ ] **Step 3: 实现精确 TypeScript 契约与 API 函数。**

  在 `types.ts` 定义与后端枚举一致的 union 和 `IntelligenceTopic`、`IntelligenceSource`、`IntelligenceSchedule`、`IntelligenceRun`、`IntelligenceItem`、`IntelligenceBrief`、分页结果；日期保持 `string | null`。`api/intelligence.ts` 只调用统一 `request`，实现列表、详情、创建、更新、归档、手工运行、三种转换、简报操作；查询参数通过 `URLSearchParams` 构造。注册 `ROUTES.INTELLIGENCE = '/intelligence'`、`ROUTES.INTELLIGENCE_BRIEFS = '/intelligence/briefs'` 和两个 lazy page。

- [ ] **Step 4: 运行类型/客户端/路由测试。**

  Run: `cd frontend && pnpm test -- intelligence.contracts.test.ts routes.test.ts && pnpm typecheck && pnpm typecheck:contracts`

  Expected: PASS，所有请求契约与路由都可编译。

- [ ] **Step 5: 提交前端契约。**

  ```bash
  git add frontend/src/modules/workbench/types.ts frontend/src/modules/workbench/api/intelligence.ts frontend/src/modules/workbench/api/__tests__/intelligence.contracts.test.ts frontend/src/constants/routes.ts frontend/src/router
  git commit -m "feat: add intelligence frontend contracts"
  ```

### Task 9: 构建情报工作台与人工录入体验

**Files:**
- Create: `frontend/src/modules/workbench/components/intelligence/TopicForm.tsx`
- Create: `frontend/src/modules/workbench/components/intelligence/SourceForm.tsx`
- Create: `frontend/src/modules/workbench/components/intelligence/IntelligenceItemForm.tsx`
- Create: `frontend/src/modules/workbench/components/intelligence/IntelligenceItemDetail.tsx`
- Create: `frontend/src/pages/IntelligencePage.tsx`
- Create: `frontend/src/pages/__tests__/IntelligencePage.test.tsx`
- Create: `frontend/src/modules/workbench/components/intelligence/__tests__/IntelligenceItemForm.test.tsx`
- Create: `frontend/src/modules/workbench/components/intelligence/__tests__/IntelligenceItemDetail.test.tsx`

- [ ] **Step 1: 写失败的组件测试。**

  表单测试断言标题、来源、来源 key 为必填；URL 空白时允许保存并由服务端 hash；输入重复 URL 后页面展示“已合并到已有情报卡”，不是第二条卡。页面测试用 MSW 覆盖加载、空态、错误态、主题/项目/收藏筛选；详情测试覆盖收藏切换、标签更新、来源出现列表，以及三种转换按钮打开各自的输入面板。

- [ ] **Step 2: 运行组件测试，确认 RED。**

  Run: `cd frontend && pnpm test -- IntelligencePage.test.tsx IntelligenceItemForm.test.tsx IntelligenceItemDetail.test.tsx`

  Expected: FAIL，因为页面和组件尚不存在。

- [ ] **Step 3: 实现桌面优先的情报页。**

  页面左侧为可折叠的主题/来源/计划管理区，主区为卡片列表和过滤栏，右侧为选中卡详情；小屏时按列表→详情堆叠。新建来源、主题、计划和手工运行均经 modal/drawer 表单调用真实 API。录入卡允许人工填写摘要、影响、建议动作、标签、项目/主题；原文仅作为纯文本显示，外部 URL 使用 `rel="noreferrer noopener" target="_blank"`，不通过 `dangerouslySetInnerHTML` 渲染 `body/rawBody`。每项 mutation 仅 invalidate 对应 query key，并保留明确的 loading/error/empty 状态。

- [ ] **Step 4: 实现真实转换交互。**

  任务面板收集 title、description、projectId、dueAt；风险面板收集 title、项目、可能性、影响、等级；会议议题面板加载活动会议后收集 meetingId、title、detail。成功后显示目标工作台的可点击引用，失败展示服务端错误 message/code；不在前端伪造任务、风险或会议记录。

- [ ] **Step 5: 运行前端回归并提交。**

  Run: `cd frontend && pnpm test -- IntelligencePage.test.tsx IntelligenceItemForm.test.tsx IntelligenceItemDetail.test.tsx && pnpm lint && pnpm typecheck && pnpm build`

  Expected: PASS，空数据不显示假情报，卡片原文不会执行 HTML。

  ```bash
  git add frontend/src/modules/workbench/components/intelligence frontend/src/pages/IntelligencePage.tsx frontend/src/pages/__tests__/IntelligencePage.test.tsx
  git commit -m "feat: add intelligence workbench"
  ```

### Task 10: 构建日报/周报页面并完成集成验证

**Files:**
- Create: `frontend/src/modules/workbench/components/intelligence/BriefForm.tsx`
- Create: `frontend/src/pages/IntelligenceBriefsPage.tsx`
- Create: `frontend/src/pages/__tests__/IntelligenceBriefsPage.test.tsx`
- Modify: `task_plan.md`
- Modify: `progress.md`
- Modify: `README.md` only if the documented API/navigation inventory otherwise omits the delivered module

- [ ] **Step 1: 写失败的简报页面测试。**

  使用 MSW 断言空态提示“尚无情报简报”；创建日报时用户选择多个卡片并调整排序，POST 后按快照展示标题/摘要/来源链接；重复日期创建显示“已更新当日简报”。测试周报使用同一组件的 `WEEKLY` 类型，并确认没有任何“AI 生成”或“自动发送”操作。

- [ ] **Step 2: 运行测试并确认 RED。**

  Run: `cd frontend && pnpm test -- IntelligenceBriefsPage.test.tsx`

  Expected: FAIL，因为简报页面和表单尚不存在。

- [ ] **Step 3: 实现人工简报页面。**

  提供日报/周报切换、日期选择、候选卡选择与排序、人工标题/导语编辑、保存/归档、简报详情。详情只展示卡片快照，链接显式标记外部站点；无 AI 按钮、无后台定时器、无网络抓取。保存后刷新简报列表和当前详情，不重取无关页面数据。

- [ ] **Step 4: 运行完整验证。**

  ```bash
  cd backend && pnpm prisma:generate && pnpm test:unit && pnpm test:integration && pnpm test:e2e && pnpm lint && pnpm build
  cd ../frontend && pnpm test && pnpm lint && pnpm typecheck && pnpm typecheck:contracts && pnpm build
  ```

  Expected: 所有命令退出码为 0。之后只针对已明确配置的本地工作台数据库运行 `cd backend && pnpm prisma:migrate:deploy`；绝不使用 `migrate reset`、`db push`、删除数据库或修改其他项目端口。

- [ ] **Step 5: 做本地烟测并记录观察结果。**

  启动后端和前端既有开发命令，访问 `/intelligence`：创建来源、主题、计划和一条手工运行失败记录；录入一条卡片并重复录入同 URL，确认只出现一张卡和两条来源出现；将卡片转一条任务、一个风险和一个会议议题；创建日报并刷新页面。核对 API 仍只绑定工作台既有 loopback 端口。

- [ ] **Step 6: 审阅、迁移、合并并更新进度。**

  先安排独立 spec review，再安排 code-quality review；修复发现的问题并重跑受影响命令。确认 review 均通过后把已审阅分支合入 `main`，在 `main` 对本地数据库安全执行前向迁移，再更新 `task_plan.md`/`progress.md` 记录实际测试输出和迁移结果。

  ```bash
  git add frontend/src/modules/workbench/components/intelligence/BriefForm.tsx frontend/src/pages/IntelligenceBriefsPage.tsx frontend/src/pages/__tests__/IntelligenceBriefsPage.test.tsx task_plan.md progress.md
  git commit -m "feat: complete intelligence briefing workspace"
  ```

## 自检清单

- [ ] 主题、来源、计划、手工运行、卡片、来源出现、收藏/标签、项目关联、三种转换、日报和周报都对应至少一个实施任务和自动化测试。
- [ ] 去重键、来源出现唯一键、简报幂等键和转换唯一键均由数据库约束保障，服务层把约束冲突转换为稳定错误码。
- [ ] P0 没有任何真实爬虫、RSS 请求、浏览器自动化、定时任务、AI 摘要、AI 周报或自动发送代码/依赖。
- [ ] 情报正文在前端始终作为不可信纯文本显示；链接不开启原生窗口或内嵌脚本。
- [ ] 前向迁移、测试库验证、生产本地库 `migrate:deploy`、双重审阅、合入 `main` 和烟测都有明确步骤。
