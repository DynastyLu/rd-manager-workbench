# 管理闭环 P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在本地研发主管工作台中交付可追踪的风险、问题、决策、合作方/沟通、会议/行动项闭环，并将未关闭高风险纳入项目健康度。

**Architecture:** 后端仍以 `backend/src/modules/workbench` 的 Nest 模块为边界，以 Prisma 的 `app` schema 保存各域对象；每个资源的删除均写入 `archivedAt`，列表默认排除已归档记录。风险、问题和决策用可选外键关联已有项目、里程碑和任务；会议行动项与沟通/决策的“生成任务”统一通过现有 `WorkTask.sourceType/sourceId` 追溯来源，转换操作使用同一数据库事务以确保任务与来源记录一致。

**Tech Stack:** NestJS、Prisma/PostgreSQL、class-validator、Vitest/Jest/Supertest、React 19、React Router、TanStack Query、shadcn/Tailwind。

---

## 已确认的范围与不可变规则

- P0 包括：风险（概率、影响、等级、措施、责任人、状态、关闭日期）、问题/阻塞（影响对象、方案、期限、验证结果）、决策（背景、备选方案、依据、结论、参与人、后续任务）、合作方/联系人/协议/沟通/待对方事项、会议议程/纪要/决策/行动项。
- `Risk`、`Issue`、`Decision` 均可选关联一个未归档的 `Project`、`Milestone`、`WorkTask`；如同时提供 `milestoneId`，它必须属于 `projectId`。如同时提供 `taskId`，任务必须未归档，且若对象带 `projectId`，任务项目必须相同。
- 普通手工任务可以没有来源；由 `MeetingAction`、`CommunicationRecord` 或 `Decision` 生成的任务必须同时写入非空 `sourceType` 和 `sourceId`。API 必须拒绝只给其中一个的任务写入。
- `POST /meeting-actions/:id/task`：先创建或读取行动项，再在同一事务创建 `WorkTask`，以 `sourceType: 'MEETING_ACTION'`、`sourceId: meetingAction.id` 写入，并把任务 ID 回填至 `MeetingAction.taskId`。若行动项已经有 `taskId`，返回 `409 MEETING_ACTION_TASK_EXISTS`，绝不重复生成。
- `POST /communications/:id/task` 与 `POST /decisions/:id/task` 使用相同的原子转换语义，来源分别为 `COMMUNICATION`、`DECISION`；来源记录归档后保留历史任务的来源字段，不级联删除任务。
- 删除风险、问题、决策、合作方、联系人、协议、沟通和会议均为软归档；归档合作方时拒绝其仍有未归档联系人/协议/沟通的情况，调用方必须先逐项归档，避免静默丢失业务链路。会议归档前拒绝存在未归档且未关闭的行动项。
- 项目健康度在现有“延期里程碑、关键任务逾期、任务逾期、临期里程碑”基础上，增加未关闭 `HIGH` 与 `CRITICAL` 风险数；有任一未关闭高风险时为 `RED`，并在快照原因中包含 `"N 项高风险未关闭"`。风险创建、更新、关闭、归档及关联项目变化后都要在同一事务刷新旧/新项目的快照。
- 所有日期保存 UTC `DateTime`，HTTP 输入使用 ISO-8601；前端仅负责本机时区显示。列表遵循既有 `{ data, meta: { page, pageSize, total } }` 返回结构和 `page/pageSize`（默认 20、最大 100）。

## 计划中的文件结构

### 数据库与跨域健康度

- Modify: `backend/prisma/schema.prisma` — 新增管理闭环枚举、模型、关联与索引；给既有 `Project`/`Milestone`/`WorkTask` 添加反向关系。
- Create: `backend/prisma/migrations/20260718020000_management_loop_p0/migration.sql` — 仅前向创建 enum/table/index/FK，绝不 `DROP`、`db push` 或重建数据库。
- Modify: `backend/src/modules/workbench/projects/application/project-health.service.ts` — 接受并处理 `openHighRisks`。
- Create: `backend/src/modules/workbench/projects/application/project-health-snapshot.service.ts` — 在事务内取得项目级 advisory lock、统计健康度输入并写入快照。
- Modify: `backend/src/modules/workbench/tasks/application/tasks.service.ts` — 使用新的快照服务；为来源成对字段增加校验；公开受控的事务内来源任务创建入口。
- Modify: `backend/src/modules/workbench/projects/projects.module.ts` — 注册并导出快照服务。

### 后端管理域

- Create: `backend/src/modules/workbench/management/management.module.ts` — 组合风险、问题、决策、合作方和会议模块，导入 `ProjectsModule` 与 `TasksModule`。
- Create: `backend/src/modules/workbench/management/application/management-reference.service.ts` — 校验项目/里程碑/任务与合作方关联的活动状态和项目一致性。
- Create: `backend/src/modules/workbench/management/application/risks.service.ts`
- Create: `backend/src/modules/workbench/management/application/issues.service.ts`
- Create: `backend/src/modules/workbench/management/application/decisions.service.ts`
- Create: `backend/src/modules/workbench/management/application/partners.service.ts`
- Create: `backend/src/modules/workbench/management/application/meetings.service.ts`
- Create: `backend/src/modules/workbench/management/interface/http/risks.controller.ts`
- Create: `backend/src/modules/workbench/management/interface/http/issues.controller.ts`
- Create: `backend/src/modules/workbench/management/interface/http/decisions.controller.ts`
- Create: `backend/src/modules/workbench/management/interface/http/partners.controller.ts`
- Create: `backend/src/modules/workbench/management/interface/http/meetings.controller.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/*.dto.ts` — 每个请求体和列表查询各自一个 DTO，不复用 `any`。
- Modify: `backend/src/modules/workbench/workbench.module.ts` — 导入 `ManagementModule`。
- Modify: `backend/src/shared/errors/error-codes.ts` — 仅添加本计划定义的稳定错误码。

### 前端

- Modify: `frontend/src/modules/workbench/types.ts` — 管理闭环枚举、实体、分页类型和任务转换返回类型。
- Create: `frontend/src/modules/workbench/api/management.ts` — 对应全部 REST 资源的强类型客户端，不在组件内拼 URL。
- Create: `frontend/src/modules/workbench/components/management/RiskForm.tsx`
- Create: `frontend/src/modules/workbench/components/management/IssueForm.tsx`
- Create: `frontend/src/modules/workbench/components/management/DecisionForm.tsx`
- Create: `frontend/src/modules/workbench/components/management/PartnerForm.tsx`
- Create: `frontend/src/modules/workbench/components/management/CommunicationForm.tsx`
- Create: `frontend/src/modules/workbench/components/management/MeetingForm.tsx`
- Create: `frontend/src/modules/workbench/components/management/MeetingActionForm.tsx`
- Create: `frontend/src/pages/RisksPage.tsx`
- Create: `frontend/src/pages/IssuesPage.tsx`
- Create: `frontend/src/pages/DecisionsPage.tsx`
- Create: `frontend/src/pages/PartnersPage.tsx`
- Create: `frontend/src/pages/MeetingsPage.tsx`
- Modify: `frontend/src/constants/routes.ts` and `frontend/src/router/routes.ts` — 注册五条懒加载导航路由，不移除现有首页/项目/任务/设置。

### 测试

- Modify: `backend/test/unit/modules/workbench/project-health.service.spec.ts`
- Modify: `backend/test/unit/modules/workbench/tasks.service.spec.ts`
- Create: `backend/test/unit/modules/workbench/management-reference.service.spec.ts`
- Create: `backend/test/unit/modules/workbench/risks.service.spec.ts`
- Create: `backend/test/unit/modules/workbench/meetings.service.spec.ts`
- Create: `backend/test/integration/prisma/management-loop-catalog.spec.ts`
- Create: `backend/test/integration/modules/workbench/management.controller.spec.ts`
- Create: `frontend/src/modules/workbench/api/__tests__/management.contracts.test.ts`
- Create: `frontend/src/modules/workbench/components/management/__tests__/*.test.tsx`
- Create: `frontend/src/pages/__tests__/RisksPage.test.tsx`
- Create: `frontend/src/pages/__tests__/IssuesPage.test.tsx`
- Create: `frontend/src/pages/__tests__/DecisionsPage.test.tsx`
- Create: `frontend/src/pages/__tests__/PartnersPage.test.tsx`
- Create: `frontend/src/pages/__tests__/MeetingsPage.test.tsx`
- Modify: `frontend/src/router/__tests__/routes.test.ts` — 断言新增导航顺序。

## 数据模型和 HTTP 契约

### Prisma 枚举与实体

在 `schema.prisma` 中精确加入以下枚举：

```prisma
enum RiskLikelihood { LOW MEDIUM HIGH @@schema("app") }
enum RiskImpact { LOW MEDIUM HIGH CRITICAL @@schema("app") }
enum RiskLevel { LOW MEDIUM HIGH CRITICAL @@schema("app") }
enum RiskStatus { OPEN MITIGATING CLOSED @@schema("app") }
enum IssueStatus { OPEN IN_PROGRESS RESOLVED CLOSED @@schema("app") }
enum DecisionStatus { DRAFT DECIDED SUPERSEDED @@schema("app") }
enum AgreementStatus { DRAFT ACTIVE EXPIRED TERMINATED @@schema("app") }
enum CommunicationType { EMAIL PHONE MEETING CHAT VISIT OTHER @@schema("app") }
enum MeetingStatus { PLANNED HELD CANCELLED @@schema("app") }
enum MeetingActionStatus { OPEN IN_PROGRESS DONE CANCELLED @@schema("app") }
```

实体字段（全部还含有 `id String @id @default(cuid())`、`createdAt`、`updatedAt`、`archivedAt`；所有表 `@@schema("app")`）如下，关系名按字段含义显式命名，避免 Prisma 多关系歧义：

```text
Risk: projectId?, milestoneId?, taskId?, title, description?, likelihood,
      impact, level, mitigation?, ownerName?, status, closedAt?
Issue: projectId?, milestoneId?, taskId?, title, description?, impactObject?,
       proposedResolution?, ownerName?, dueAt?, verificationResult?, status, closedAt?
Decision: projectId?, milestoneId?, taskId?, meetingId?, title, background?,
          alternatives Json, basis?, conclusion?, participantNames String[], status, decidedAt?
Partner: name, shortName?, category?, address?, notes?
PartnerContact: partnerId, name, title?, phone?, email?, notes?
PartnerAgreement: partnerId, title, agreementNo?, status, startAt?, endAt?, notes?
CommunicationRecord: partnerId, projectId?, contactId?, type, occurredAt, subject,
                     summary?, promises?, ownerName?, nextFollowUpAt?, archivedAt
Meeting: projectId?, title, scheduledAt, heldAt?, status, agenda?, minutes?, participantNames String[]
MeetingAction: meetingId, title, description?, ownerName?, dueAt?, status, taskId? @unique
```

外键规则：`projectId`、`milestoneId`、`taskId`、`meetingId`、`partnerId`、`contactId` 均为 `onDelete: SetNull` 或关系所需的 `Restrict`；由于应用层统一软归档，数据库 FK 不可对业务表做 `Cascade`。`MeetingAction.meetingId` 和联系人/协议/沟通的 `partnerId` 是必填关联，用 `onDelete: Restrict`。为所有主列表添加复合索引：`[projectId, archivedAt, status]`、`[partnerId, archivedAt, occurredAt]`、`[meetingId, archivedAt, dueAt]`，并分别加 `dueAt`/`nextFollowUpAt`/`scheduledAt` 索引。

### REST 路由

```text
GET/POST/PATCH/DELETE /api/risks
GET/POST/PATCH/DELETE /api/issues
GET/POST/PATCH/DELETE /api/decisions
POST /api/decisions/:id/task
GET/POST/PATCH/DELETE /api/partners
GET/POST/PATCH/DELETE /api/partners/:partnerId/contacts
GET/POST/PATCH/DELETE /api/partners/:partnerId/agreements
GET/POST/PATCH/DELETE /api/partners/:partnerId/communications
POST /api/communications/:id/task
GET/POST/PATCH/DELETE /api/meetings
GET/POST/PATCH/DELETE /api/meetings/:meetingId/actions
POST /api/meeting-actions/:id/task
```

`GET` 单项使用 `/:id`；嵌套资源的 `PATCH/DELETE` 路径追加 `/:childId`。每个 `DELETE` 返回 `204` 并仅设置 `archivedAt`。创建/更新成功返回统一拦截器包装后的 `{ success: true, data }`，列表返回 `{ success: true, data: { data, meta } }`。所有未知字段由全局 `forbidNonWhitelisted` 拒绝。

稳定错误码：`RISK_NOT_FOUND`、`ISSUE_NOT_FOUND`、`DECISION_NOT_FOUND`、`PARTNER_NOT_FOUND`、`PARTNER_CONTACT_NOT_FOUND`、`PARTNER_AGREEMENT_NOT_FOUND`、`COMMUNICATION_NOT_FOUND`、`MEETING_NOT_FOUND`、`MEETING_ACTION_NOT_FOUND`、`MANAGEMENT_REFERENCE_INVALID`、`PARTNER_HAS_ACTIVE_RECORDS`、`MEETING_HAS_OPEN_ACTIONS`、`MEETING_ACTION_TASK_EXISTS`、`SOURCE_REFERENCE_INCOMPLETE`。

## 实施任务

### Task 1: 先锁定 Prisma 目录和前向迁移

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260718020000_management_loop_p0/migration.sql`
- Test: `backend/test/integration/prisma/management-loop-catalog.spec.ts`

- [ ] **Step 1: 写失败的 catalog 迁移测试。**

  测试用独立的 `PrismaClient` 查询 `app` schema，并断言 `risks`、`issues`、`decisions`、`partners`、`partner_contacts`、`partner_agreements`、`communication_records`、`meetings`、`meeting_actions` 已存在；创建一条项目、会议和行动项，确认 `taskId` 可为空且唯一约束实际存在。测试还应读取 `pg_indexes`，断言 `risks_project_id_archived_at_status_idx` 与 `meeting_actions_meeting_id_archived_at_due_at_idx` 存在。

  ```ts
  expect(await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS(SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'app' AND table_name = 'meeting_actions') AS "exists"
  `).toEqual([{ exists: true }])
  ```

- [ ] **Step 2: 运行 catalog 测试并确认因表不存在而失败。**

  Run: `cd backend && pnpm test:integration -- management-loop-catalog.spec.ts`

  Expected: FAIL，报出管理闭环表或 Prisma delegate 不存在；不得因连接到非 `_test` 数据库失败。

- [ ] **Step 3: 在 schema 与迁移中实现完整的前向结构。**

  用本计划“Prisma 枚举与实体”中的精确字段新增模型、反向关系、索引和 enum。迁移 SQL 只能 `CREATE TYPE`、`CREATE TABLE`、`CREATE INDEX`、`ALTER TABLE ... ADD CONSTRAINT`；新表建于 `"app"`，时间列为 `TIMESTAMPTZ(6)`，数组默认 `ARRAY[]::TEXT[]`。生成迁移后逐行检查，删除任何 `DROP`、数据库重建或无关 schema 变化。

- [ ] **Step 4: 生成客户端并让 catalog 测试变绿。**

  Run: `cd backend && pnpm prisma:generate && pnpm test:integration -- management-loop-catalog.spec.ts`

  Expected: PASS，测试数据库应用前向迁移后可创建各实体，且索引存在。

- [ ] **Step 5: 提交数据库结构。**

  ```bash
  git add backend/prisma/schema.prisma backend/prisma/migrations/20260718020000_management_loop_p0/migration.sql backend/test/integration/prisma/management-loop-catalog.spec.ts
  git commit -m "feat: add management loop data model"
  ```

### Task 2: 把项目健康快照抽成可复用的事务服务

**Files:**
- Modify: `backend/src/modules/workbench/projects/application/project-health.service.ts`
- Create: `backend/src/modules/workbench/projects/application/project-health-snapshot.service.ts`
- Modify: `backend/src/modules/workbench/projects/projects.module.ts`
- Modify: `backend/src/modules/workbench/tasks/application/tasks.service.ts`
- Test: `backend/test/unit/modules/workbench/project-health.service.spec.ts`
- Test: `backend/test/unit/modules/workbench/tasks.service.spec.ts`

- [ ] **Step 1: 为高风险健康度写失败单测。**

  在现有 `ProjectHealthService` 测试新增两个独立断言：`openHighRisks: 1`、其余计数均为零时结果为 `RED` 且理由精确为 `['1 项高风险未关闭']`；`openHighRisks: 0` 保持现有绿黄红规则。为快照服务写 mock transaction 测试，断言统计风险的 where 至少包含 `projectId`、`archivedAt: null`、`status: { not: RiskStatus.CLOSED }`、`level: { in: [RiskLevel.HIGH, RiskLevel.CRITICAL] }`。

- [ ] **Step 2: 运行单测并确认新字段/服务尚不存在。**

  Run: `cd backend && pnpm test:unit -- project-health.service.spec.ts tasks.service.spec.ts`

  Expected: FAIL，原因应为 `openHighRisks` 未被处理或快照服务未导出。

- [ ] **Step 3: 实现快照服务并替换重复计算。**

  `ProjectHealthSnapshotService.recalculate(tx, projectId)` 必须：

  ```ts
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`rd-manager-workbench:project-health:${projectId}`}))`,
  )
  const [missedMilestones, dueSoonMilestones, overdueTasks, overdueCriticalTasks, openHighRisks] = await Promise.all([...])
  const result = this.projectHealthService.calculate({
    today: now, missedMilestones, dueSoonMilestones, overdueTasks, overdueCriticalTasks, openHighRisks,
  })
  await tx.projectHealthSnapshot.create({ data: { projectId, health: result.health, reasons: result.reasons, calculatedAt: now } })
  ```

  将 `TasksService` 的私有 `recalculateHealth` 替换为此服务，保留任务图锁；不要改变完成依赖、软归档、`completedAt` 的既有语义。模块导出快照服务，供管理模块注入。

- [ ] **Step 4: 运行相关回归测试。**

  Run: `cd backend && pnpm test:unit -- project-health.service.spec.ts tasks.service.spec.ts && pnpm test:integration -- tasks.controller.spec.ts`

  Expected: PASS，既有任务健康度和新高风险理由都通过。

- [ ] **Step 5: 提交可复用健康度服务。**

  ```bash
  git add backend/src/modules/workbench/projects backend/src/modules/workbench/tasks/application/tasks.service.ts backend/test/unit/modules/workbench/project-health.service.spec.ts backend/test/unit/modules/workbench/tasks.service.spec.ts
  git commit -m "refactor: share project health snapshots"
  ```

### Task 3: 强化任务来源契约并提供事务内创建入口

**Files:**
- Modify: `backend/src/modules/workbench/tasks/application/tasks.service.ts`
- Modify: `backend/src/modules/workbench/tasks/interface/http/dto/create-task.dto.ts`
- Modify: `backend/src/modules/workbench/tasks/interface/http/dto/update-task.dto.ts`
- Test: `backend/test/unit/modules/workbench/tasks.service.spec.ts`
- Test: `backend/test/integration/modules/workbench/tasks.controller.spec.ts`

- [ ] **Step 1: 写失败的来源成对校验测试。**

  对 `POST /api/tasks` 和 `PATCH /api/tasks/:id` 分别发送只有 `sourceType` 或只有 `sourceId` 的载荷，断言 `422` 及错误码 `SOURCE_REFERENCE_INCOMPLETE`；发送两个非空字段时断言 `201/200` 并原样持久化。保留“两个字段均未提供”的手工任务成功测试。

- [ ] **Step 2: 运行测试确认失败原因正确。**

  Run: `cd backend && pnpm test:integration -- tasks.controller.spec.ts`

  Expected: FAIL，因为当前服务允许半来源任务。

- [ ] **Step 3: 实现来源校验和可组合创建 API。**

  `TasksService` 新增以下受控方法，供管理服务在外层 Prisma transaction 中调用；它必须运行原有引用、完成依赖和项目快照逻辑，不得绕过规则：

  ```ts
  async createTaskInTransaction(
    tx: Prisma.TransactionClient,
    dto: CreateTaskDto,
  ): Promise<WorkTaskResponse>
  ```

  在 `createTask` 内保持 `this.prisma.$transaction((tx) => this.createTaskInTransaction(tx, dto))`。对创建和合并后的更新候选调用 `assertCompleteSourceReference`：两个值同为 `undefined/null` 合法；恰有一个为字符串、或空白字符串，抛 `AppError`（422、`SOURCE_REFERENCE_INCOMPLETE`）。DTO 继续 trim 字符串，禁止使用前端校验替代服务层校验。

- [ ] **Step 4: 运行任务完整测试。**

  Run: `cd backend && pnpm test:unit -- tasks.service.spec.ts && pnpm test:integration -- tasks.controller.spec.ts`

  Expected: PASS，来源规则新增且所有既有任务依赖/归档用例保持通过。

- [ ] **Step 5: 提交来源契约。**

  ```bash
  git add backend/src/modules/workbench/tasks backend/test/unit/modules/workbench/tasks.service.spec.ts backend/test/integration/modules/workbench/tasks.controller.spec.ts
  git commit -m "feat: enforce task source references"
  ```

### Task 4: 风险、问题与关联引用 API

**Files:**
- Create: `backend/src/modules/workbench/management/application/management-reference.service.ts`
- Create: `backend/src/modules/workbench/management/application/risks.service.ts`
- Create: `backend/src/modules/workbench/management/application/issues.service.ts`
- Create: `backend/src/modules/workbench/management/interface/http/risks.controller.ts`
- Create: `backend/src/modules/workbench/management/interface/http/issues.controller.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/create-risk.dto.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/update-risk.dto.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/list-risks-query.dto.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/create-issue.dto.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/update-issue.dto.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/list-issues-query.dto.ts`
- Modify: `backend/src/shared/errors/error-codes.ts`
- Test: `backend/test/unit/modules/workbench/management-reference.service.spec.ts`
- Test: `backend/test/unit/modules/workbench/risks.service.spec.ts`
- Test: `backend/test/integration/modules/workbench/management.controller.spec.ts`

- [ ] **Step 1: 写失败的引用和风险闭环测试。**

  单测 `assertReference`：缺失项目抛 `PROJECT_NOT_FOUND`；里程碑不属于项目或任务项目不一致抛 `MANAGEMENT_REFERENCE_INVALID`。集成测试依次创建项目、任务、风险，然后：

  ```ts
  const risk = await request(app.getHttpServer()).post('/api/risks').send({
    projectId, taskId, title: `${prefix} 高风险`, likelihood: 'HIGH', impact: 'CRITICAL',
    level: 'CRITICAL', ownerName: '研发主管', status: 'OPEN',
  }).expect(201)
  expect((await latestSnapshot(projectId)).health).toBe('RED')
  await request(app.getHttpServer()).patch(`/api/risks/${risk.body.data.id}`).send({ status: 'CLOSED' }).expect(200)
  expect((await latestSnapshot(projectId)).reasons).not.toContain('1 项高风险未关闭')
  ```

  再测试问题创建、筛选 `projectId/status/dueBefore/overdue`、关闭时需要 `verificationResult`、归档后不出现在列表。

- [ ] **Step 2: 运行测试并确认 API 尚未注册。**

  Run: `cd backend && pnpm test:unit -- management-reference.service.spec.ts risks.service.spec.ts && pnpm test:integration -- management.controller.spec.ts`

  Expected: FAIL，因模块/路由/服务未定义，而不是断言拼写错误。

- [ ] **Step 3: 实现 DTO、引用服务与风险/问题服务。**

  `CreateRiskDto` 必填 `title/likelihood/impact/level`，其余字段按范围可选；`CreateIssueDto` 必填 `title`；更新 DTO 用 `ValidateIf` 保持 null/undefined 语义与现有任务一致。`IssuesService` 在 `status: 'CLOSED'` 时要求非空 `verificationResult`，并设置 `closedAt`；从 CLOSED 改回其他状态清除 `closedAt`。风险从 CLOSED 改回其他状态清除 `closedAt`。每个写操作均：校验归档引用、在 transaction 内更新、对受影响项目 ID 集合调用 `ProjectHealthSnapshotService.recalculate`。

  `RisksService.list`、`IssuesService.list` 使用下列等价 where 结构并按 `updatedAt desc, id desc` 排序：

  ```ts
  const where = {
    archivedAt: null,
    ...(query.projectId ? { projectId: query.projectId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.overdue ? { dueAt: { lt: now }, status: { notIn: ['CLOSED', 'RESOLVED'] } } : {}),
  }
  ```

- [ ] **Step 4: 注册路由并运行风险/问题测试。**

  将 controller 放入 `ManagementModule`，模块暂时只导入其所需的 `ProjectsModule`/`TasksModule`。Run: `cd backend && pnpm test:unit -- management-reference.service.spec.ts risks.service.spec.ts && pnpm test:integration -- management.controller.spec.ts`

  Expected: PASS，风险影响健康快照，问题验证和软归档规则都可观察。

- [ ] **Step 5: 提交风险与问题闭环。**

  ```bash
  git add backend/src/modules/workbench/management backend/src/shared/errors/error-codes.ts backend/test/unit/modules/workbench/management-reference.service.spec.ts backend/test/unit/modules/workbench/risks.service.spec.ts backend/test/integration/modules/workbench/management.controller.spec.ts
  git commit -m "feat: add risks and issues management"
  ```

### Task 5: 决策记录及其后续任务转换

**Files:**
- Create: `backend/src/modules/workbench/management/application/decisions.service.ts`
- Create: `backend/src/modules/workbench/management/interface/http/decisions.controller.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/create-decision.dto.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/update-decision.dto.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/list-decisions-query.dto.ts`
- Modify: `backend/src/modules/workbench/management/management.module.ts`
- Test: `backend/test/integration/modules/workbench/management.controller.spec.ts`

- [ ] **Step 1: 写失败的决策/任务来源集成测试。**

  创建决定时发送 `alternatives: ['方案 A', '方案 B']`、参与人、项目和任务；断言返回的 `alternatives` 是数组、`status: 'DECIDED'` 时自动设置 `decidedAt`。调用 `POST /api/decisions/:id/task` 发送 `{ title, dueAt, assigneeName, priority }`，断言返回任务有 `sourceType: 'DECISION'`、`sourceId: decision.id`。归档决策后确认该任务仍能通过 `/api/tasks/:id` 读取来源字段。

- [ ] **Step 2: 运行测试确认路由不存在。**

  Run: `cd backend && pnpm test:integration -- management.controller.spec.ts`

  Expected: FAIL，`/api/decisions` 为 404。

- [ ] **Step 3: 实现决策 DTO、服务和 controller。**

  `alternatives` 只接受字符串数组；创建和更新均 trim 每项、拒绝空值/重复项。创建 `DECIDED` 决策默认 `decidedAt: new Date()`，更新为 `DECIDED` 时仅在状态转变设置它，重开为 `DRAFT` 时清空。`createFollowUpTask` 在一个 `$transaction` 中先查找未归档决策，再调用 `tasksService.createTaskInTransaction(tx, { ...dto, sourceType: 'DECISION', sourceId: decision.id })`。它不能让请求体覆盖两项来源字段。

- [ ] **Step 4: 运行决策测试。**

  Run: `cd backend && pnpm test:integration -- management.controller.spec.ts && pnpm test:unit -- tasks.service.spec.ts`

  Expected: PASS，决策转换任务可追溯且没有破坏通用来源校验。

- [ ] **Step 5: 提交决策功能。**

  ```bash
  git add backend/src/modules/workbench/management backend/test/integration/modules/workbench/management.controller.spec.ts
  git commit -m "feat: add decision records and follow-up tasks"
  ```

### Task 6: 合作方、联系人、协议与沟通记录

**Files:**
- Create: `backend/src/modules/workbench/management/application/partners.service.ts`
- Create: `backend/src/modules/workbench/management/interface/http/partners.controller.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/create-partner.dto.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/update-partner.dto.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/create-partner-contact.dto.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/update-partner-contact.dto.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/create-partner-agreement.dto.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/update-partner-agreement.dto.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/create-communication.dto.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/update-communication.dto.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/list-partners-query.dto.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/list-communications-query.dto.ts`
- Test: `backend/test/integration/modules/workbench/management.controller.spec.ts`

- [ ] **Step 1: 写失败的合作方生命周期测试。**

  创建合作方、联系人、协议和沟通记录；沟通记录带 `nextFollowUpAt` 与 `promises`，断言按 `nextFollowUpBefore` 可筛选。对沟通调用 `/api/communications/:id/task`，断言任务来源为 `COMMUNICATION`。尝试归档仍有联系人/协议/沟通的合作方，断言 `409 PARTNER_HAS_ACTIVE_RECORDS`；逐项归档后合作方归档成功且默认列表不返回它。

- [ ] **Step 2: 运行测试确认失败。**

  Run: `cd backend && pnpm test:integration -- management.controller.spec.ts`

  Expected: FAIL，因为合作方端点不存在。

- [ ] **Step 3: 实现 Partner 聚合服务。**

  `getPartner` 返回未归档联系人、协议、沟通并按最近更新时间排序；`createCommunication` 必须验证 `contactId` 属于同一合作方且未归档，`projectId`（若提供）必须未归档。`archivePartner` 统计 `partnerContact/partnerAgreement/communicationRecord` 的 `archivedAt: null`，任一大于 0 就抛冲突。所有 child `PATCH/DELETE` 均同时验证父 `partnerId`，防止跨合作方 ID 访问。

- [ ] **Step 4: 实现沟通转任务的原子路径。**

  使用与决策相同的外层 transaction：查找未归档沟通、调用 `createTaskInTransaction`，强制覆盖来源为 `COMMUNICATION/communication.id`。任务创建失败时整个 transaction 回滚，沟通记录不得被修改为“已转换”。

- [ ] **Step 5: 运行合作方完整回归。**

  Run: `cd backend && pnpm test:integration -- management.controller.spec.ts && pnpm lint && pnpm build`

  Expected: PASS，包含关系约束、软归档、沟通跟进筛选与来源任务。

- [ ] **Step 6: 提交合作方域。**

  ```bash
  git add backend/src/modules/workbench/management backend/test/integration/modules/workbench/management.controller.spec.ts
  git commit -m "feat: add partners and communications"
  ```

### Task 7: 会议、纪要、决策关联和行动项自动任务

**Files:**
- Create: `backend/src/modules/workbench/management/application/meetings.service.ts`
- Create: `backend/src/modules/workbench/management/interface/http/meetings.controller.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/create-meeting.dto.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/update-meeting.dto.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/create-meeting-action.dto.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/update-meeting-action.dto.ts`
- Create: `backend/src/modules/workbench/management/interface/http/dto/create-source-task.dto.ts`
- Test: `backend/test/unit/modules/workbench/meetings.service.spec.ts`
- Test: `backend/test/integration/modules/workbench/management.controller.spec.ts`

- [ ] **Step 1: 写失败的会议行动项原子性测试。**

  创建会议（有 agenda、minutes、参与人），创建行动项后调用一次转换端点：

  ```ts
  const result = await request(app.getHttpServer())
    .post(`/api/meeting-actions/${actionId}/task`)
    .send({ title: `${prefix} action task`, priority: 'HIGH', dueAt: '2026-08-01T00:00:00.000Z' })
    .expect(201)
  expect(result.body.data).toMatchObject({ sourceType: 'MEETING_ACTION', sourceId: actionId })
  expect((await prisma.meetingAction.findUnique({ where: { id: actionId } }))?.taskId).toBe(result.body.data.id)
  await request(app.getHttpServer()).post(`/api/meeting-actions/${actionId}/task`).send({ title: 'duplicate' }).expect(409)
  ```

  另加测试：会议有状态为 `OPEN` 或 `IN_PROGRESS` 的行动项时 DELETE 返回 `409 MEETING_HAS_OPEN_ACTIONS`；行动项已 DONE/CANCELLED 时会议可归档；`Decision.meetingId` 必须引用未归档会议。

- [ ] **Step 2: 运行测试确认失败。**

  Run: `cd backend && pnpm test:unit -- meetings.service.spec.ts && pnpm test:integration -- management.controller.spec.ts`

  Expected: FAIL，会议服务和端点未实现。

- [ ] **Step 3: 实现会议及行动项服务。**

  `createMeeting` 必填 `title/scheduledAt`，会议状态默认为 `PLANNED`；`HELD` 状态的 `heldAt` 默认当前时间，改回非 HELD 时清空。`createAction` 验证会议，写入 `OPEN` 默认状态。`createTaskForAction` 必须使用：

  ```ts
  return this.prisma.$transaction(async (tx) => {
    const action = await tx.meetingAction.findFirst({ where: { id, archivedAt: null } })
    if (!action) throw this.notFound(ErrorCodes.MEETING_ACTION_NOT_FOUND, 'Meeting action not found')
    if (action.taskId) throw this.conflict(ErrorCodes.MEETING_ACTION_TASK_EXISTS, 'Meeting action already has a task')
    const task = await this.tasksService.createTaskInTransaction(tx, {
      ...input, sourceType: 'MEETING_ACTION', sourceId: action.id,
    })
    await tx.meetingAction.update({ where: { id: action.id }, data: { taskId: task.id } })
    return task
  })
  ```

  在 `MeetingAction.status` 进入 `DONE` 时不自动关闭任务（用户可能需要独立验证）；页面必须明确显示两个状态。`getMeeting` 同时返回未归档 actions 和关联 decisions。

- [ ] **Step 4: 注册管理模块并运行后端全套。**

  在 `ManagementModule` 注册所有 controller/service，在 `WorkbenchModule` 导入它。Run: `cd backend && pnpm test:unit && pnpm test:integration && pnpm test:e2e && pnpm lint && pnpm build`

  Expected: 全部 PASS；测试数据库可在已有 migration 基础上前向应用管理闭环迁移。

- [ ] **Step 5: 提交会议闭环。**

  ```bash
  git add backend/src/modules/workbench/management backend/src/modules/workbench/workbench.module.ts backend/test/unit/modules/workbench/meetings.service.spec.ts backend/test/integration/modules/workbench/management.controller.spec.ts
  git commit -m "feat: add meetings and action task conversion"
  ```

### Task 8: 定义前端强类型 API 契约并测试 HTTP 载荷

**Files:**
- Modify: `frontend/src/modules/workbench/types.ts`
- Create: `frontend/src/modules/workbench/api/management.ts`
- Create: `frontend/src/modules/workbench/api/__tests__/management.contracts.test.ts`
- Modify: `frontend/src/modules/workbench/api/__tests__/contracts.test.ts`

- [ ] **Step 1: 写失败的客户端契约测试。**

  测试 `createRisk` 对 `/risks` 发出 POST JSON、`listIssues({ overdue: true })` 对 `/issues?overdue=true` 发出 GET、`createMeetingActionTask('a1', input)` 对 `/meeting-actions/a1/task` 发出 POST。使用示例值让 TypeScript 类型检查下列不可变规则：

  ```ts
  const sourceTask: CreateSourceTaskInput = { title: '落实会议事项', dueAt: '2026-08-01T00:00:00.000Z' }
  expectTypeOf(createMeetingActionTask).parameters.toEqualTypeOf<[string, CreateSourceTaskInput]>()
  ```

- [ ] **Step 2: 运行测试确认模块缺失。**

  Run: `cd frontend && pnpm test -- management.contracts.test.ts && pnpm typecheck:contracts`

  Expected: FAIL，`management.ts` 和领域类型不存在。

- [ ] **Step 3: 实现 API 类型与调用。**

  在 `types.ts` 定义 `Risk/Issue/Decision/Partner/PartnerContact/PartnerAgreement/CommunicationRecord/Meeting/MeetingAction`，字段名与后端 JSON 的 camelCase 完全一致；枚举写成 string union。`management.ts` 复用既有 `request<T>` 与 URLSearchParams helper，不允许 `as any`。所有 `archive*` 返回 `Promise<void>`；三种任务转换返回 `Promise<WorkTask>`。

- [ ] **Step 4: 运行前端契约测试。**

  Run: `cd frontend && pnpm test -- management.contracts.test.ts contracts.test.ts && pnpm typecheck && pnpm typecheck:contracts`

  Expected: PASS，路由、HTTP method、序列化和 TypeScript 公开契约均可验证。

- [ ] **Step 5: 提交 API 契约。**

  ```bash
  git add frontend/src/modules/workbench/types.ts frontend/src/modules/workbench/api/management.ts frontend/src/modules/workbench/api/__tests__
  git commit -m "feat: add management api client contracts"
  ```

### Task 9: 风险、问题和决策页面

**Files:**
- Create: `frontend/src/modules/workbench/components/management/RiskForm.tsx`
- Create: `frontend/src/modules/workbench/components/management/IssueForm.tsx`
- Create: `frontend/src/modules/workbench/components/management/DecisionForm.tsx`
- Create: `frontend/src/pages/RisksPage.tsx`
- Create: `frontend/src/pages/IssuesPage.tsx`
- Create: `frontend/src/pages/DecisionsPage.tsx`
- Create: `frontend/src/modules/workbench/components/management/__tests__/RiskForm.test.tsx`
- Create: `frontend/src/modules/workbench/components/management/__tests__/IssueForm.test.tsx`
- Create: `frontend/src/modules/workbench/components/management/__tests__/DecisionForm.test.tsx`
- Create: `frontend/src/pages/__tests__/RisksPage.test.tsx`
- Create: `frontend/src/pages/__tests__/IssuesPage.test.tsx`
- Create: `frontend/src/pages/__tests__/DecisionsPage.test.tsx`

- [ ] **Step 1: 写失败的表单和页面测试。**

  风险页 mock `listRisks` 返回空列表，断言可理解空态与“新建风险”按钮；返回一个 OPEN CRITICAL 风险时显示负责人、等级和项目。风险表单提交应调用 `createRisk`，成功后使 `['risks']`、`['projects']`、`['dashboard']` 失效。问题表单关闭状态时必须显示并提交验证结果；决策表单将逐行备选方案转换为非空字符串数组，并提供“生成后续任务”按钮。

- [ ] **Step 2: 运行测试确认页面未实现。**

  Run: `cd frontend && pnpm test -- RisksPage.test.tsx IssuesPage.test.tsx DecisionsPage.test.tsx`

  Expected: FAIL，页面或组件导入失败。

- [ ] **Step 3: 实现三个页面和表单。**

  每个页面使用 TanStack Query，明确处理 `isPending`（skeleton）、`isError`（可重试）和空数据。页面必须显示过滤控件：风险按项目/状态/等级，问题按项目/状态/逾期，决策按项目/状态。编辑和归档都通过 mutation；归档前弹出确认。使用已有 Card/Button/Dialog/Input/Select，不新增另一套设计系统。任务生成成功后在 toast 中显示任务标题，不假装自动完成。

- [ ] **Step 4: 运行页面回归。**

  Run: `cd frontend && pnpm test -- RiskForm.test.tsx IssueForm.test.tsx DecisionForm.test.tsx RisksPage.test.tsx IssuesPage.test.tsx DecisionsPage.test.tsx && pnpm lint && pnpm typecheck`

  Expected: PASS，状态、空态、失败重试、mutation invalidation 都有覆盖。

- [ ] **Step 5: 提交风险/问题/决策 UI。**

  ```bash
  git add frontend/src/modules/workbench/components/management frontend/src/pages/RisksPage.tsx frontend/src/pages/IssuesPage.tsx frontend/src/pages/DecisionsPage.tsx frontend/src/pages/__tests__
  git commit -m "feat: add management risk issue decision pages"
  ```

### Task 10: 合作方、沟通与会议页面

**Files:**
- Create: `frontend/src/modules/workbench/components/management/PartnerForm.tsx`
- Create: `frontend/src/modules/workbench/components/management/CommunicationForm.tsx`
- Create: `frontend/src/modules/workbench/components/management/MeetingForm.tsx`
- Create: `frontend/src/modules/workbench/components/management/MeetingActionForm.tsx`
- Create: `frontend/src/pages/PartnersPage.tsx`
- Create: `frontend/src/pages/MeetingsPage.tsx`
- Create: `frontend/src/modules/workbench/components/management/__tests__/PartnerForm.test.tsx`
- Create: `frontend/src/modules/workbench/components/management/__tests__/CommunicationForm.test.tsx`
- Create: `frontend/src/modules/workbench/components/management/__tests__/MeetingActionForm.test.tsx`
- Create: `frontend/src/pages/__tests__/PartnersPage.test.tsx`
- Create: `frontend/src/pages/__tests__/MeetingsPage.test.tsx`

- [ ] **Step 1: 写失败的合作/会议 UI 测试。**

  合作方页应显示名称、联系人数量、有效协议数量、下一次跟进日期；打开详情后可添加沟通，点击“转为任务”调用 `createCommunicationTask`。会议页应显示议程、纪要、参与人和行动项；行动项无 `taskId` 时显示“创建任务”，成功后显示可追踪 task ID，已有 `taskId` 时按钮禁用且不再请求。测试会议删除存在 OPEN 行动项时展示后端冲突消息。

- [ ] **Step 2: 运行测试确认失败。**

  Run: `cd frontend && pnpm test -- PartnerForm.test.tsx CommunicationForm.test.tsx MeetingActionForm.test.tsx PartnersPage.test.tsx MeetingsPage.test.tsx`

  Expected: FAIL，相关页面/组件尚不存在。

- [ ] **Step 3: 实现合作方和会议 UI。**

  `PartnersPage` 采用列表 + 详情抽屉：列表加载 `listPartners`，详情加载 `getPartner`，在同一上下文显示联系人、协议、沟通历史和待对方事项。`MeetingsPage` 可新建/编辑会议与行动项；任务创建 mutation 只向 API 发送标题、负责人、优先级、截止日期，永不让用户编辑来源字段。每次写入失效 `['partners']` 或 `['meetings']`，来源任务生成后同时失效 `['tasks']`、`['projects']`、`['dashboard']`。

- [ ] **Step 4: 运行前端完整质量门禁。**

  Run: `cd frontend && pnpm test && pnpm lint && pnpm typecheck && pnpm typecheck:contracts && pnpm build`

  Expected: 全部 PASS；无 `any`、无未处理 Promise、无对 mock 业务数据的依赖。

- [ ] **Step 5: 提交合作/会议 UI。**

  ```bash
  git add frontend/src/modules/workbench/components/management frontend/src/pages/PartnersPage.tsx frontend/src/pages/MeetingsPage.tsx frontend/src/pages/__tests__
  git commit -m "feat: add partner and meeting management pages"
  ```

### Task 11: 注册导航、端到端 API 检查和本地数据库升级

**Files:**
- Modify: `frontend/src/constants/routes.ts`
- Modify: `frontend/src/router/routes.ts`
- Modify: `frontend/src/router/__tests__/routes.test.ts`
- Modify: `docs/superpowers/plans/2026-07-18-management-loop-p0.md` — 实施中逐项勾选，禁止伪造完成状态。

- [ ] **Step 1: 写失败的路由顺序测试。**

  预期 `routes.map(route => route.path)` 为：

  ```ts
  ['/', '/projects', '/tasks', '/risks', '/issues', '/decisions', '/partners', '/meetings', '/settings', '*']
  ```

- [ ] **Step 2: 运行测试确认新路由尚未暴露。**

  Run: `cd frontend && pnpm test -- routes.test.ts`

  Expected: FAIL，当前导航中缺少管理闭环页面。

- [ ] **Step 3: 注册懒加载页面与导航文案。**

  在 `ROUTES` 添加 `RISKS/ISSUES/DECISIONS/PARTNERS/MEETINGS`；在既有 `workbench` 分类的任务之后、设置之前以“风险”“问题”“决策”“合作方”“会议”注册。必须保留现有路由次序和通配重定向。

- [ ] **Step 4: 先在测试库验证迁移，再升级用户明确授权的本地工作台库。**

  ```bash
  cd backend
  pnpm prisma:generate
  pnpm test:integration
  pnpm prisma:migrate:deploy
  ```

  Expected: 测试库通过；真实本地库只前向应用 `20260718020000_management_loop_p0`，命令输出 `Applied migration` 或 `No pending migrations`，绝不出现 reset/drop。

- [ ] **Step 5: 用运行中的 API 做最小 smoke test。**

  ```bash
  curl -fsS http://127.0.0.1:4311/api/health
  curl -fsS http://127.0.0.1:4311/api/risks?page=1&pageSize=20
  curl -fsS http://127.0.0.1:4311/api/meetings?page=1&pageSize=20
  ```

  Expected: 三个响应均为成功 JSON；后两项是统一分页空列表或用户已录入数据，绝不能是 404/500。

- [ ] **Step 6: 提交导航与执行记录。**

  ```bash
  git add frontend/src/constants/routes.ts frontend/src/router/routes.ts frontend/src/router/__tests__/routes.test.ts docs/superpowers/plans/2026-07-18-management-loop-p0.md
  git commit -m "feat: expose management loop navigation"
  ```

### Task 12: 两阶段审查、合并与回归证据

**Files:**
- Review: 当前功能分支的全部 diff
- Modify only when review identifies a real defect: 与缺陷直接相关的生产代码和测试

- [ ] **Step 1: 规格审查。**

  指派一名未参与实现的审查者，逐项对照本计划开头的“已确认范围与不可变规则”，尤其确认：风险确实刷新健康快照；三种来源任务均完整持久化双字段；会议行动项在同一事务回填 `taskId` 并避免重复；没有任何业务 DELETE 使用物理删除。

- [ ] **Step 2: 质量审查。**

  指派另一名未参与实现与规格审查的审查者，检查 Prisma 迁移的幂等和前向性、DTO 的 whitelist 行为、跨父资源访问、事务边界、索引、列表分页、错误码、React query invalidation、可访问表单标签与加载/空/错状态。审查报告中每个问题必须带精确文件/行号与复现测试。

- [ ] **Step 3: 先为每个有效问题补失败测试，再最小修复。**

  对每个 P0/P1 审查问题，先运行新增测试确认失败，修复后运行该测试与受影响套件；拒绝纯风格或超范围重构。提交信息采用 `fix: ...`，每个提交只含一个逻辑问题。

- [ ] **Step 4: 执行最终验证并记录原始结果。**

  ```bash
  cd backend && pnpm prisma:generate && pnpm test:unit && pnpm test:integration && pnpm test:e2e && pnpm lint && pnpm build
  cd ../frontend && pnpm test && pnpm lint && pnpm typecheck && pnpm typecheck:contracts && pnpm build
  git diff --check main...HEAD
  ```

  Expected: 每一条命令退出码为 0；`git diff --check` 无输出。

- [ ] **Step 5: 合并到用户可见的 main 并再次验证工作树。**

  合并/挑拣经过两阶段审查的提交到 `/Users/dynastylu/Desktop/AICode/rd-manager-workbench` 的 `main`，不要把功能停留在隐藏 worktree。合并后在 main 重跑至少后端 integration、前端 test/typecheck/build 和 `git diff --check`；向用户报告实际 commit SHA、已执行命令和尚未覆盖的后续 P1/P2/Electron 范围。

## 验收矩阵

| PRD 验收项 | 计划任务 | 可观测证据 |
| --- | --- | --- |
| 风险概率、影响、等级、措施、责任、状态、关闭日期 | 1、4、9 | `/api/risks` CRUD、页面筛选、风险关闭测试 |
| 风险影响项目健康 | 2、4 | 最新 `ProjectHealthSnapshot` 的 RED 和原因 |
| 问题/阻塞、影响对象、方案、期限、验证 | 1、4、9 | DTO 验证、关闭需验证结果、逾期筛选 |
| 决策背景、备选、依据、结论、参与人、后续任务 | 1、5、9 | `alternatives` JSON、`/decisions/:id/task` 来源任务 |
| 合作单位、联系人、协议、项目、沟通、待对方事项 | 1、6、10 | 合作方详情、沟通跟进日期、归档防护 |
| 会议议程、纪要、决策、行动项 | 1、5、7、10 | Meeting 详情、`Decision.meetingId`、行动项列表 |
| 行动项自动生成任务且保留会议来源 | 3、7、10 | 事务回填 `taskId`、任务 `MEETING_ACTION/actionId` |
| 业务删除默认归档 | 4–7 | 默认列表排除、归档测试、没有物理 delete 路由 |
| 真实前后端框架内实现 | 全部 | 仅变更 `frontend/`、`backend/` 和 docs，不创建替代 apps workspace |

## 自查结论

- **规格覆盖：** 设计规格 6.4 和 6.5 的风险、问题、决策、合作方、联系人、协议、沟通、会议、行动项全部映射到 Task 1、4–7、9–10；统一规则 8 的来源、健康度、软删除映射到 Task 2–3 和 Task 4–7。
- **占位检查：** 每个写代码任务都给出文件、失败测试、实现约束、运行命令和提交边界；没有将验证、错误处理或字段定义留给实施者自行猜测的空白步骤。
- **类型一致性：** 所有后端字段使用 camelCase HTTP 名与 Prisma snake_case mapping 的既有约定；三个来源类型固定为 `DECISION`、`COMMUNICATION`、`MEETING_ACTION`，对应的来源 ID 分别为其实体 ID。
