# P2 本地扩展边界 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 增加可审计、可禁用的本地 AI 辅助、数据导出和外部适配器接口，同时把未来多人/LAN 的迁移边界隔离在当前单人系统之外。

**Architecture:** 业务模块只能依赖 `ExtensionOrchestrator`。Provider 由独立 registry 注册，公开配置由适配器验证，运行写不可变摘要记录。当前只交付无网络 `manual`（用户自行输入的建议草稿）和 `local-export`；LLM、飞书/OA/Git/Jira/邮件/日历必须另行实现 adapter，并且用户显式提供授权和配置。密钥永远不进数据库、日志、审计差异或前端状态。

**Tech Stack:** NestJS 10、Prisma 6/PostgreSQL、Node crypto/fs、class-validator、Jest/Supertest、React 19、TanStack Query、Vitest。未来 Electron 使用 safeStorage/系统钥匙串。

---

## 不可变安全边界

- 不实现账号/登录、用户表、组织/权限、SSO、群聊、评论、@提及、实时协同、WebSocket、LAN 监听、云部署、跨设备同步、飞书 API、OAuth、爬虫或自动联网任务。
- 后端继续监听 `127.0.0.1`，绝不改为 `0.0.0.0` 或增加无认证 LAN 路由。
- Profile 默认 DISABLED。执行必须 profile 启用且调用者传 `confirmed:true`。没授权、没配置、未安装 provider 或网络未确认时返回稳定错误，不发网络请求。
- `config` 禁止密钥字段；`credentialRef` 只可引用 OS 安全存储。当前纯浏览器开发模式无法保存凭据，返回 `EXTENSION_CREDENTIAL_STORE_UNAVAILABLE`。
- AI 结果只是建议；不能自动修改项目/任务/风险/决策/材料/报告。执行记录只存输入输出 SHA-256、字节数、对象 ID 和状态，不存正文。

## Files

- Modify: `backend/prisma/schema.prisma`, `backend/src/modules/workbench/workbench.module.ts`, `backend/src/shared/errors/error-codes.ts`.
- Create: `backend/prisma/migrations/20260718060000_local_extensions_p2/migration.sql`.
- Create: `backend/src/modules/workbench/extensions/domain/extension-provider.ts`.
- Create: `backend/src/modules/workbench/extensions/application/{credential-store,extension-registry,extension-orchestrator,export}.service.ts`.
- Create: `backend/src/modules/workbench/extensions/interface/http/{extensions,exports}.controller.ts` and `dto/*.dto.ts`.
- Create: `backend/src/modules/workbench/extensions/extensions.module.ts`.
- Modify: `frontend/src/modules/workbench/types.ts`, `frontend/src/constants/routes.ts`, `frontend/src/router/routes.ts`.
- Create: `frontend/src/modules/workbench/api/extensions.ts`, `components/extensions/{ExtensionProfileForm,RunHistoryPanel,ExportDialog}.tsx`, `pages/ExtensionsPage.tsx`.
- Create: `backend/test/integration/prisma/extensions-catalog.spec.ts`; `backend/test/unit/modules/workbench/{extension-orchestrator,export}.service.spec.ts`; `backend/test/integration/modules/workbench/extensions.controller.spec.ts`; frontend contracts/components/page tests.
- Create: `docs/architecture/future-multiuser-lan-boundary.md`.

## Exact data and API contract

Add enum in `app` schema:

```prisma
enum ExtensionKind { AI_ASSISTANT EXTERNAL_ADAPTER EXPORT }
enum ExtensionProfileStatus { DISABLED ENABLED }
enum ExtensionRunStatus { PENDING SUCCEEDED FAILED REJECTED }
enum ExtensionPermission { NETWORK CREDENTIAL_READ LOCAL_EXPORT }
enum ExtensionExportFormat { JSON CSV MARKDOWN }
```

Add models with UTC timestamps and `@@schema("app")`:

```text
ExtensionProfile(id, providerId, kind, displayName, status=DISABLED, config Json={},
 credentialRef?, createdByActorId?, createdAt, updatedAt, archivedAt?;
 unique(providerId,kind); index(kind,status,archivedAt))
ExtensionRun(id, profileId?, providerId, kind, operation, status, requiresNetwork,
 inputDigest, inputBytes, outputDigest?, outputBytes?, errorCode?, metadata Json,
 createdByActorId?, createdAt, completedAt?; indexes(profileId,createdAt),(status,createdAt))
ExportRecord(id, entityType, format, requestedFrom?, requestedTo?, itemCount,
 outputDigest, outputBytes, relativePath, createdByActorId?, createdAt; index(entityType,createdAt))
```

`createdByActorId` is only a future ownership seam: do not create users/sessions, backfill existing rows or authorise with it. Config rejects case-insensitive key names matching `token|secret|password|apiKey|authorization|credential`. Migration adds named checks that input/output byte counts are nonnegative.

```text
GET /api/extensions/providers
GET/POST/PATCH/DELETE /api/extensions/profiles
POST /api/extensions/profiles/:id/enable
POST /api/extensions/profiles/:id/disable
POST /api/extensions/profiles/:id/runs
GET /api/extensions/runs?page=&pageSize=&profileId=&status=
POST /api/exports
GET /api/exports?page=&pageSize=&entityType=
GET /api/exports/:id/download
```

Initial provider list is exact:

```json
[
  { "id":"manual", "kind":"AI_ASSISTANT", "permissions":[], "network":false,
    "operations":["draft_summary","draft_weekly_report"] },
  { "id":"local-export", "kind":"EXPORT", "permissions":["LOCAL_EXPORT"], "network":false,
    "operations":["export"] }
]
```

Manual provider stores a user-provided local suggestion and sends no request. No network provider appears until its adapter, public schema and authorization UX are separately approved. Use errors `EXTENSION_PROVIDER_NOT_FOUND`, `EXTENSION_PROFILE_NOT_FOUND`, `EXTENSION_PROFILE_DISABLED`, `EXTENSION_PROFILE_ARCHIVED`, `EXTENSION_CONFIRMATION_REQUIRED`, `EXTENSION_NETWORK_NOT_AUTHORIZED`, `EXTENSION_CREDENTIAL_STORE_UNAVAILABLE`, `EXTENSION_SECRET_IN_CONFIG`, `EXTENSION_OPERATION_UNSUPPORTED`, `EXTENSION_RUN_NOT_FOUND`, `EXPORT_ENTITY_UNSUPPORTED`, `EXPORT_RANGE_INVALID`, `EXPORT_NOT_FOUND`, `EXPORT_FILE_MISSING`.

### Task 1: Add extension catalogue and forward migration

**Files:** modify schema; create migration; create `extensions-catalog.spec.ts`.

- [ ] **Step 1: Write failing catalog test.** Assert P2 tables, provider-kind unique index and byte checks. Assert duplicate manual profile rejects P2002 and an ExtensionRun may use null profileId for a disconnected local run.

- [ ] **Step 2: Run RED.**

Run: `cd backend && pnpm test:integration -- extensions-catalog.spec.ts`

Expected: FAIL because tables/delegates are absent.

- [ ] **Step 3: Implement exact enum/models/migration.** Keep only CREATE TYPE/TABLE/INDEX and ADD CONSTRAINT. Inspect for and remove DROP, unrelated table changes, user/session/OAuth/sync table creation and host configuration.

- [ ] **Step 4: Generate Prisma and prove GREEN.**

Run: `cd backend && pnpm prisma:generate && pnpm test:integration -- extensions-catalog.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260718060000_local_extensions_p2 backend/test/integration/prisma/extensions-catalog.spec.ts
git commit -m "feat: add local extension catalogue"
```

### Task 2: Implement provider, credential and confirmation gates

**Files:** create provider contract, credential store, registry, orchestrator, extensions controller/DTO/module; modify module/errors; tests.

- [ ] **Step 1: Write failing security tests.** Secret config returns `EXTENSION_SECRET_IN_CONFIG`; disabled profile gives `EXTENSION_PROFILE_DISABLED`; unconfirmed run gives `EXTENSION_CONFIRMATION_REQUIRED`; unknown provider gives `EXTENSION_PROVIDER_NOT_FOUND`; HTTP response never exposes credentialRef. A fake network provider without `allowNetwork:true` writes REJECTED and fetch spy is never called.

```ts
await expect(service.run(id, { operation: 'draft_summary', confirmed: false, input: 'x' }))
  .rejects.toMatchObject({ code: ErrorCodes.EXTENSION_CONFIRMATION_REQUIRED })
```

- [ ] **Step 2: Run RED.**

Run: `cd backend && pnpm test:unit -- extension-orchestrator.service.spec.ts && pnpm test:integration -- extensions.controller.spec.ts`

Expected: FAIL because contracts/routes are absent.

- [ ] **Step 3: Implement exact safe flow.** Provider exposes id/kind/permissions/requiresNetwork/operations/validatePublicConfig/run. CredentialStore has isAvailable/put/get/delete only; current HTTP implementation is unavailable and does not accept secret input. Registry registers only manual/local-export. Persist PENDING before call, validate enabled/confirmation/network, then persist SUCCEEDED/FAILED/REJECTED with SHA-256, byte counts and redacted metadata.

- [ ] **Step 4: Run GREEN and commit.**

Run: `cd backend && pnpm test:unit -- extension-orchestrator.service.spec.ts && pnpm test:integration -- extensions.controller.spec.ts`

```bash
git add backend/src/modules/workbench/extensions backend/src/modules/workbench/workbench.module.ts backend/src/shared/errors/error-codes.ts backend/test
git commit -m "feat: add guarded local extension interface"
```

### Task 3: Add integrity-recorded local data export

**Files:** create export service/controller/create DTO; tests.

- [ ] **Step 1: Write failing tests.** Request TASK JSON/CSV bounded by date. Assert output under `LOCAL_STORAGE_ROOT/exports/exportId.ext`, record has relative path, digest equals bytes and download is attachment. Unsupported entity gives `EXPORT_ENTITY_UNSUPPORTED`; >93 days `EXPORT_RANGE_INVALID`; missing file `EXPORT_FILE_MISSING` with record retained.

- [ ] **Step 2: Run RED.**

Run: `cd backend && pnpm test:unit -- export.service.spec.ts`

Expected: FAIL.

- [ ] **Step 3: Implement bounded local export.** Allow only PROJECT, TASK, NON_PROJECT_RD, RISK, INTELLIGENCE_ITEM, WEEKLY_REPORT. JSON field order deterministic; CSV header fixed; Markdown weekly report only. Server selects entityType-date-id filename. Write sibling temp, fsync, hash, atomic rename then insert record; if database insert fails remove only newly created output.

- [ ] **Step 4: Run GREEN and commit.**

Run: `cd backend && pnpm test:unit -- export.service.spec.ts && pnpm test:integration -- extensions.controller.spec.ts`

```bash
git add backend/src/modules/workbench/extensions backend/test
git commit -m "feat: add local extension exports"
```

### Task 4: Build constrained extension UI

**Files:** modify types/routes; create extension API, three components/page and tests.

- [ ] **Step 1: Write failing frontend tests.** Form locally blocks secret config; profiles default disabled; enable/run requires confirmation checkbox; history only renders status/digest; export dialog lists only supported entity-format pairs.

- [ ] **Step 2: Run RED.**

Run: `cd frontend && pnpm test -- extensions.contracts.test.ts ExtensionsPage.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement client/UI.** Query keys `['extension-providers']`, `['extension-profiles']`, `['extension-runs',filters]`, `['exports',filters]`. Persistent copy says “联网、LLM 或第三方连接需要你另行提供授权和配置；当前未配置时不会发起网络请求。” No credential/OAuth/multiuser controls or active integration promise.

- [ ] **Step 4: Run frontend gates and commit.**

Run: `cd frontend && pnpm test && pnpm lint && pnpm typecheck && pnpm typecheck:contracts && pnpm build`

Expected: PASS.

```bash
git add frontend/src
git commit -m "feat: add local extension workspace"
```

### Task 5: Verify and document future multiuser/LAN boundary

**Files:** create boundary doc; modify `task_plan.md` and `progress.md`.

- [ ] **Step 1: Write document.** State listener remains 127.0.0.1 and one local operator is assumed. Actor columns are only compatibility seams. Every future write needs actor derivation at auth boundary; relations cannot weaken for sync; a versioned command API may be exposed only after identity, RBAC, migration and conflict-resolution designs are approved. State P2 creates neither schema nor runtime for those features.

- [ ] **Step 2: Apply only forward migration.**

Run: `cd backend && pnpm prisma:migrate:deploy`

Expected: 20260718060000_local_extensions_p2 applies; never reset/db push/DROP/recreate.

- [ ] **Step 3: Run full gates and smoke test.**

Run: `cd backend && pnpm prisma:generate && pnpm test:unit && pnpm test:integration && pnpm test:e2e && pnpm lint && pnpm build && cd ../frontend && pnpm test && pnpm lint && pnpm typecheck && pnpm typecheck:contracts && pnpm build`

Expected: all PASS. Confirm disabled run fails, confirmed manual run creates digest-only history, export downloads, and backend listener stays 127.0.0.1:4311.

- [ ] **Step 4: Obtain independent spec/quality reviews, fix findings and merge into main.** Do not leave user-visible code hidden in a worktree. Commit boundary/status docs after verification.
