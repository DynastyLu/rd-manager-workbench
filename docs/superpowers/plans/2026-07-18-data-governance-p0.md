# 数据治理 P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以飞书式但完全本机单人的“数据中心”交付安全可恢复的附件库、提醒、全局搜索、CSV/XLSX 导入导出、可验证备份恢复和可追溯审计。

**Architecture:** 新能力位于 `backend/src/modules/workbench/governance`，以 PostgreSQL `app` schema 保存元数据、提醒、导入批次、备份清单和不可变审计；前端将它呈现在左侧固定导航的“数据中心”，采用可筛选资料库、提醒流和维护面板，而非彼此孤立的后台表单。实际附件与备份文件只落在已配置的 `LOCAL_STORAGE_ROOT` 内；文件系统不能参加 PostgreSQL 事务，因此附件和备份均通过明确的暂存/待完成状态与启动修复器实现可恢复的两阶段操作；业务实体继续由其所属模块维护，治理模块只以允许清单内的 `entityType/entityId` 建通用索引，不复制领域数据。

**Tech Stack:** NestJS 10、Prisma 6/PostgreSQL、Node.js `crypto`/`fs`、Multer、ExcelJS、class-validator、Jest/Supertest、React 19、TanStack Query、Vitest、shadcn/Tailwind。

---

## 范围、依赖和不可变安全边界

- 该计划在管理闭环 P0 和行业情报 P0 合入 `main` 后实施。搜索、提醒和附件的实体允许清单为：`PROJECT`、`MILESTONE`、`TASK`、`APPLICATION_CASE`、`APPLICATION_MATERIAL`、`MATERIAL_VERSION`、`EVIDENCE_RECORD`、`CORRECTION_RECORD`、`RISK`、`ISSUE`、`DECISION`、`PARTNER`、`COMMUNICATION`、`MEETING`、`MEETING_ACTION`、`INTELLIGENCE_ITEM`、`INTELLIGENCE_BRIEF`。不接受任意字符串或前端自报存在的对象。
- “数据中心”借鉴高密度资料库和统一快捷入口的交互节奏：附件库按对象类型、文件名、状态和最近更新时间筛选；提醒以待处理流显示；搜索结果可直接跳到真实对象；导入导出、备份恢复、审计收进维护页签。它不实现云盘共享、文件夹权限、协作者、评论、@ 提及、在线编辑、跨设备同步、外链分享或任何飞书 API。
- P0 附件上传使用 `multipart/form-data`，单文件最大 25 MiB、单请求只允许一个 `file` 字段；文件名只作为展示元数据，永不拼入存储路径。内容写入 `${LOCAL_STORAGE_ROOT}/attachments/<attachmentId>`，SHA-256 和实际字节数由服务端 buffer 计算，客户端声明的 MIME/大小不被信任。P0 只保存/下载二进制，不在服务端解压、预览或执行附件。
- 附件删除不是物理删除：先移入 `${LOCAL_STORAGE_ROOT}/recycle/<attachmentId>`，保留 30 天；恢复只允许 `TRASHED` 附件回到原存储键。到期清理或手动永久清理只能将元数据置为 `PURGED`，审计记录永不删除。不存在批量清空回收站接口。
- 文件系统与 DB 的失败恢复必须可确定：上传、移入回收区、恢复和清理都先持久化 `PENDING_*` 状态，再移动/删除文件，最后确认状态；启动时和 `POST /api/governance/maintenance/reconcile` 仅修复本计划定义的状态。若两侧都找不到文件，记录 `MISSING`、写审计并返回稳定错误，绝不伪造成功。
- 提醒是本机单进程轮询的应用内提醒中心；浏览器/Electron Notification API 只在前端获得用户授权后显示桌面通知，后端不尝试操作桌面。每 60 秒由 backend 进程计算已到触发点的日期型对象，生成或复用唯一 `dedupeKey`；轮询重启、刷新或重复请求均不得产生重复提醒。
- 全局搜索 P0 覆盖需求中规定的项目、任务、材料、证据、会议、合作方、风险、决策和情报，并在同一允许清单中增加里程碑、申报案件、补正和沟通。只返回标题、摘要和目标路径，正文检索使用 Prisma/PostgreSQL 的参数化 `contains`，不执行 HTML、不拼接原始 SQL、不返回附件字节。
- 导出 P0 支持 CSV 和 XLSX 两种格式；导入仅支持 CSV/XLSX 的“项目”和“任务”模板。导入必须先解析/验证整个工作簿，再在一个 DB 事务内写入；任何行出错即 `422 IMPORT_VALIDATION_FAILED`，零条业务记录写入。导出只包含活动数据和用户可见字段；绝不把数据库 URL、审计前后快照、附件内容或备份清单嵌入表格。
- 备份 P0 是用户明确触发的完整本地快照：`pg_dump` 的 custom-format 数据库转储、`attachments/` 和 `recycle/` 内容、以及 `manifest.json` 组成一个不可覆盖目录 `${LOCAL_STORAGE_ROOT}/backups/<UTC timestamp>-<uuid>/`。恢复必须先以只读方式验证 manifest 版本、每个相对路径、SHA-256 和大小，然后创建“恢复前”自动备份；只有该备份成功才允许 `pg_restore --clean --if-exists` 和原子目录替换。恢复进程不得接受调用方传入的 shell 参数或任意路径，且只允许 `127.0.0.1` 的既有 `DATABASE_URL`。
- 审计仅记录结构化摘要：本机操作者固定为 `local-user`，不记录附件二进制、数据库凭据、会话令牌或完整材料正文；`before`/`after` JSON 只包含白名单字段、`changedFields` 和哈希。所有治理写操作及每个领域服务的 create/update/archive/转换入口必须在同一 Prisma transaction 中写入 `AuditLog`。
- 所有日期存 UTC，HTTP 使用 ISO-8601；列表为 `{ data, meta: { page, pageSize, total } }`，默认 20、最大 100。DELETE 默认软归档/回收，未知字段仍由全局 `forbidNonWhitelisted` 拒绝。

## 数据模型、文件格式和 HTTP 契约

### Prisma 模型

在 `backend/prisma/schema.prisma` 中新增以下 enum（全部 `@@schema("app")`）：

```prisma
enum GovernanceEntityType {
  PROJECT MILESTONE TASK APPLICATION_CASE APPLICATION_MATERIAL MATERIAL_VERSION
  EVIDENCE_RECORD CORRECTION_RECORD RISK ISSUE DECISION PARTNER COMMUNICATION
  MEETING MEETING_ACTION INTELLIGENCE_ITEM INTELLIGENCE_BRIEF
  @@schema("app")
}

enum AttachmentState {
  PENDING_UPLOAD ACTIVE PENDING_TRASH TRASHED PENDING_RESTORE PENDING_PURGE PURGED MISSING
  @@schema("app")
}

enum ReminderKind { DUE_DATE FOLLOW_UP DEADLINE MANUAL @@schema("app") }
enum ReminderStatus { PENDING DELIVERED DISMISSED @@schema("app") }
enum ReminderChannel { IN_APP DESKTOP @@schema("app") }
enum ImportFormat { CSV XLSX @@schema("app") }
enum ImportKind { PROJECTS TASKS @@schema("app") }
enum ImportStatus { VALIDATED APPLIED REJECTED @@schema("app") }
enum BackupStatus { CREATED VERIFIED RESTORED FAILED @@schema("app") }
enum AuditAction { CREATE UPDATE ARCHIVE RESTORE IMPORT EXPORT BACKUP RESTORE_BACKUP DOWNLOAD @@schema("app") }
```

新增模型及索引：

```text
Attachment:
  id, entityType, entityId, originalFileName, mimeType, byteSize, sha256,
  originalStorageKey @unique, storageKey?, stagingStorageKey?, state default PENDING_UPLOAD,
  trashedAt?, purgeAfterAt?, createdAt, updatedAt
  @@index([entityType, entityId, state]) @@index([state, purgeAfterAt]) @@index([sha256])

Reminder:
  id, entityType, entityId, kind, title, dueAt?, triggerAt, channel default IN_APP,
  status default PENDING, dedupeKey @unique, deliveredAt?, dismissedAt?, createdAt, updatedAt
  @@index([status, triggerAt]) @@index([entityType, entityId, status])

ImportBatch:
  id, kind, format, originalFileName, sha256, rowCount, status, errors Json default [],
  appliedAt?, createdAt
  @@index([kind, createdAt]) @@index([status, createdAt])

BackupRecord:
  id, directoryName @unique, manifestSha256, status, createdAt, verifiedAt?, restoredAt?, errorSummary?
  @@index([status, createdAt])

AuditLog:
  id, entityType, entityId, action, actorName default "local-user", changedFields String[] default [],
  beforeSummary Json?, afterSummary Json?, occurredAt default now(), traceId?
  @@index([entityType, entityId, occurredAt]) @@index([action, occurredAt])
```

`Attachment` 不使用虚假的 polymorphic 外键；`GovernanceReferenceService` 是唯一的目标对象验证入口。`ImportBatch.errors` 只保存 `{ row: number, field: string, code: string, message: string }[]`，最大 100 条；文件内容和单元格全文不写入错误日志。迁移目录固定为 `backend/prisma/migrations/20260718040000_data_governance_p0/migration.sql`，仅可新增 enum/table/index/constraint，不能 drop 表、重建数据库或使用 `prisma db push`。

### 附件和恢复状态机

```text
PENDING_UPLOAD --stage -> final--> ACTIVE --move -> recycle--> TRASHED
     |                                      ^                    |
     | (stage/final missing)                | (restore)          | (30d or explicit purge)
     +----------------------------------> MISSING <----------- PENDING_PURGE -> PURGED
ACTIVE --DB pending--> PENDING_TRASH --final exists--> ACTIVE; --recycle exists--> TRASHED
TRASHED --DB pending--> PENDING_RESTORE --recycle exists--> TRASHED; --final exists--> ACTIVE
```

`LocalStorageAdapter` 增加 `exists(storageKey)` 和 `move(fromKey, toKey)`；两者先调用同一 `resolveStoragePath`，并以 `rename` 完成同一 `LOCAL_STORAGE_ROOT` 下的原子移动。上传顺序是：创建 `PENDING_UPLOAD` 元数据 → 写 `staging/<id>` → move 至 `attachments/<id>` → 更新为 `ACTIVE`。控制器只显示 `ACTIVE`，下载仅允许 `ACTIVE`；维护修复器按上图检测实际文件位置并写 `RECONCILE_ATTACHMENT` 审计（使用 `UPDATE` 行为，不新增未定义 enum）。

### CSV/XLSX 模板

项目导入导出列（UTF-8 CSV 含 BOM，XLSX sheet 名 `Projects`）：

```text
code,name,type,researchDirection,objective,expectedOutcome,leadName,participantNames,
plannedStartAt,plannedEndAt,phase,status
```

任务模板（sheet 名 `Tasks`）：

```text
title,projectCode,milestoneName,parentTitle,description,assigneeName,collaboratorNames,
priority,status,dueAt
```

数组列用 JSON 字符串，例如 `["张三","李四"]`；空值是 `null`/空单元格；日期必须为 ISO-8601。导入不支持通过名称猜测多个同名里程碑/父任务：找不到为 `IMPORT_REFERENCE_NOT_FOUND`，多个匹配为 `IMPORT_REFERENCE_AMBIGUOUS`。项目 code 必须在文件内唯一且不得与活动项目冲突；任务引用只允许同一文件已创建项目或数据库中未归档项目。`ExcelJS` 用 `Workbook.xlsx.load(buffer)`/`Workbook.xlsx.writeBuffer()`，CSV 使用其 CSV reader/writer；禁止公式求值、宏、外部链接和分工作表导入。

### REST 路由

```text
POST   /api/attachments                              multipart: entityType, entityId, file
GET    /api/attachments?entityType=&entityId=&state=&page=&pageSize=
GET    /api/attachments/:id/download
DELETE /api/attachments/:id                           -> 204, move to recycle
POST   /api/attachments/:id/restore
POST   /api/attachments/:id/purge                     -> only TRASHED and purgeAfterAt <= now

GET    /api/reminders?status=&dueBefore=&page=&pageSize=
POST   /api/reminders                                 -> manual only
POST   /api/reminders/:id/deliver
POST   /api/reminders/:id/dismiss
POST   /api/reminders/generate                        -> idempotent current scan

GET    /api/search?q=&types=&page=&pageSize=
GET    /api/exports/projects?format=csv|xlsx
GET    /api/exports/tasks?format=csv|xlsx&projectId=
POST   /api/imports/projects                          multipart: file
POST   /api/imports/tasks                             multipart: file
GET    /api/imports/:id

POST   /api/backups
GET    /api/backups?status=&page=&pageSize=
POST   /api/backups/:id/verify
POST   /api/backups/:id/restore
GET    /api/audit-logs?entityType=&entityId=&action=&page=&pageSize=
POST   /api/governance/maintenance/reconcile
```

下载/export 都设置 `Content-Disposition: attachment` 和格式匹配的 `Content-Type`，不经过 JSON response interceptor；其它成功响应继续使用 `{ success: true, data }`。错误码新增：`GOVERNANCE_REFERENCE_NOT_FOUND`、`ATTACHMENT_NOT_FOUND`、`ATTACHMENT_STATE_INVALID`、`ATTACHMENT_FILE_MISSING`、`ATTACHMENT_TOO_LARGE`、`ATTACHMENT_STORAGE_FAILED`、`REMINDER_NOT_FOUND`、`IMPORT_UNSUPPORTED_FORMAT`、`IMPORT_VALIDATION_FAILED`、`IMPORT_REFERENCE_NOT_FOUND`、`IMPORT_REFERENCE_AMBIGUOUS`、`BACKUP_NOT_FOUND`、`BACKUP_MANIFEST_INVALID`、`BACKUP_VERIFICATION_FAILED`、`BACKUP_RESTORE_FAILED`。

## 计划中的文件结构

```text
backend/
  package.json                                      # ExcelJS/Multer direct dependencies
  prisma/schema.prisma
  prisma/migrations/20260718040000_data_governance_p0/migration.sql
  src/infrastructure/storage/storage.port.ts
  src/infrastructure/storage/local-storage.adapter.ts
  src/modules/workbench/governance/
    governance.module.ts
    application/governance-reference.service.ts
    application/audit-log.service.ts
    application/attachments.service.ts
    application/reminders.service.ts
    application/search.service.ts
    application/tabular-transfer.service.ts
    application/backups.service.ts
    application/governance-maintenance.service.ts
    interface/http/attachments.controller.ts
    interface/http/reminders.controller.ts
    interface/http/search.controller.ts
    interface/http/transfers.controller.ts
    interface/http/backups.controller.ts
    interface/http/audit-logs.controller.ts
    interface/http/governance-maintenance.controller.ts
    interface/http/dto/*.dto.ts
  src/modules/workbench/workbench.module.ts
  src/shared/errors/error-codes.ts
  test/unit/modules/workbench/governance/*.spec.ts
  test/integration/prisma/data-governance-catalog.spec.ts
  test/integration/modules/workbench/governance.controller.spec.ts

frontend/
  src/modules/workbench/types.ts
  src/modules/workbench/api/governance.ts
  src/modules/workbench/api/__tests__/governance.contracts.test.ts
  src/modules/workbench/components/governance/AttachmentPanel.tsx
  src/modules/workbench/components/governance/AttachmentLibrary.tsx
  src/modules/workbench/components/governance/ReminderCenter.tsx
  src/modules/workbench/components/governance/GlobalSearchDialog.tsx
  src/modules/workbench/components/governance/ImportDialog.tsx
  src/modules/workbench/components/governance/ExportMenu.tsx
  src/modules/workbench/components/governance/BackupPanel.tsx
  src/pages/SearchPage.tsx
  src/pages/DataCenterPage.tsx
  src/pages/__tests__/SearchPage.test.tsx
  src/pages/__tests__/DataCenterPage.test.tsx
  src/constants/routes.ts
  src/router/routes.ts
```

## 实施任务

### Task 1: 锁定治理表、依赖和前向迁移

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260718040000_data_governance_p0/migration.sql`
- Create: `backend/test/integration/prisma/data-governance-catalog.spec.ts`

- [ ] **Step 1: 写失败的 catalog 集成测试。**

  用测试库 `PrismaClient` 断言 `attachments`、`reminders`、`import_batches`、`backup_records`、`audit_logs` 都位于 `app` schema；创建 `Attachment`，断言 `original_storage_key` 与 `dedupe_key` 唯一约束及 `attachments_entity_type_entity_id_state_idx`、`audit_logs_entity_type_entity_id_occurred_at_idx` 索引存在。

  ```ts
  await expect(prisma.attachment.create({ data: attachmentData })).resolves.toMatchObject({
    state: 'PENDING_UPLOAD',
  })
  await expect(prisma.reminder.create({ data: { ...reminderData, dedupeKey: 'same' } }))
    .rejects.toThrow()
  ```

- [ ] **Step 2: 运行测试，确认它因模型/表缺失而 RED。**

  Run: `cd backend && pnpm test:integration -- data-governance-catalog.spec.ts`

  Expected: FAIL，因为 Prisma client 尚没有治理 delegate 或迁移表；不得连到非 `rd_manager_workbench_test` 数据库。

- [ ] **Step 3: 以本计划的精确 enum、模型和索引实现 schema 与迁移。**

  安装确定版本的运行依赖：

  ```bash
  cd backend && pnpm add exceljs multer && pnpm add -D @types/multer
  ```

  只生成 `20260718040000_data_governance_p0` 前向 SQL。检查 SQL 中只有 `CREATE TYPE`、`CREATE TABLE`、`CREATE INDEX`、`ALTER TABLE ... ADD CONSTRAINT`，并显式为 `errors`、`changed_fields` 使用 JSONB/text array 默认值；删除任何 `DROP`、`TRUNCATE` 或无关 schema 变化。

- [ ] **Step 4: 生成客户端并让 catalog 测试变绿。**

  Run: `cd backend && pnpm prisma:generate && pnpm test:integration -- data-governance-catalog.spec.ts`

  Expected: PASS，重复 `originalStorageKey`/`dedupeKey` 被数据库拒绝，索引可查询到。

- [ ] **Step 5: 提交迁移。**

  ```bash
  git add backend/package.json backend/pnpm-lock.yaml backend/prisma backend/test/integration/prisma/data-governance-catalog.spec.ts
  git commit -m "feat: add governance data model"
  ```

### Task 2: 先扩展受限本地存储，再实现安全附件状态机

**Files:**
- Modify: `backend/src/infrastructure/storage/storage.port.ts`
- Modify: `backend/src/infrastructure/storage/local-storage.adapter.ts`
- Create: `backend/src/modules/workbench/governance/application/governance-reference.service.ts`
- Create: `backend/src/modules/workbench/governance/application/audit-log.service.ts`
- Create: `backend/src/modules/workbench/governance/application/attachments.service.ts`
- Create: `backend/src/modules/workbench/governance/interface/http/attachments.controller.ts`
- Create: `backend/src/modules/workbench/governance/interface/http/dto/create-attachment.dto.ts`
- Create: `backend/src/modules/workbench/governance/interface/http/dto/list-attachments-query.dto.ts`
- Create: `backend/test/unit/infrastructure/storage/local-storage.adapter.spec.ts`
- Create: `backend/test/unit/modules/workbench/governance/attachments.service.spec.ts`
- Create: `backend/test/integration/modules/workbench/governance.controller.spec.ts`

- [ ] **Step 1: 写失败的 storage/附件单测。**

  覆盖 storage `move` 拒绝 `../escape`、同 root 内移动后源消失/目标可读；覆盖服务把上传先建 `PENDING_UPLOAD`、以 buffer hash 写入、完成后为 `ACTIVE`。还要覆盖删除文件移动失败时记录仍为 `ACTIVE`，恢复非 `TRASHED` 返回 `ATTACHMENT_STATE_INVALID`，下载 `MISSING` 返回 `ATTACHMENT_FILE_MISSING`。

  ```ts
  await expect(storage.move('../escape', 'attachments/a')).rejects.toThrow(
    'Storage key resolves outside storage root',
  )
  await expect(service.restore('active-id')).rejects.toMatchObject({
    code: ErrorCodes.ATTACHMENT_STATE_INVALID,
  })
  ```

- [ ] **Step 2: 运行这些测试并确认 RED。**

  Run: `cd backend && pnpm test:unit -- local-storage.adapter.spec.ts attachments.service.spec.ts`

  Expected: FAIL，因为 `exists/move`、AttachmentService 和状态机尚不存在。

- [ ] **Step 3: 实现受限 storage 和目标对象验证。**

  在 `StoragePort` 增加：

  ```ts
  abstract exists(storageKey: string): Promise<boolean>
  abstract move(fromKey: string, toKey: string): Promise<void>
  ```

  `LocalStorageAdapter.move` 必须先解析两个 key、`mkdir(dirname(to))`、以 `rename` 移动且绝不接受绝对路径或 root 外路径。`GovernanceReferenceService.assertActive(type, id, tx)` 以 `switch` 查询各真实 Prisma delegate，并拒绝不存在/已归档对象；不得以 `any`、`$queryRawUnsafe` 或仅检查 UUID 格式代替。

  `AuditLogService.write(tx, input)` 在传入 transaction 内创建记录，`summarize` 仅选 id、标题/编号、状态、日期、文件 hash/大小和字段名。为后续领域模块导出它，但本任务不修改各领域服务。

- [ ] **Step 4: 实现附件的两阶段动作和 HTTP 边界。**

  `POST /attachments` 使用 `FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024, files: 1 } })`，DTO 仅接受 `entityType/entityId`。服务必须按下列顺序：

  ```ts
  const id = createId()
  const sha256 = createHash('sha256').update(file.buffer).digest('hex')
  await prisma.$transaction((tx) => tx.attachment.create({ data: {
    id, entityType, entityId, originalFileName: basename(file.originalname), mimeType: file.mimetype,
    byteSize: file.buffer.length, sha256, originalStorageKey: `attachments/${id}`,
    stagingStorageKey: `staging/${id}`, state: 'PENDING_UPLOAD',
  }}))
  await storage.write({ key: `staging/${id}`, content: file.buffer, mimeType: file.mimetype })
  await storage.move(`staging/${id}`, `attachments/${id}`)
  await prisma.$transaction((tx) => tx.attachment.update({ where: { id }, data: {
    storageKey: `attachments/${id}`, stagingStorageKey: null, state: 'ACTIVE',
  }}))
  ```

  在任何 filesystem 异常后调用修复器；响应只在最终为 `ACTIVE` 时返回 201。删除/恢复/清理同样先更新 `PENDING_*`，再 move/delete，再完成最终状态。下载使用 `res.setHeader` + `res.end(buffer)`，并用 UTF-8 安全的 `Content-Disposition` 文件名；绝不把 buffer 放进 JSON。

- [ ] **Step 5: 写 API RED/Green 回归。**

  先扩展 `governance.controller.spec.ts`：上传到真实测试目录后 GET 下载字节相同；DELETE 后列表默认不显示而 `state=TRASHED` 可见，POST restore 后可下载；超过 25 MiB 返回 `413/ATTACHMENT_TOO_LARGE`；无效 `entityType`/归档项目返回稳定错误。实现后运行：

  Run: `cd backend && pnpm test:unit -- local-storage.adapter.spec.ts attachments.service.spec.ts && pnpm test:integration -- governance.controller.spec.ts`

  Expected: PASS；测试 `afterAll` 必须删除其专用临时 `LOCAL_STORAGE_ROOT`，不可触碰开发目录。

- [ ] **Step 6: 提交附件垂直切片。**

  ```bash
  git add backend/src/infrastructure/storage backend/src/modules/workbench/governance backend/src/shared/errors/error-codes.ts backend/test
  git commit -m "feat: add recoverable local attachments"
  ```

### Task 3: 实现幂等提醒与应用内/桌面通知桥接

**Files:**
- Create: `backend/src/modules/workbench/governance/application/reminders.service.ts`
- Create: `backend/src/modules/workbench/governance/interface/http/reminders.controller.ts`
- Create: `backend/src/modules/workbench/governance/interface/http/dto/create-reminder.dto.ts`
- Create: `backend/src/modules/workbench/governance/interface/http/dto/list-reminders-query.dto.ts`
- Modify: `backend/src/modules/workbench/governance/governance.module.ts`
- Create: `backend/test/unit/modules/workbench/governance/reminders.service.spec.ts`
- Modify: `backend/test/integration/modules/workbench/governance.controller.spec.ts`
- Create: `frontend/src/modules/workbench/components/governance/ReminderCenter.tsx`
- Create: `frontend/src/modules/workbench/components/governance/__tests__/ReminderCenter.test.tsx`

- [ ] **Step 1: 写失败的 reminders 单测。**

  固定 `now=2026-07-18T08:00:00.000Z`，创建逾期任务、今天里程碑、申报 deadline、问题 due date、沟通 follow-up、会议 action due date；断言一次生成有对应唯一 key，第二次生成不增加记录。测试手工 reminder 的相同 `dedupeKey` 只得到一条，`deliver` 从 PENDING 变 DELIVERED，`dismiss` 不允许重复交付。

  ```ts
  const first = await service.generateDueReminders(now)
  const second = await service.generateDueReminders(now)
  expect(second.created).toBe(0)
  expect(await prisma.reminder.count({ where: { dedupeKey: 'TASK:task-1:DUE_DATE:2026-07-18' } })).toBe(1)
  ```

- [ ] **Step 2: 运行单测，确认 RED。**

  Run: `cd backend && pnpm test:unit -- reminders.service.spec.ts`

  Expected: FAIL，因为 Reminder delegate/service/路由不存在。

- [ ] **Step 3: 实现生成、轮询和 API。**

  `generateDueReminders(now)` 只扫描活动对象，统一取 `triggerAt = dueAt - 24h`（若已过则 now），dedupe 格式为 `${entityType}:${entityId}:${kind}:${dateKey}`；使用 `createMany({ skipDuplicates: true })`，每条 `channel=IN_APP`。模块 `OnApplicationBootstrap` 先生成一次，再以受控 `setInterval(..., 60_000)` 运行；`OnModuleDestroy` 清理 timer，禁止 Redis/BullMQ/多进程队列。`GET` 默认只列 PENDING；`POST :id/deliver` 仅在 PENDING 更新 deliveredAt/status，前端以它作 Notification 成功确认。

- [ ] **Step 4: 实现前端提醒中心。**

  页面级 Layout 在应用启动时请求 pending reminders。`ReminderCenter` 显示标题、到期时间、来源路径、交付/忽略按钮；用户点击“允许桌面通知”后检查 `Notification.permission`，仅在 `granted` 时对未交付的提醒 `new Notification(title, { body })` 并再调用 `deliverReminder`。无权限时仍显示应用内清单，绝不将提醒丢失或假报已发送。

- [ ] **Step 5: 运行 RED/Green 与回归。**

  Run: `cd backend && pnpm test:unit -- reminders.service.spec.ts && pnpm test:integration -- governance.controller.spec.ts && cd ../../frontend && pnpm test -- ReminderCenter.test.tsx`

  Expected: PASS；前端测试分别模拟 `Notification.permission === 'default'` 与 `granted`，确认只在授权后调用 deliver API。

- [ ] **Step 6: 提交提醒闭环。**

  ```bash
  git add backend/src/modules/workbench/governance backend/test frontend/src/modules/workbench/components/governance
  git commit -m "feat: add idempotent local reminders"
  ```

### Task 4: 实现参数化全局搜索和审计读取

**Files:**
- Create: `backend/src/modules/workbench/governance/application/search.service.ts`
- Create: `backend/src/modules/workbench/governance/interface/http/search.controller.ts`
- Create: `backend/src/modules/workbench/governance/interface/http/audit-logs.controller.ts`
- Create: `backend/src/modules/workbench/governance/interface/http/dto/search-query.dto.ts`
- Create: `backend/src/modules/workbench/governance/interface/http/dto/list-audit-logs-query.dto.ts`
- Create: `backend/test/unit/modules/workbench/governance/search.service.spec.ts`
- Modify: `backend/test/integration/modules/workbench/governance.controller.spec.ts`
- Create: `frontend/src/pages/SearchPage.tsx`
- Create: `frontend/src/pages/__tests__/SearchPage.test.tsx`
- Create: `frontend/src/modules/workbench/components/governance/GlobalSearchDialog.tsx`
- Create: `frontend/src/modules/workbench/components/governance/__tests__/GlobalSearchDialog.test.tsx`
- Modify: `frontend/src/constants/routes.ts`
- Modify: `frontend/src/router/routes.ts`
- Modify: `frontend/src/components/Header/Header.tsx`

- [ ] **Step 1: 写失败的聚合搜索与审计测试。**

  以同一个关键词创建项目、任务、材料、证据、风险、会议、合作方、决策、情报；断言 `types=TASK,RISK` 只返回这两类，已归档对象不返回，空/短于 2 字符 `q` 被 DTO 拒绝。断言审计列表按 `occurredAt DESC`，且 before/after 不含 `DATABASE_URL`、`content`、`buffer` 或完整材料正文。

- [ ] **Step 2: 运行测试，确认 RED。**

  Run: `cd backend && pnpm test:unit -- search.service.spec.ts && pnpm test:integration -- governance.controller.spec.ts`

  Expected: FAIL，因为 SearchService/Audit controller 尚不存在。

- [ ] **Step 3: 实现统一的结果和白名单审计。**

  每类查询返回 `SearchHit { entityType, entityId, title, excerpt, occurredAt?, route }`，分别调用 Prisma delegate 的 `{ contains: q, mode: 'insensitive' }`；最大每类取 `pageSize`，服务端合并后按 `occurredAt/createdAt` 降序，再分页，绝不构造动态 SQL。`AuditLogService` 的白名单为每个实体明确定义字段数组，所有新增的治理服务必须使用同一 transaction 调用它；将现有项目、任务、申请、管理、情报服务的写入口逐个改成 `audit.write(tx, ...)`，不在 controller 或前端补写审计。

- [ ] **Step 4: 实现可导航的搜索页和统一快捷入口。**

  `SearchPage` 输入至少 2 个字符才请求；展示类型、标题、摘要、时间与“打开对象”按钮。`GlobalSearchDialog` 放在 `Header` 的本机快捷入口，使用 `/` 或点击打开，同样复用 `search` API；选择结果后按后端 `route` 导航到真实详情工作区。请求失败显示“无法搜索本地工作台”并提供重试；无结果显示空态，不能用 mock 数据替代，也不记录搜索词到远端服务。

- [ ] **Step 5: 验证并提交。**

  Run: `cd backend && pnpm test:unit -- search.service.spec.ts && pnpm test:integration -- governance.controller.spec.ts && cd ../../frontend && pnpm test -- SearchPage.test.tsx GlobalSearchDialog.test.tsx && pnpm typecheck`

  Expected: PASS，关键词不被插入 SQL，审计数据未泄漏敏感字段。

  ```bash
  git add backend/src/modules/workbench backend/test frontend/src/pages/SearchPage.tsx frontend/src/pages/__tests__/SearchPage.test.tsx frontend/src/modules/workbench/components/governance/GlobalSearchDialog.tsx frontend/src/modules/workbench/components/governance/__tests__/GlobalSearchDialog.test.tsx frontend/src/components/Header/Header.tsx frontend/src/constants/routes.ts frontend/src/router/routes.ts
  git commit -m "feat: add global search and audit trail"
  ```

### Task 5: 实现全量验证后才写入的 CSV/XLSX 导入导出

**Files:**
- Create: `backend/src/modules/workbench/governance/application/tabular-transfer.service.ts`
- Create: `backend/src/modules/workbench/governance/interface/http/transfers.controller.ts`
- Create: `backend/src/modules/workbench/governance/interface/http/dto/export-query.dto.ts`
- Modify: `backend/test/unit/modules/workbench/governance/tabular-transfer.service.spec.ts`
- Modify: `backend/test/integration/modules/workbench/governance.controller.spec.ts`
- Create: `frontend/src/modules/workbench/components/governance/ImportDialog.tsx`
- Create: `frontend/src/modules/workbench/components/governance/ExportMenu.tsx`
- Create: `frontend/src/modules/workbench/components/governance/__tests__/ImportDialog.test.tsx`
- Create: `frontend/src/modules/workbench/components/governance/__tests__/ExportMenu.test.tsx`

- [ ] **Step 1: 写失败的 transfer 服务测试。**

  测试项目 CSV 和 XLSX 输出列顺序、BOM、sheet 名；导入包含一个合法行和一个错误 phase 时返回 `{ row: 3, field: 'phase', code: 'INVALID_ENUM' }`，且项目 count 未变；测试任务在同一文件可通过 `projectCode` 找到新项目，歧义 milestone 名报 `IMPORT_REFERENCE_AMBIGUOUS`。测试公式单元格、宏 MIME、未知列和超过 10,000 行均被拒绝。

- [ ] **Step 2: 运行测试，确认 RED。**

  Run: `cd backend && pnpm test:unit -- tabular-transfer.service.spec.ts`

  Expected: FAIL，因为 transfer parser/exporter 不存在。

- [ ] **Step 3: 实现格式检测、解析、验证和原子应用。**

  根据 magic bytes/CSV UTF-8 解码而不是只信扩展名；允许 `text/csv`、`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`，最大 10,000 data rows/10 MiB。先把每行转为 DTO 等价的内部结构、验证列集合和跨行引用，创建 `ImportBatch(status=REJECTED, errors)` 并抛出 422；只有无错误时才进入：

  ```ts
  await prisma.$transaction(async (tx) => {
    const batch = await tx.importBatch.create({ data: { kind, format, originalFileName, sha256, rowCount, status: 'VALIDATED' } })
    for (const row of validatedRows) await createProjectOrTask(tx, row)
    await tx.importBatch.update({ where: { id: batch.id }, data: { status: 'APPLIED', appliedAt: new Date() } })
    await audit.write(tx, { action: 'IMPORT', entityType: kind === 'PROJECTS' ? 'PROJECT' : 'TASK', entityId: batch.id, ... })
  })
  ```

  导出使用 `ExcelJS` 生成 buffer，不落临时文件；CSV 加 BOM 并做 RFC 4180 转义。写入前使用各领域的受控 transaction 创建入口，使项目编号冲突、任务来源校验和健康快照语义不被绕开。

- [ ] **Step 4: 添加 HTTP/前端交互。**

  HTTP 测试以真实 multipart 上传 CSV/XLSX，验证失败后数据库零写入，成功后 `ImportBatch` 和审计存在；导出断言 response headers 和可由 ExcelJS 重新读入。前端 `ImportDialog` 只允许模板类型和扩展名，显示最多 100 条行错误；`ExportMenu` 使用 blob 下载并显示服务端错误，不把二进制交给 JSON parser。

- [ ] **Step 5: 运行回归并提交。**

  Run: `cd backend && pnpm test:unit -- tabular-transfer.service.spec.ts && pnpm test:integration -- governance.controller.spec.ts && cd ../../frontend && pnpm test -- ImportDialog.test.tsx ExportMenu.test.tsx && pnpm typecheck`

  Expected: PASS，任一无效行不会造成部分导入。

  ```bash
  git add backend/src/modules/workbench/governance backend/test frontend/src/modules/workbench/components/governance
  git commit -m "feat: add csv and xlsx transfers"
  ```

### Task 6: 实现可验证的本地备份、恢复前保护和维护修复

**Files:**
- Create: `backend/src/modules/workbench/governance/application/backups.service.ts`
- Create: `backend/src/modules/workbench/governance/application/governance-maintenance.service.ts`
- Create: `backend/src/modules/workbench/governance/interface/http/backups.controller.ts`
- Create: `backend/src/modules/workbench/governance/interface/http/governance-maintenance.controller.ts`
- Create: `backend/src/modules/workbench/governance/interface/http/dto/list-backups-query.dto.ts`
- Modify: `backend/src/infrastructure/config/env.schema.ts`
- Modify: `backend/src/modules/workbench/governance/governance.module.ts`
- Create: `backend/test/unit/modules/workbench/governance/backups.service.spec.ts`
- Create: `backend/test/unit/modules/workbench/governance/governance-maintenance.service.spec.ts`
- Modify: `backend/test/integration/modules/workbench/governance.controller.spec.ts`

- [ ] **Step 1: 写失败的 backup/repair 单测。**

  用注入的 `ProcessRunner` fake，断言 `createBackup` 只调用固定参数数组 `['--format=custom', '--file', dumpPath, databaseUrl]`，manifest 包含 schemaVersion、createdAt、数据库 dump/attachments/recycle 相对路径及 sha256/byteSize；篡改一个附件后 verify 返回 `BACKUP_VERIFICATION_FAILED`。恢复测试断言 verify 失败时不调用 pg_restore，成功路径先调用内部 `createBackup('pre-restore')`，再调用 pg_restore。状态修复测试覆盖 PENDING_UPLOAD 阶段文件、final 文件及两边缺失分别进入 ACTIVE/ACTIVE/MISSING。

- [ ] **Step 2: 运行测试，确认 RED。**

  Run: `cd backend && pnpm test:unit -- backups.service.spec.ts governance-maintenance.service.spec.ts`

  Expected: FAIL，因为 backup/repair 服务和受控 runner 尚不存在。

- [ ] **Step 3: 实现受控备份与 manifest 验证。**

  在配置中增加 `PG_DUMP_PATH`/`PG_RESTORE_PATH`（默认 `pg_dump`/`pg_restore`，只能是单个可执行文件名或绝对已解析路径）；`ProcessRunner` 用 `spawn(executable, args, { shell: false })`，不允许 HTTP 请求覆盖 executable、DB URL、目录或参数。每个备份文件以 `lstat` 拒绝 symlink，以 `resolve` 验证仍在备份根下；manifest 路径是 POSIX 相对路径且不得含 `..`。写 manifest 后再 hash manifest，创建 `BackupRecord(CREATED)` 和审计。

- [ ] **Step 4: 实现恢复原子边界。**

  验证后把现有 `attachments/`、`recycle/` 复制到同 root `restore-staging/<id>`，成功后用 rename 交换目录；DB 使用 `pg_restore --clean --if-exists --no-owner --dbname=<approved DATABASE_URL>`。若 restore 或目录交换失败：保留自动 pre-restore backup、将原附件目录 rename 回去、标记 `BackupRecord.FAILED` 并返回 `BACKUP_RESTORE_FAILED`；不删除证据目录。恢复成功后执行 `prisma migrate deploy` 不可作为请求内命令，因备份 manifest 的 schema version 必须等于当前 migration head；版本不一致直接拒绝。

- [ ] **Step 5: 实现和验证维护 endpoint。**

  `GovernanceMaintenanceService.reconcileAttachments()` 只能处理 PENDING/MISSING 记录，不扫描/删除任意未知文件；返回 `{ activated, trashed, restored, missing, untouched }` 计数并逐项写 audit。HTTP 维护/恢复 endpoint 仅在本机 CORS/source 已通过的 API 内可用，前端须二次确认文字 `RESTORE`，不提供自动恢复。

- [ ] **Step 6: 运行测试并提交。**

  Run: `cd backend && pnpm test:unit -- backups.service.spec.ts governance-maintenance.service.spec.ts && pnpm test:integration -- governance.controller.spec.ts`

  Expected: PASS，损坏 manifest 或任意 hash 不匹配绝不触发 pg_restore。

  ```bash
  git add backend/src/infrastructure/config backend/src/modules/workbench/governance backend/test
  git commit -m "feat: add verified local backups"
  ```

### Task 7: 交付数据治理界面并在已有业务页接入附件

**Files:**
- Modify: `frontend/src/modules/workbench/types.ts`
- Create: `frontend/src/modules/workbench/api/governance.ts`
- Create: `frontend/src/modules/workbench/api/__tests__/governance.contracts.test.ts`
- Create: `frontend/src/modules/workbench/components/governance/AttachmentPanel.tsx`
- Create: `frontend/src/modules/workbench/components/governance/AttachmentLibrary.tsx`
- Create: `frontend/src/modules/workbench/components/governance/BackupPanel.tsx`
- Create: `frontend/src/modules/workbench/components/governance/__tests__/AttachmentPanel.test.tsx`
- Create: `frontend/src/modules/workbench/components/governance/__tests__/AttachmentLibrary.test.tsx`
- Create: `frontend/src/modules/workbench/components/governance/__tests__/BackupPanel.test.tsx`
- Create: `frontend/src/pages/DataCenterPage.tsx`
- Create: `frontend/src/pages/__tests__/DataCenterPage.test.tsx`
- Modify: `frontend/src/pages/ProjectsPage.tsx`
- Modify: `frontend/src/pages/TasksPage.tsx`
- Modify: `frontend/src/pages/ApplicationCasesPage.tsx`
- Modify: `frontend/src/pages/RisksPage.tsx`
- Modify: `frontend/src/pages/MeetingsPage.tsx`
- Modify: `frontend/src/pages/IntelligencePage.tsx`
- Modify: `frontend/src/constants/routes.ts`
- Modify: `frontend/src/router/routes.ts`

- [ ] **Step 1: 写失败的客户端契约和组件测试。**

  契约测试断言上传函数不设置 JSON Content-Type、下载/导出走 `Response.blob()`、查询参数会 URL encode；`AttachmentPanel` 测试拖入 26 MiB 文件在浏览器侧阻止提交、删除后出现“30 天内可恢复”、恢复成功刷新列表。`AttachmentLibrary` 测试对象类型、文件名、状态和更新时间筛选均请求真实 query 参数，密集行可跳转到实体或下载附件。`BackupPanel` 测试在二次确认前不调用 restore，输入 `RESTORE` 后才调用。

- [ ] **Step 2: 运行测试，确认 RED。**

  Run: `cd frontend && pnpm test -- governance.contracts.test.ts AttachmentPanel.test.tsx AttachmentLibrary.test.tsx BackupPanel.test.tsx DataCenterPage.test.tsx`

  Expected: FAIL，因为类型化 client、组件、路由尚不存在。

- [ ] **Step 3: 实现数据中心的强类型 client 和可访问界面。**

  `governance.ts` 使用 `request` 处理 JSON，只为上传/下载/导出增加私有 `requestBinary`，它复用 `VITE_API_BASE_URL`、校验非 2xx 错误 envelope 后返回 blob。`AttachmentPanel` 支持上传、下载、回收/恢复并有 pending/error/empty 状态；传入的 `entityType/entityId` 从当前真实记录取得。`AttachmentLibrary` 是数据中心的资料库页签，以高密度列表呈现真实本地文件、关联对象、大小、更新时间和状态，不能显示文件夹、成员、共享或云同步入口。`DataCenterPage` 包含“资料库、提醒、导入导出、备份恢复、审计”五个相邻页签；每个 destructive 操作以可键盘操作的 Dialog 确认，并保留 loading/empty/error/retry 状态。

- [ ] **Step 4: 将资料库与附件接到真实对象工作区。**

  左侧固定导航新增 `ROUTES.DATA_CENTER = '/data-center'`，标题必须为“数据中心”，不放入设置或项目空间。仅在已选中单项的项目、任务、申请案件、风险、会议、情报卡详情渲染 `AttachmentPanel`；列表行不得虚构 entity id。业务页必须保留现有空态、错误态与 React Query invalidation，上传/恢复后只 invalidate `['attachments', entityType, entityId]`。详情中的“资料”入口和数据中心附件库都打开同一份本地 Attachment 数据，不能形成另一个共享文件空间。

- [ ] **Step 5: 运行前端门禁并提交。**

  Run: `cd frontend && pnpm test && pnpm lint && pnpm typecheck && pnpm typecheck:contracts && pnpm build`

  Expected: PASS；没有 mock 附件/导入/备份数据，所有错误可见且可重试。

  ```bash
  git add frontend/src
  git commit -m "feat: add governance workbench"
  ```

### Task 8: 模块装配、生产迁移、完整验证和双审查

**Files:**
- Create: `backend/src/modules/workbench/governance/governance.module.ts`
- Modify: `backend/src/modules/workbench/workbench.module.ts`
- Modify: `backend/src/shared/errors/error-codes.ts`
- Modify: `README.md`
- Modify: `task_plan.md`
- Modify: `progress.md`

- [ ] **Step 1: 写失败的模块装配/E2E 断言。**

  在 `backend/test/e2e/workbench.spec.ts` 新增：健康后可 `GET /api/search?q=ab`（验证错误而非 404）、`GET /api/reminders`、`GET /api/backups`；在 router/Header 测试断言左侧固定导航存在“数据中心”及 `/data-center`，搜索快捷入口可打开，且不移除首页/项目/任务/申报/管理/情报路由。

- [ ] **Step 2: 运行测试，确认 RED。**

  Run: `cd backend && pnpm test:e2e && cd ../frontend && pnpm test -- routes.test.ts`

  Expected: FAIL，直到 `GovernanceModule` 在 `WorkbenchModule` 导入且页面路由注册。

- [ ] **Step 3: 装配模块、错误码和操作说明。**

  `GovernanceModule` 导入 `StorageModule`、`PrismaModule`、依赖领域 module，注册 controllers/services 并导出 `AuditLogService`/受控 reference service；`WorkbenchModule` 只导入一次。README 追加数据中心仅本机单人、`LOCAL_STORAGE_ROOT` 目录结构、25 MiB 上传限制、回收区 30 天、CSV/XLSX 模板、备份/恢复前自动备份和恢复风险；明确没有云盘、共享、协作者、外链或同步。不把 `.env`/真实路径/密钥写入 README。更新 `task_plan.md`、`progress.md` 将该子项目状态和迁移号记为已执行前需检查事项。

- [ ] **Step 4: 先在测试环境做全量门禁。**

  Run:

  ```bash
  cd backend && pnpm prisma:generate && pnpm test:unit && pnpm test:integration && pnpm test:e2e && pnpm lint && pnpm build
  cd ../frontend && pnpm test && pnpm lint && pnpm typecheck && pnpm typecheck:contracts && pnpm build
  git diff --check
  ```

  Expected: 每个命令退出 0；测试的实际临时目录与 `rd_manager_workbench_test` 保持隔离。

- [ ] **Step 5: 进行规格审查和质量审查，再修复发现的问题。**

  用独立审查代理逐条核对本计划的附件状态机、提醒去重、所有搜索实体、原子导入、manifest hash/恢复前备份、审计白名单和 UI 真实 API；第二个独立审查代理检查 TypeScript/Prisma 类型、并发/文件系统错误、路由可达性、测试是否真正涵盖失败路径。对每项发现先补失败测试，再写最小修复并重跑相关门禁；审查者不得修改实现分支。

- [ ] **Step 6: 在确认本机数据库连接配置后执行唯一的前向生产迁移。**

  Run:

  ```bash
  cd backend && pnpm prisma:migrate:deploy
  ```

  Expected: 只应用 `20260718040000_data_governance_p0`，不 reset/drop/seed 现有数据。迁移失败立即停止，不尝试 `db push`、`migrate reset` 或删除本机目录。

- [ ] **Step 7: 最终运行证明并提交。**

  启动本机 backend 后执行：

  ```bash
  curl --fail http://127.0.0.1:4311/api/health
  curl --fail 'http://127.0.0.1:4311/api/reminders'
  curl --fail 'http://127.0.0.1:4311/api/backups'
  curl --fail 'http://127.0.0.1:4311/api/search?q=project'
  git diff --check
  git status --short
  ```

  Expected: 仅工作台进程监听既有 4311/4312，所有 endpoint 不是 404，工作树只有预期治理改动。最后提交：

  ```bash
  git add backend frontend README.md task_plan.md progress.md
  git commit -m "feat: complete data governance p0"
  ```

## 计划自检

- 附件元数据、本地索引、回收区、恢复、下载和文件系统失败修复：Task 1、2、6、7。
- 提醒、去重、应用内/桌面通知：Task 3、7。
- 全局搜索：Task 4、7，覆盖 PRD 列出的项目、任务、材料、证据、会议、合作方、风险、决策和情报。
- CSV/XLSX 导入导出：Task 5、7，明确定义模板、无部分写入和二进制下载。
- 备份、验证和恢复安全边界：Task 6、8。
- 审计：Task 2、4、5、6，写入与领域 mutation 同 transaction、读取和脱敏均有测试。
- 飞书式本机体验：Task 4、7、8 将全局快捷搜索、左侧“数据中心”、资料库密集行和对象工作区资料入口接到同一真实本地 API；没有云盘协作、共享、聊天、外链或同步接口。
- 每个功能任务都先写可观察的失败测试、确认 RED、做最小实现、确认 GREEN 并提交；没有 `db push`、reset、shell 拼接或任意路径操作。

Plan complete and saved to `docs/superpowers/plans/2026-07-18-data-governance-p0.md`. Recommended execution is Subagent-Driven: dispatch a fresh implementation agent per isolated task, run specification and quality reviews between commits, then merge each verified slice to `main` immediately.
