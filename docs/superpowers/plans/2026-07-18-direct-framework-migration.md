# 真实前后端框架直接迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将真实的 treasure-box 与 backend-core-platform 迁入目标项目，清除旧业务并在保留的框架内开始研发主管工作台业务。

**Architecture:** 目标根目录含两个独立可运行工程：`frontend/` 直接承接 treasure-box，`backend/` 直接承接 backend-core-platform。迁移时先复制、验证、再在目标副本删除旧业务；Electron 仅作为后续第三个独立目录，不改变前后端真实工程的内部结构。

**Tech Stack:** React 19、Vite、TypeScript、Tailwind/shadcn、React Query、Zustand；NestJS 10、Prisma、PostgreSQL 17、Jest。

---

### Task 1: 建立可追溯的真实工程副本

**Files:**
- Create: `frontend/**`（从 `/Users/dynastylu/Desktop/AICode/treasure-box` 复制）
- Create: `backend/**`（从 `/Users/dynastylu/Desktop/AICode/backend-core-platform` 复制）
- Create: `docs/migration/source-manifest.md`
- Delete: 根目录旧自建 `apps/**`、`packages/**`、`pnpm-workspace.yaml`、根 `package.json`、根 `pnpm-lock.yaml`、根 `tsconfig.base.json`、根 `vitest.config.ts`

- [ ] **Step 1: 记录源状态和源文件清单**

Run:

```bash
git -C /Users/dynastylu/Desktop/AICode/treasure-box status --porcelain > /tmp/rd-workbench-treasure.before
git -C /Users/dynastylu/Desktop/AICode/backend-core-platform status --porcelain > /tmp/rd-workbench-backend.before
(cd /Users/dynastylu/Desktop/AICode/treasure-box && rg --files -g '!node_modules' -g '!dist' -g '!coverage' -g '!playwright-report' -g '!storybook-static') > /tmp/rd-workbench-treasure.files
(cd /Users/dynastylu/Desktop/AICode/backend-core-platform && rg --files -g '!node_modules' -g '!dist' -g '!var') > /tmp/rd-workbench-backend.files
```
Expected: 两份状态快照和两份不含构建产物的文件清单存在。

- [ ] **Step 2: 复制真实工程且排除生成物**

Run:

```bash
rsync -a --delete \
  --exclude '.git' --exclude 'node_modules' --exclude 'dist' --exclude 'coverage' \
  --exclude 'playwright-report' --exclude 'storybook-static' --exclude 'test-results' \
  /Users/dynastylu/Desktop/AICode/treasure-box/ frontend/
rsync -a --delete \
  --exclude '.git' --exclude 'node_modules' --exclude 'dist' --exclude 'var' \
  /Users/dynastylu/Desktop/AICode/backend-core-platform/ backend/
```

Expected: `frontend/package.json` 的 name 为 `treasure-box`，`backend/package.json` 的 name 为 `backend-core-platform`。

- [ ] **Step 3: 写入迁移来源说明**

Create `docs/migration/source-manifest.md` with source paths, copy exclusions, source Git HEADs, and the guarantee that source worktrees are read-only.

- [ ] **Step 4: 验证副本确实来自真实框架**

Run:

```bash
test -f frontend/src/main.tsx
test -f frontend/src/router/routes.ts
test -f frontend/src/stores/theme.ts
test -f backend/src/main.ts
test -f backend/src/app.module.ts
test -f backend/src/infrastructure/config/app-config.module.ts
test -f backend/src/infrastructure/prisma/prisma.module.ts
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend backend docs/migration
git commit -m "chore: import real frontend and backend frameworks"
```

### Task 2: 用真实前端框架替换旧业务

**Files:**
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/router/routes.ts`
- Modify: `frontend/src/constants/routes.ts`
- Create: `frontend/src/pages/WorkbenchHome.tsx`
- Create: `frontend/src/pages/WorkbenchSettings.tsx`
- Delete: `frontend/src/pages/Login.tsx`, `Admin.tsx`, `AdminUsers.tsx`, `OcrTool.tsx`, `HairstyleTool.tsx`, `CopyrightRiskTool.tsx`, `History.tsx`, `Mine.tsx`, `Profile.tsx`
- Delete: `frontend/src/services/auth.ts`, `copyrightRisk.ts`, `hairstyle.ts`, `jobs.ts`, `ocr.ts`, `users.ts` and their old-business tests
- Delete: `frontend/src/stores/auth.ts`, authentication mocks and old-business component directories
- Test: `frontend/src/router/__tests__/routes.test.ts`
- Test: `frontend/src/pages/__tests__/WorkbenchHome.test.tsx`

- [ ] **Step 1: 写失败路由测试**

Create assertions that `/` resolves to `WorkbenchHome`, `/settings` resolves to `WorkbenchSettings`, no route requires authentication, and old OCR/hairstyle/copyright paths are absent.

- [ ] **Step 2: 运行测试确认 RED**

Run: `cd frontend && pnpm test src/router/__tests__/routes.test.ts`

Expected: FAIL because workbench routes/pages do not exist.

- [ ] **Step 3: 实现最小工作台入口**

Use the existing `Layout` and generic UI components. Replace `BrowserRouter` with `HashRouter` for Electron compatibility, remove auth bootstrap/ProtectedRoute/Login imports, map only `WorkbenchHome` and `WorkbenchSettings`, and render “研发主管工作台” as the heading.

- [ ] **Step 4: 删除旧前端业务并修复引用**

Remove only code coupled to login, admin users, OCR, hairstyles, copyright, old job history, old profile and their mocks/tests. Preserve `components/ui`, Layout, Sidebar, Header, ErrorBoundary, theme, toast, i18n, Query client and build tooling unless a deleted import requires a small generic replacement.

- [ ] **Step 5: 运行 GREEN 验证**

Run:

```bash
cd frontend
pnpm test src/router/__tests__/routes.test.ts src/pages/__tests__/WorkbenchHome.test.tsx
pnpm typecheck
pnpm lint
pnpm build
```

Expected: tests, typecheck, lint and build exit 0.

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "feat: rebase workbench on treasure-box"
```

### Task 3: 用真实后端框架替换旧业务并接入本地 PostgreSQL

**Files:**
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/main.ts`
- Modify: `backend/src/infrastructure/config/env.schema.ts`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/src/modules/workbench/workbench.module.ts`
- Create: `backend/src/modules/workbench/interface/http/workbench.controller.ts`
- Create: `backend/prisma/migrations/<timestamp>_workbench_baseline/migration.sql`
- Delete: `backend/src/modules/iam/**`, `backend/src/modules/platform/tenant/**`, `backend/src/modules/system/ai-assistant-mock/**`, `backend/src/modules/system/jobs/**`, `backend/src/modules/system/metrics/**`, `backend/src/modules/system/queue-admin/**`, `backend/src/modules/tag-management-mock/**`, `backend/src/modules/tools/**`, `backend/src/workers/ocr/**`
- Test: `backend/test/e2e/app.spec.ts`
- Test: `backend/test/unit/infrastructure/config/env.schema.spec.ts`

- [ ] **Step 1: 写失败的单机工作台健康检查测试**

Add an e2e assertion that `GET /api/health/ready` is loopback-safe and `GET /api/workbench/status` returns a stable local-workbench payload without login or tenant headers.

- [ ] **Step 2: 运行测试确认 RED**

Run: `cd backend && pnpm test:e2e --runInBand`

Expected: FAIL because the workbench endpoint and reduced module graph do not exist.

- [ ] **Step 3: 实现最小工作台模块**

Keep `AppConfigModule`, `RequestContextModule`, `PrismaModule`, logger, filters, response interceptor, health and storage/queue abstractions. Import `WorkbenchModule`; remove old IAM, tenant, tools, mock and old job module imports. The new controller responds with `{ mode: 'local', database: 'postgresql' }` through the existing response interceptor.

- [ ] **Step 4: 重置目标副本的业务数据模型，不重置实际数据库**

Replace legacy Prisma domain models with the first workbench model(s), retaining datasource/generator and the existing local PostgreSQL URL contract. Create a forward-only migration. Do not run `prisma db push`, `prisma migrate reset`, `DROP DATABASE`, or `DROP ROLE`.

- [ ] **Step 5: 删除旧后端业务且修复保留基础设施耦合**

Remove the listed old modules, their controllers/tests, OCR worker entry and only the configuration fields/dependencies that become unused. Keep generic configuration validation, database service, request context, logger, exception filter and response interceptor.

- [ ] **Step 6: 运行 GREEN 验证**

Run:

```bash
cd backend
pnpm prisma:generate
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm lint
pnpm build
```

Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "feat: rebase workbench on backend core platform"
```

### Task 4: 移除错误自建结构并验证真实工程独立运行

**Files:**
- Delete: `apps/**`
- Delete: `packages/**`
- Delete: `pnpm-workspace.yaml`
- Delete: root `package.json`, `pnpm-lock.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `eslint.config.mjs`
- Modify: `.gitignore`
- Modify: `README.md`
- Test: `docs/migration/source-manifest.md`

- [ ] **Step 1: 确认两个真实工程均已完成 GREEN 验证**

Run the Task 2 and Task 3 verification commands before deletion.

- [ ] **Step 2: 删除此前错误自建工程层**

Delete only target files listed above after `frontend` and `backend` builds pass. Preserve `docs/`, `task_plan.md`, `findings.md` and `progress.md` until their content is moved into `docs/`.

- [ ] **Step 3: 更新根说明与忽略规则**

Make `README.md` point developers to `frontend/` and `backend/` commands. Keep `.worktrees/`, `frontend/node_modules/`, `backend/node_modules/`, each build output and local environment files ignored.

- [ ] **Step 4: 验证源仓库零改动和目标目录结构**

Run:

```bash
diff -u /tmp/rd-workbench-treasure.before <(git -C /Users/dynastylu/Desktop/AICode/treasure-box status --porcelain)
diff -u /tmp/rd-workbench-backend.before <(git -C /Users/dynastylu/Desktop/AICode/backend-core-platform status --porcelain)
test -f frontend/package.json
test -f backend/package.json
test ! -e apps
test ! -e packages
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: use direct frontend and backend project roots"
```
