# 申报认定 P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在本地工作台交付可配置流程的申报案件、条件、材料版本、证据、补正与提交闭环。

**Architecture:** 在既有 `app` PostgreSQL schema 中新增申报领域模型，所有写入经 Nest DTO 与服务层校验。后端提供 `/api/workflow-templates` 和 `/api/application-cases` 资源；前端以案件列表与详情工作台呈现流程、材料和提交状态。完成节点时由服务端统一验证前置节点、必需条件与材料，已提交的版本永远不可原地修改。

**Tech Stack:** React 19、Vite、TanStack Query、Tailwind/shadcn、NestJS、Prisma/PostgreSQL、class-validator、Jest、Vitest。

---

## File structure

- `backend/prisma/schema.prisma` — application enums/models and relations to Project.
- `backend/prisma/migrations/20260718020000_application_case_p0/migration.sql` — forward-only schema migration.
- `backend/src/modules/workbench/applications/**` — DTOs, service, controller, module and tests.
- `backend/src/modules/workbench/workbench.module.ts` — imports application module.
- `backend/src/shared/errors/error-codes.ts` — stable domain error codes.
- `frontend/src/modules/workbench/api/applications.ts` — typed REST client.
- `frontend/src/modules/workbench/components/ApplicationCaseForm.tsx` — creation/edit form.
- `frontend/src/modules/workbench/components/ApplicationCaseWorkspace.tsx` — detail tabs and actions.
- `frontend/src/pages/ApplicationCasesPage.tsx` — case list and query state.
- `frontend/src/app/router.tsx` and layout navigation — route/navigation registration.

### Task 1: Model the application domain

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260718020000_application_case_p0/migration.sql`
- Test: `backend/test/unit/application-schema.contract.spec.ts`

- [ ] **Step 1: Write a failing schema contract test** for the required models/enums and the project-to-case relationship.
- [ ] **Step 2: Run** `pnpm test:unit -- application-schema.contract.spec.ts`; verify RED because models are absent.
- [ ] **Step 3: Add minimal models**: `WorkflowTemplate`, `WorkflowTemplateNode`, `ApplicationCase`, `ApplicationNode`, `ApplicationRequirement`, `ApplicationMaterial`, `MaterialVersion`, `EvidenceRecord`, `EvidenceRecordLink`, `CorrectionRecord`, `SubmissionRecord`, with soft archive only on template/case, UTC timestamps and indexes for list/detail access.
- [ ] **Step 4: Add a forward-only migration**, then run `pnpm prisma:generate` and the test to GREEN.
- [ ] **Step 5: Commit** `feat: add application case data model`.

### Task 2: Implement templates and case lifecycle API

**Files:**
- Create: `backend/src/modules/workbench/applications/application/applications.service.ts`
- Create: `backend/src/modules/workbench/applications/interface/http/application-cases.controller.ts`
- Create: `backend/src/modules/workbench/applications/interface/http/workflow-templates.controller.ts`
- Create: `backend/src/modules/workbench/applications/interface/http/dto/*.ts`
- Create: `backend/src/modules/workbench/applications/applications.module.ts`
- Modify: `backend/src/modules/workbench/workbench.module.ts`
- Modify: `backend/src/shared/errors/error-codes.ts`
- Test: `backend/test/unit/applications.service.spec.ts`
- Test: `backend/test/integration/application-cases-api.spec.ts`

- [ ] **Step 1: Write failing service/API tests** for template create/list, case create/list/detail/update/archive and project/template existence checks.
- [ ] **Step 2: Run focused tests** and verify RED.
- [ ] **Step 3: Implement DTO validation and service operations** using conventional pagination; preserve a template-node snapshot on case creation so template edits cannot rewrite a case history.
- [ ] **Step 4: Add stable errors** `APPLICATION_CASE_NOT_FOUND`, `WORKFLOW_TEMPLATE_NOT_FOUND`, `APPLICATION_CASE_ARCHIVED`, `APPLICATION_PROJECT_NOT_FOUND`; return the established response envelope.
- [ ] **Step 5: Run unit/integration tests to GREEN and commit** `feat: add application case lifecycle api`.

### Task 3: Enforce materials, evidence and workflow completion rules

**Files:**
- Modify: `backend/src/modules/workbench/applications/application/applications.service.ts`
- Modify: `backend/src/modules/workbench/applications/interface/http/application-cases.controller.ts`
- Modify: `backend/src/modules/workbench/applications/interface/http/dto/*.ts`
- Test: `backend/test/unit/applications.service.spec.ts`
- Test: `backend/test/integration/application-cases-api.spec.ts`

- [ ] **Step 1: Write failing tests** for requirement state, material creation, append-only versions, evidence links, correction records, submissions, and node completion rejection when prerequisites/required condition/material are missing.
- [ ] **Step 2: Verify RED** with the focused service test.
- [ ] **Step 3: Implement endpoints** for nodes, requirements, materials/versions, evidence, corrections and submissions. A submission records selected immutable material-version IDs. Reject version replacement after it is referenced by a submission.
- [ ] **Step 4: Implement transaction-scoped validation**: prior node completion, all mandatory requirements satisfied, all mandatory materials have at least one current version; return structured missing item details.
- [ ] **Step 5: Run focused unit/integration tests to GREEN and commit** `feat: complete application materials workflow`.

### Task 4: Add the typed frontend API and route shell

**Files:**
- Create: `frontend/src/modules/workbench/api/applications.ts`
- Modify: `frontend/src/modules/workbench/types.ts`
- Modify: `frontend/src/modules/workbench/api/__tests__/contracts.test.ts`
- Test: `frontend/src/modules/workbench/api/__tests__/applications.test.ts`
- Modify: `frontend/src/app/router.tsx`
- Modify: layout navigation file discovered from router imports

- [ ] **Step 1: Write failing contract and API-client tests** for list/detail/template/create operations and error propagation.
- [ ] **Step 2: Run** `pnpm test -- applications.test.ts`; verify RED.
- [ ] **Step 3: Add exact TypeScript contracts and API functions** matching Task 2/3 response DTOs; register `/application-cases` with lazy route loading and menu navigation.
- [ ] **Step 4: Run client/contract tests to GREEN and commit** `feat: add application case frontend api`.

### Task 5: Build the application case UI

**Files:**
- Create: `frontend/src/pages/ApplicationCasesPage.tsx`
- Create: `frontend/src/modules/workbench/components/ApplicationCaseForm.tsx`
- Create: `frontend/src/modules/workbench/components/ApplicationCaseWorkspace.tsx`
- Test: `frontend/src/modules/workbench/components/__tests__/ApplicationCaseForm.test.tsx`
- Test: `frontend/src/modules/workbench/components/__tests__/ApplicationCaseWorkspace.test.tsx`

- [ ] **Step 1: Write failing component tests** for form validation, list empty/loading/error states, and a completion attempt that exposes server missing-item feedback.
- [ ] **Step 2: Verify RED** with targeted Vitest invocation.
- [ ] **Step 3: Implement a desktop-first list/detail workspace**: create case, select case, show stage progression, requirements, materials/versions, evidence, correction/submission timeline; mutations invalidate only affected queries.
- [ ] **Step 4: Run frontend tests, lint, typecheck and build to GREEN; commit** `feat: add application case workspace`.

### Task 6: Integrate and verify

**Files:**
- Modify: `README.md` or existing local startup documentation only if endpoint/menu discovery is undocumented.
- Modify: `task_plan.md`, `progress.md`

- [ ] **Step 1: Apply migration safely** with `pnpm prisma:migrate:deploy` against the explicitly configured local workbench database; do not reset/drop a database.
- [ ] **Step 2: Run backend verification:** `pnpm prisma:generate`, `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm lint`, `pnpm build`.
- [ ] **Step 3: Run frontend verification:** `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm typecheck:contracts`, `pnpm build`.
- [ ] **Step 4: Perform local smoke verification** of case/template routes; record only observed output.
- [ ] **Step 5: Obtain fresh spec and code-quality reviews, merge the reviewed branch into `main`, and commit** `feat: merge application case workbench`.
