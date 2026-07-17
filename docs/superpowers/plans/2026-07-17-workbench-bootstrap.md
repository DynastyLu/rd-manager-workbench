# R&D Manager Workbench Bootstrap Implementation Plan

> **Historical / superseded (2026-07-18):** This plan describes the retired root pnpm workspace (`apps/`, `packages/`, and root pnpm commands) and is retained only as project history. Do not execute it. The current engineering baseline is the direct `frontend/` and `backend/` migration defined by [the 2026-07-18 design](../specs/2026-07-18-direct-framework-migration-design.md) and [the 2026-07-18 implementation plan](./2026-07-18-direct-framework-migration.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable Electron desktop skeleton with a React renderer, a NestJS Utility Process backend, and an idempotently initialized local PostgreSQL database.

**Architecture:** A pnpm workspace contains four focused units: Electron desktop lifecycle, sandboxed React renderer, NestJS backend, and shared Zod contracts. Electron owns database/bootstrap orchestration and starts NestJS through `utilityProcess.fork()` on `127.0.0.1:0`; the renderer receives only a validated runtime configuration through preload.

**Tech Stack:** Electron 43.1.1, electron-builder 26.15.3, React 19.2.4, TypeScript 5, Vite 8.0.1, NestJS 10.4.8, Prisma 6.19.3, PostgreSQL 17, Zod, Vitest, Jest, Testing Library, Playwright.

---

## File map

- `apps/desktop`: Electron main/preload, secure protocol, backend lifecycle and packaging entry.
- `apps/renderer`: React shell and read-only health/diagnostics page.
- `apps/backend`: NestJS configuration, Prisma, health API and database bootstrap command.
- `packages/contracts`: Zod schemas/types for backend handshake, runtime configuration and preload API.
- `scripts`: root development and package verification orchestration.

## Task 1: Initialize the isolated workspace repository

**Files:**
- Create: `.gitignore`
- Create: `.npmrc`
- Create: `.prettierignore`
- Create: `.prettierrc`
- Create: `.env.example`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`

- [ ] **Step 1: Capture source repository status without modifying it**

Run:

```bash
git -C /Users/dynastylu/Desktop/AICode/treasure-box status --short > /tmp/rd-workbench-treasure-status.before
git -C /Users/dynastylu/Desktop/AICode/backend-core-platform status --short > /tmp/rd-workbench-backend-status.before
```

Expected: both snapshot files exist; source repositories remain untouched.

- [ ] **Step 2: Verify the isolated implementation worktree**

Run:

```bash
git branch --show-current
git status --short
```

Expected: current branch is `feature/bootstrap` and only planned bootstrap edits appear.

- [ ] **Step 3: Add root workspace configuration**

Use this root package contract:

```json
{
  "name": "rd-manager-workbench",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.1",
  "engines": { "node": ">=22.12.0" },
  "scripts": {
    "dev": "tsx scripts/dev.ts",
    "build": "pnpm -r --if-present build",
    "lint": "pnpm -r --if-present lint",
    "typecheck": "pnpm -r --if-present typecheck",
    "test": "pnpm -r --if-present test",
    "test:package": "vitest run scripts/verify-package.spec.ts",
    "test:smoke:desktop": "playwright test e2e/desktop-smoke.spec.ts",
    "format:check": "prettier . --check",
    "check": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build",
    "db:bootstrap": "pnpm --filter @rd-manager/backend db:bootstrap",
    "package:dir": "pnpm build && electron-builder --dir --config electron-builder.yml",
    "verify:package": "tsx scripts/verify-package.ts"
  },
  "devDependencies": {
    "@playwright/test": "^1.61.1",
    "@types/node": "^22.15.3",
    "@eslint/js": "^9.39.4",
    "eslint": "^9.39.4",
    "electron-builder": "26.15.3",
    "globals": "^17.4.0",
    "prettier": "^3.8.1",
    "tsx": "^4.19.4",
    "typescript": "5.8.3",
    "typescript-eslint": "^8.57.2",
    "vitest": "^4.1.9"
  }
}
```

Set `pnpm-workspace.yaml` to:

```yaml
packages:
  - apps/*
  - packages/*
```

Set `.npmrc` to `node-linker=hoisted` so Electron packaging sees a conventional production dependency tree.

- [ ] **Step 4: Add repository safety rules**

`.gitignore` must include:

```gitignore
node_modules/
dist/
coverage/
release/
.env
.env.local
*.log
.DS_Store
.worktrees/
apps/backend/generated/
```

`.env.example` must contain only non-secret local defaults:

```dotenv
DATABASE_ADMIN_URL=postgresql://dynastylu@127.0.0.1:5432/postgres?connect_timeout=5
DATABASE_URL=postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench?schema=app&connect_timeout=5&connection_limit=5
DATABASE_NAME=rd_manager_workbench
DATABASE_ROLE=rd_manager_workbench_app
HOST=127.0.0.1
PORT=0
LOG_LEVEL=info
ENABLE_SWAGGER=false
```

- [ ] **Step 5: Install root dependencies and verify configuration**

Run:

```bash
pnpm install
pnpm exec prettier . --write
pnpm format:check
```

Expected: install creates one root `pnpm-lock.yaml`; format check exits 0 after formatting configuration files.

- [ ] **Step 6: Commit the workspace baseline**

```bash
git add .
git commit -m "chore: initialize workbench workspace"
```

## Task 2: Define shared process and runtime contracts

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/backend-protocol.ts`
- Create: `packages/contracts/src/runtime-config.ts`
- Create: `packages/contracts/src/preload-api.ts`
- Create: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/backend-protocol.spec.ts`
- Test: `packages/contracts/src/runtime-config.spec.ts`

- [ ] **Step 1: Write failing backend protocol tests**

```ts
import { describe, expect, it } from 'vitest'
import { backendMessageSchema } from './backend-protocol'

describe('backendMessageSchema', () => {
  it('accepts a ready handshake with a random port and matching nonce', () => {
    expect(
      backendMessageSchema.parse({
        type: 'backend-ready',
        protocolVersion: 1,
        nonce: 'nonce-123',
        port: 43127,
        pid: 1234,
        serviceVersion: '0.1.0',
        databaseStatus: 'ready',
      }),
    ).toMatchObject({ type: 'backend-ready', port: 43127 })
  })

  it('rejects privileged or invalid ports', () => {
    expect(() =>
      backendMessageSchema.parse({
        type: 'backend-ready',
        protocolVersion: 1,
        nonce: 'nonce-123',
        port: 0,
        pid: 1234,
        serviceVersion: '0.1.0',
        databaseStatus: 'ready',
      }),
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --filter @rd-manager/contracts test`

Expected: FAIL because the schema modules do not exist.

- [ ] **Step 3: Implement minimal Zod contracts**

Define:

```ts
export const backendReadySchema = z.object({
  type: z.literal('backend-ready'),
  protocolVersion: z.literal(1),
  nonce: z.string().min(8),
  port: z.number().int().min(1024).max(65535),
  pid: z.number().int().positive(),
  serviceVersion: z.string().min(1),
  databaseStatus: z.literal('ready'),
})

export const backendFailedSchema = z.object({
  type: z.literal('backend-failed'),
  protocolVersion: z.literal(1),
  nonce: z.string().min(8),
  code: z.string().min(1),
  message: z.string().min(1),
})

export const backendMessageSchema = z.discriminatedUnion('type', [
  backendReadySchema,
  backendFailedSchema,
])
```

`runtimeConfigSchema` must accept only `apiBaseUrl`, `sessionToken`, `appVersion`, and `platform`, and must require an API URL matching `http://127.0.0.1:<port>`.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
pnpm --filter @rd-manager/contracts test
pnpm --filter @rd-manager/contracts typecheck
```

Expected: all contract tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit shared contracts**

```bash
git add packages/contracts pnpm-lock.yaml
git commit -m "feat: add desktop runtime contracts"
```

## Task 3: Build the NestJS health and configuration skeleton

**Files:**
- Create: `apps/backend/package.json`
- Create: `apps/backend/nest-cli.json`
- Create: `apps/backend/tsconfig.json`
- Create: `apps/backend/tsconfig.build.json`
- Create: `apps/backend/src/app.module.ts`
- Create: `apps/backend/src/bootstrap/create-backend-app.ts`
- Create: `apps/backend/src/main.ts`
- Create: `apps/backend/src/infrastructure/config/env.schema.ts`
- Create: `apps/backend/src/infrastructure/prisma/prisma.module.ts`
- Create: `apps/backend/src/infrastructure/prisma/prisma.service.ts`
- Create: `apps/backend/src/shared/filters/http-exception.filter.ts`
- Create: `apps/backend/src/shared/interceptors/response.interceptor.ts`
- Create: `apps/backend/src/modules/system/health/health.module.ts`
- Create: `apps/backend/src/modules/system/health/health.controller.ts`
- Test: `apps/backend/test/unit/env.schema.spec.ts`
- Test: `apps/backend/test/e2e/health.spec.ts`

- [ ] **Step 1: Write failing environment validation tests**

Cover these behaviors:

```ts
it('accepts desktop mode on loopback with port zero', () => {
  const env = parseEnvironment({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '0',
    DATABASE_URL: TEST_DATABASE_URL,
    INTERNAL_API_TOKEN: 'a'.repeat(43),
    APP_DATA_DIR: '/tmp/rd-manager-test',
    FILES_DIR: '/tmp/rd-manager-test/files',
  })
  expect(env.PORT).toBe(0)
})

it('rejects a non-loopback desktop host', () => {
  expect(() => parseEnvironment({ ...validEnv, HOST: '0.0.0.0' })).toThrow()
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm --filter @rd-manager/backend test:unit -- env.schema.spec.ts`

Expected: FAIL because `parseEnvironment` is missing.

- [ ] **Step 3: Implement the minimal backend app**

`createBackendApp()` must:

```ts
export async function createBackendApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.setGlobalPrefix('api')
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  )
  app.useGlobalFilters(app.get(HttpExceptionFilter))
  app.useGlobalInterceptors(app.get(ResponseInterceptor))
  app.enableShutdownHooks()
  return app
}
```

`GET /api/health/live` returns process liveness without token. `GET /api/health/ready` requires the internal token and returns database readiness using `PrismaService.$queryRaw\`SELECT 1\``.

- [ ] **Step 4: Verify backend tests and build**

Run:

```bash
pnpm --filter @rd-manager/backend test:unit
pnpm --filter @rd-manager/backend test:e2e
pnpm --filter @rd-manager/backend build
```

Expected: all backend tests pass; Nest build exits 0.

- [ ] **Step 5: Commit the backend skeleton**

```bash
git add apps/backend pnpm-lock.yaml
git commit -m "feat: add backend health skeleton"
```

## Task 4: Add safe PostgreSQL bootstrap and initial migration

**Files:**
- Modify: `apps/backend/prisma/schema.prisma` (Task 3 仅预置无业务表的 Prisma Client 生成基线；本任务新增 AppMetadata 模型)
- Create: `apps/backend/prisma/migrations/20260717000000_init/migration.sql`
- Create: `apps/backend/src/infrastructure/database/bootstrap-plan.ts`
- Create: `apps/backend/src/infrastructure/database/bootstrap-database.ts`
- Create: `apps/backend/src/commands/bootstrap-database.ts`
- Test: `apps/backend/test/unit/bootstrap-plan.spec.ts`
- Test: `apps/backend/test/integration/database-bootstrap.spec.ts`

- [x] **Step 1: Write failing bootstrap plan tests**

```ts
it('builds identifiers only for the approved local database and role', () => {
  expect(
    createBootstrapPlan({
      databaseName: 'rd_manager_workbench',
      roleName: 'rd_manager_workbench_app',
    }),
  ).toEqual({
    databaseName: 'rd_manager_workbench',
    roleName: 'rd_manager_workbench_app',
    schemaName: 'app',
  })
})

it.each(['postgres;drop database postgres', 'bad-name', ''])('rejects unsafe identifier %s', (value) => {
  expect(() => createBootstrapPlan({ databaseName: value, roleName: 'rd_manager_workbench_app' })).toThrow()
})
```

- [x] **Step 2: Run tests and verify RED**

Run: `pnpm --filter @rd-manager/backend test:unit -- bootstrap-plan.spec.ts`

Expected: FAIL because bootstrap plan code is missing.

- [x] **Step 3: Implement idempotent bootstrap**

Use `pg` with parameterized value queries and separately validated SQL identifiers. The command must:

1. connect using `DATABASE_ADMIN_URL`;
2. acquire an advisory lock;
3. create `rd_manager_workbench_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE` only when absent;
4. create `rd_manager_workbench` owned by that role only when absent;
5. connect to the target database and create schema `app` owned by the role;
6. execute `prisma migrate deploy` with `DATABASE_URL` in the child environment;
7. release the advisory lock in `finally`.

The command must never issue `DROP DATABASE`, `DROP ROLE`, `prisma db push`, or `prisma migrate reset`.

- [x] **Step 4: Add the baseline schema**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["app"]
}

model AppMetadata {
  key       String   @id
  value     Json
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@schema("app")
  @@map("app_metadata")
}
```

- [x] **Step 5: Verify RED-GREEN and run the real idempotent bootstrap twice**

Run:

```bash
pnpm --filter @rd-manager/backend test:unit -- bootstrap-plan.spec.ts
pnpm db:bootstrap
pnpm db:bootstrap
psql -d rd_manager_workbench -X -A -t -c "select schema_name from information_schema.schemata where schema_name='app';"
```

Expected: tests pass; both bootstrap runs exit 0; the final query prints `app` once.

- [x] **Step 6: Commit database bootstrap**

```bash
git add apps/backend pnpm-lock.yaml
git commit -m "feat: bootstrap local postgres database"
```

## Task 5: Build the React renderer shell

**Files:**
- Create: `apps/renderer/package.json`
- Create: `apps/renderer/tsconfig.json`
- Create: `apps/renderer/tsconfig.node.json`
- Create: `apps/renderer/vite.config.ts`
- Create: `apps/renderer/index.html`
- Create: `apps/renderer/src/main.tsx`
- Create: `apps/renderer/src/app/App.tsx`
- Create: `apps/renderer/src/app/providers.tsx`
- Create: `apps/renderer/src/app/router.tsx`
- Create: `apps/renderer/src/shell/AppShell.tsx`
- Create: `apps/renderer/src/shell/AppSidebar.tsx`
- Create: `apps/renderer/src/shell/AppHeader.tsx`
- Create: `apps/renderer/src/pages/DashboardPage.tsx`
- Create: `apps/renderer/src/pages/SettingsPage.tsx`
- Create: `apps/renderer/src/pages/ModulePlaceholderPage.tsx`
- Create: `apps/renderer/src/lib/runtime.ts`
- Create: `apps/renderer/src/lib/api-client.ts`
- Create: `apps/renderer/src/styles/index.css`
- Copy and adapt: `apps/renderer/src/components/ui/*` from treasure-box
- Test: `apps/renderer/src/app/router.spec.tsx`
- Test: `apps/renderer/src/pages/SettingsPage.spec.tsx`

- [ ] **Step 1: Write failing route and diagnostics tests**

Test that `/` renders `研发主管工作台`, `/settings` renders backend/database diagnostics, and there is no `/login` route.

```tsx
it('renders the local workbench without an authentication redirect', async () => {
  render(<App initialEntries={['/']} />)
  expect(await screen.findByRole('heading', { name: '研发主管工作台' })).toBeVisible()
  expect(screen.queryByText('登录')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run renderer tests and verify RED**

Run: `pnpm --filter @rd-manager/renderer test`

Expected: FAIL because the application shell is missing.

- [ ] **Step 3: Implement the minimal desktop-oriented shell**

Use `HashRouter`, Vite `base: './'`, QueryClient and the copied shadcn primitives. The sidebar contains:

- 工作台
- 项目与任务
- 品种申报
- 风险与决策
- 合作方与会议
- 行业情报
- 报表与提醒
- 设置

The dashboard shows four restrained cards: 今日行动、项目预警、申报节点、情报摘要. Only health/diagnostics are live; business counts display `尚未接入` rather than fabricated data.

- [ ] **Step 4: Implement runtime API access**

`window.workbench.getRuntimeConfig()` is the only source of backend URL and token. `api-client.ts` adds `x-workbench-token` and rejects non-loopback runtime URLs.

- [ ] **Step 5: Verify renderer**

Run:

```bash
pnpm --filter @rd-manager/renderer test
pnpm --filter @rd-manager/renderer typecheck
pnpm --filter @rd-manager/renderer build
```

Expected: tests pass, typecheck exits 0, Vite produces relative static assets.

- [ ] **Step 6: Commit renderer shell**

```bash
git add apps/renderer pnpm-lock.yaml
git commit -m "feat: add workbench renderer shell"
```

## Task 6: Implement Electron backend lifecycle and secure preload

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/main/backend-manager.ts`
- Create: `apps/desktop/src/main/runtime-paths.ts`
- Create: `apps/desktop/src/main/security.ts`
- Create: `apps/desktop/src/main/app-protocol.ts`
- Create: `apps/desktop/src/main/window.ts`
- Create: `apps/desktop/src/preload/index.ts`
- Create: `apps/backend/src/utility-entry.ts`
- Test: `apps/desktop/src/main/backend-manager.spec.ts`
- Test: `apps/desktop/src/main/security.spec.ts`
- Test: `apps/desktop/src/main/runtime-paths.spec.ts`

- [ ] **Step 1: Write failing lifecycle and security tests**

Cover:

```ts
it('publishes runtime configuration only after nonce and health verification', async () => {
  const manager = createBackendManager(fakeUtilityProcess, fakeHealthClient)
  const start = manager.start({ nonce: 'nonce-12345678' })
  fakeUtilityProcess.emitMessage(validReadyMessage({ nonce: 'nonce-12345678' }))
  await expect(start).resolves.toMatchObject({ apiBaseUrl: expect.stringMatching(/^http:\/\/127\.0\.0\.1:/) })
})

it('rejects a ready message with a different nonce', async () => {
  const manager = createBackendManager(fakeUtilityProcess, fakeHealthClient)
  const start = manager.start({ nonce: 'nonce-12345678' })
  fakeUtilityProcess.emitMessage(validReadyMessage({ nonce: 'wrong-nonce' }))
  await expect(start).rejects.toThrow('Backend handshake nonce mismatch')
})
```

Test window preferences equal `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and `webSecurity: true`.

- [ ] **Step 2: Run desktop tests and verify RED**

Run: `pnpm --filter @rd-manager/desktop test`

Expected: FAIL because lifecycle modules do not exist.

- [ ] **Step 3: Implement the backend state machine**

Implement states `STOPPED`, `STARTING`, `READY`, `STOPPING`, `FAILED`. Generate a 32-byte random token and nonce, pass only approved environment values, fork the built backend entry, validate Zod messages, then perform `/api/health/ready` verification before resolving.

Shutdown sends `{ type: 'shutdown' }`, waits up to 5 seconds for `backend-stopped`, and kills the child only after timeout.

- [ ] **Step 4: Implement preload and secure window creation**

Expose exactly:

```ts
contextBridge.exposeInMainWorld('workbench', {
  getRuntimeConfig: () => ipcRenderer.invoke('runtime:get-config'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', { url }),
})
```

Do not expose raw `ipcRenderer`, generic send/on methods, file system objects, environment variables, or shell commands.

- [ ] **Step 5: Verify desktop tests and build**

Run:

```bash
pnpm --filter @rd-manager/desktop test
pnpm --filter @rd-manager/desktop typecheck
pnpm --filter @rd-manager/desktop build
```

Expected: all desktop tests pass and compiled main/preload files exist.

- [ ] **Step 6: Commit desktop lifecycle**

```bash
git add apps/desktop apps/backend packages/contracts pnpm-lock.yaml
git commit -m "feat: orchestrate backend utility process"
```

## Task 7: Add development orchestration and Electron smoke test

**Files:**
- Create: `scripts/dev.ts`
- Create: `playwright.config.ts`
- Create: `e2e/desktop-smoke.spec.ts`
- Modify: `package.json`
- Modify: `apps/desktop/src/main/index.ts`

- [ ] **Step 1: Write the failing desktop smoke test**

```ts
test('starts the local stack and renders backend readiness', async () => {
  const electronApp = await electron.launch({ args: ['apps/desktop/dist/main/index.js'] })
  const window = await electronApp.firstWindow()
  await expect(window.getByRole('heading', { name: '研发主管工作台' })).toBeVisible()
  await window.getByRole('link', { name: '设置' }).click()
  await expect(window.getByText('PostgreSQL 已连接')).toBeVisible()
  await electronApp.close()
})
```

- [ ] **Step 2: Run smoke and verify RED**

Run: `pnpm test:smoke:desktop`

Expected: FAIL because development orchestration and the root script are missing.

- [ ] **Step 3: Implement the dev orchestrator**

`scripts/dev.ts` starts Vite and watch builds, waits for the renderer URL, starts Electron with explicit development environment, forwards termination signals, and kills child processes on exit. It must not start a second standalone Nest HTTP server; the Electron Utility Process owns the backend.

- [ ] **Step 4: Run the smoke test and verify GREEN**

Run:

```bash
pnpm db:bootstrap
pnpm build
pnpm test:smoke:desktop
```

Expected: Electron renders the shell and settings page reports PostgreSQL ready; Electron exits without a residual backend listener.

- [ ] **Step 5: Commit integration orchestration**

```bash
git add scripts e2e playwright.config.ts package.json pnpm-lock.yaml
git commit -m "test: add electron desktop smoke flow"
```

## Task 8: Add packaging configuration and full verification

**Files:**
- Create: `electron-builder.yml`
- Create: `scripts/verify-package.ts`
- Create: `README.md`
- Modify: `package.json`
- Modify: `task_plan.md`
- Modify: `progress.md`

- [ ] **Step 1: Write the failing package verifier test**

Create a Vitest test around `verifyPackageContents()` that fails when renderer dist, backend dist, Prisma schema, migrations, query engine, main, or preload is absent, and fails when a packaged `.env` is present.

- [ ] **Step 2: Run verifier test and verify RED**

Run: `pnpm test:package`

Expected: FAIL because package verifier is missing.

- [ ] **Step 3: Configure electron-builder**

Use:

```yaml
appId: com.local.rdmanager.workbench
productName: 研发主管本地工作台
directories:
  output: release
files:
  - apps/desktop/dist/**
  - apps/renderer/dist/**
  - apps/backend/dist/**
  - packages/contracts/dist/**
  - package.json
  - node_modules/**
asar: true
asarUnpack:
  - '**/.prisma/**'
  - '**/@prisma/engines/**'
  - '**/*.node'
extraResources:
  - from: apps/backend/prisma
    to: backend/prisma
```

The config must not include `.env`, tests, source maps, source repositories, or user data.

- [ ] **Step 4: Implement package verification**

`verifyPackageContents()` checks the unpacked application directory for:

- desktop main and preload;
- renderer `index.html` and assets;
- backend Utility Process entry;
- Prisma schema and at least one migration;
- current architecture query engine;
- absence of `.env` and fixed `localhost:3000` configuration.

- [ ] **Step 5: Run all verification commands**

```bash
pnpm install --frozen-lockfile
pnpm db:bootstrap
pnpm check
pnpm test:smoke:desktop
pnpm package:dir
pnpm verify:package
diff -u /tmp/rd-workbench-treasure-status.before <(git -C /Users/dynastylu/Desktop/AICode/treasure-box status --short)
diff -u /tmp/rd-workbench-backend-status.before <(git -C /Users/dynastylu/Desktop/AICode/backend-core-platform status --short)
```

Expected: every command exits 0; source repository status diffs are empty.

- [ ] **Step 6: Update project records and commit**

Record exact test counts, build outputs, database bootstrap result and remaining platform limitations in `progress.md`. Mark only the bootstrap phase complete in `task_plan.md`.

```bash
git add .
git commit -m "build: package runnable workbench skeleton"
```

## Plan self-review result

- Spec coverage: every bootstrap acceptance criterion maps to Tasks 1–8.
- Scope: business CRUD is intentionally excluded and remains in later subproject plans.
- Safety: original source repositories are read-only and checked by before/after status snapshots.
- Database: creation is idempotent and never drops an existing database or role.
- Type consistency: workspace names are `desktop`, `renderer`, `backend`, and `contracts` throughout.
- Test discipline: behavior tasks include explicit failing-test and passing-test steps; generated configuration is verified by executable commands.
