# Function Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development and superpowers:test-driven-development. This plan is executed in the user's current workspace; do not create worktrees, do not revert unrelated dirty changes, and do not commit from parallel workers.

**Goal:** Complete the five P0 reliability items and nine P1 functional-closure items defined in the 2026-07-29 product documents.

**Architecture:** Work is split by ownership boundary: project planning, knowledge/NOVA, employee-meeting activity closure, and desktop/reporting integration. Each stream owns its files and tests. Cross-module data writes use existing service APIs or explicit domain services; no mirrored business records are introduced.

**Tech Stack:** React 18, TypeScript, Semi Design, TanStack Query, NestJS, Prisma/PostgreSQL, Electron, Vitest, Jest, Playwright.

**Source specifications:**

- `docs/product/2026-07-29-functional-issues.md`
- `docs/product/2026-07-29-productivity-feature-roadmap.md`

---

## Workstream A: Saved views and project planning

**Requirements:** FUNC-P0-001, FUNC-P1-001, FUNC-P1-002.

**Files:**

- Modify: `frontend/src/modules/base/hooks.ts`
- Modify: `frontend/src/pages/LibraryHomePage.tsx`
- Test: `frontend/src/modules/base/__tests__/ViewSettings.test.tsx`
- Modify: `frontend/src/pages/ProjectWorkspacePage.tsx`
- Modify: `frontend/src/pages/ProjectWorkspacePage.less`
- Modify: `frontend/src/modules/workbench/components/ProjectProgressTimeline.tsx`
- Modify: `frontend/src/modules/workbench/components/MilestoneForm.tsx`
- Modify: `frontend/src/modules/workbench/api/projects.ts`
- Modify: `frontend/src/modules/workbench/types.ts`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260729_project_plan_baseline/migration.sql`
- Modify: `backend/src/modules/workbench/projects/application/projects.service.ts`
- Modify: `backend/src/modules/workbench/projects/application/project-progress.service.ts`
- Modify: `backend/src/modules/workbench/projects/interface/http/projects.controller.ts`
- Create: `backend/src/modules/workbench/projects/application/project-plan.service.ts`
- Create: `backend/test/unit/modules/workbench/project-plan.service.spec.ts`
- Test: `frontend/src/pages/__tests__/ProjectWorkspacePage.test.tsx`

- [ ] Write a regression test that schedules an automatic view save, flushes a manual save, performs a later edit, and asserts the later config is persisted last.
- [ ] Run the focused Vitest test and confirm it fails with the old sort direction.
- [ ] Replace per-call config queuing with a per-view monotonic revision queue. Only the latest acknowledged revision may update server snapshots or rollback state.
- [ ] Run all saved-view tests and verify manual save, switch, unmount, failure rollback, and later edits.
- [ ] Add project work-item view tests for list, board, calendar, and Gantt using the same `WorkTask` IDs.
- [ ] Reuse existing project tasks and existing view components; do not create base mirror records.
- [ ] Add project-plan baseline tables for baseline header, milestone/task snapshots, and plan-change records.
- [ ] Add service tests for creating a baseline, calculating dependency-based critical tasks, recording schedule changes, and rejecting cross-project dependencies.
- [ ] Add project endpoints to create/list/get baselines and preview schedule impact before committing date changes.
- [ ] Render baseline variance and critical-path markers in the project overview and Gantt view.
- [ ] Run focused backend tests, frontend tests, type checks, lint, and builds.

## Workstream B: Knowledge transport, scanning, history, and index repair

**Requirements:** FUNC-P0-002, FUNC-P0-004, FUNC-P1-006, FUNC-P1-009.

**Files:**

- Create: `frontend/src/lib/api-url.ts`
- Test: `frontend/src/lib/__tests__/api-url.test.ts`
- Modify: `frontend/src/lib/http.ts`
- Modify: `frontend/src/modules/knowledge/api.ts`
- Modify: `frontend/src/pages/KnowledgeHomePage.tsx`
- Modify: `frontend/src/modules/knowledge/components/KnowledgeFolderSync.tsx`
- Modify: `frontend/src/modules/knowledge/components/KnowledgeSessionList.tsx`
- Modify: `frontend/src/modules/knowledge/types.ts`
- Modify: `backend/src/modules/workbench/knowledge/application/session.service.ts`
- Modify: `backend/src/modules/workbench/knowledge/application/folder-watch.service.ts`
- Modify: `backend/src/modules/workbench/knowledge/application/indexing.service.ts`
- Modify: `backend/src/modules/workbench/knowledge/interface/http/knowledge.controller.ts`
- Create: `backend/src/modules/workbench/knowledge/interface/http/dto/knowledge-pagination.dto.ts`
- Create: `backend/src/modules/workbench/knowledge/application/index-health.service.ts`
- Create: `backend/test/unit/modules/workbench/index-health.service.spec.ts`
- Test: `backend/test/unit/modules/workbench/session.service.spec.ts`
- Test: `frontend/src/modules/knowledge/__tests__/KnowledgeSessionList.test.tsx`
- Test: `frontend/src/pages/__tests__/KnowledgeHomePage.test.tsx`

- [ ] Write URL tests for development HTTP and packaged `file://` runtime configuration.
- [ ] Expose a single API URL resolver and use it for JSON, streams, upload/download, SSE, and polling.
- [ ] Add folder progress tests for indeterminate discovery, known totals, reconnect snapshots, and retrying failed files.
- [ ] Replace the fixed scanning percentage with indeterminate progress until the backend publishes a total, then use real counts.
- [ ] Persist enough progress state for page refresh/reconnect and expose failed-file details with safe error categories.
- [ ] Add cursor pagination to session lists and message history; pinned sessions stay deterministic and cursors are opaque.
- [ ] Add virtual/incremental rendering in the session sidebar and upward history loading in conversations.
- [ ] Add an index-health query grouping missing extraction, chunks, embeddings, files, and unsupported formats.
- [ ] Add retry endpoints for one item, all failed items, and safe ignore; audit every retry/ignore action.
- [ ] Render an index-health repair queue and disclose excluded document counts in NOVA scope.
- [ ] Run focused backend/frontend tests, type checks, lint, and builds.

## Workstream C: Employee, meeting, and activity closure

**Requirements:** FUNC-P1-003, FUNC-P1-004, FUNC-P1-005.

**Files:**

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260729_activity_and_progress_drafts/migration.sql`
- Create: `backend/src/modules/workbench/activity/activity.module.ts`
- Create: `backend/src/modules/workbench/activity/application/activity.service.ts`
- Create: `backend/src/modules/workbench/activity/interface/http/activity.controller.ts`
- Create: `backend/src/modules/workbench/activity/interface/http/dto/activity.dto.ts`
- Create: `backend/test/unit/modules/workbench/activity.service.spec.ts`
- Modify: `backend/src/modules/workbench/workbench.module.ts`
- Create: `backend/src/modules/workbench/employees/application/project-progress-draft.service.ts`
- Create: `backend/test/unit/modules/workbench/project-progress-draft.service.spec.ts`
- Modify: `backend/src/modules/workbench/employees/interface/http/employees.controller.ts`
- Modify: `backend/src/modules/workbench/management/application/meetings.service.ts`
- Modify: `backend/src/modules/workbench/tasks/application/tasks.service.ts`
- Test: `backend/test/unit/modules/workbench/meetings.service.spec.ts`
- Modify: `frontend/src/pages/EmployeesPage.tsx`
- Modify: `frontend/src/pages/ProjectWorkspacePage.tsx` only through a new isolated child component import
- Create: `frontend/src/modules/activity/api.ts`
- Create: `frontend/src/modules/activity/components/ActivityTimeline.tsx`
- Test: `frontend/src/modules/activity/__tests__/ActivityTimeline.test.tsx`
- Create: `frontend/src/modules/employees/components/ProjectProgressDrafts.tsx`
- Test: `frontend/src/modules/employees/__tests__/ProjectProgressDrafts.test.tsx`

- [ ] Add failing tests that group current completed weekly work by project and produce deterministic completion, next-plan, blocker, risk, and hours sections.
- [ ] Store generated project-progress drafts with source batch/version IDs and a content fingerprint.
- [ ] Add preview/adopt/ignore endpoints; adopting creates one project progress report and optional risks/tasks in one transaction.
- [ ] Make regeneration idempotent and invalidate drafts when an imported version is restored.
- [ ] Add failing meeting tests proving a linked task completion/cancellation updates the action status and due-date changes require explicit sync direction.
- [ ] Implement task-to-action synchronization without recursive writes; preserve the meeting action as the source object.
- [ ] Add an append-only activity model with actor kind, object type/id, project/employee links, action, safe summary, timestamp, and source path.
- [ ] Publish activities for project, task, progress, risk, meeting, document, employee import, and automatic adoption actions.
- [ ] Add cursor-filtered activity APIs and render reusable project/employee timelines.
- [ ] Run focused unit/integration/frontend tests, Prisma validation, type checks, lint, and builds.

## Workstream D: Desktop readiness, Windows tools, backups, and reports

**Requirements:** FUNC-P0-003, FUNC-P0-005, FUNC-P1-007, FUNC-P1-008.

**Files:**

- Create: `desktop/src/startup-preflight.ts`
- Create: `desktop/src/database-bootstrap.ts`
- Test: `desktop/src/startup-preflight.test.ts`
- Test: `desktop/src/database-bootstrap.test.ts`
- Modify: `desktop/src/main.ts`
- Modify: `desktop/package.json`
- Modify: `desktop/electron-builder.yml`
- Modify: `backend/src/modules/workbench/governance/application/data-health.service.ts`
- Modify: `backend/src/modules/workbench/governance/application/backups.service.ts`
- Modify: `backend/src/modules/workbench/governance/application/restore-preflight.service.ts`
- Test: `backend/test/unit/modules/workbench/data-health.service.spec.ts`
- Test: `backend/test/unit/modules/workbench/backups.service.spec.ts`
- Modify: `frontend/src/pages/DataGovernancePage.tsx`
- Modify: `frontend/src/pages/ReportsPage.tsx`
- Modify: `frontend/src/pages/ReportsPage.less`
- Modify: `frontend/src/modules/workbench/api/reports.ts`
- Modify: `backend/src/modules/workbench/reporting/application/reports.service.ts`
- Modify: `backend/src/modules/workbench/reporting/interface/http/reports.controller.ts`
- Modify: `backend/src/modules/workbench/reporting/interface/http/dto/reports.dto.ts`
- Test: `backend/test/unit/modules/workbench/reports.service.spec.ts`
- Test: `frontend/src/pages/__tests__/ReportsPage.test.tsx`

- [ ] Add startup-preflight tests for port conflict, PostgreSQL unreachable, missing database, pending migrations, and unwritable storage.
- [ ] Add a safe bootstrap runner that creates/verifies the approved local role/database/schema and deploys migrations before opening the business window.
- [ ] Replace the current error-box-only path with a repair window/state machine and retry.
- [ ] Add Windows discovery for PostgreSQL client tools and validate exact executable versions before backup/restore.
- [ ] Surface native model runtime, WASM fallback, cache directory, and platform dependency status in data health.
- [ ] Add Windows packaging scripts that rebuild native dependencies on Windows; add a smoke script for launch, health, model status, backup preflight, and renderer load.
- [ ] Add report comparison parameters, drill-down queries, saved report-view storage, and report snapshot generation.
- [ ] Render trend charts with accessible table fallbacks; every chart point links to filtered source records.
- [ ] Add data-health UI actions for selecting tool locations and running a non-destructive restore rehearsal.
- [ ] Run desktop tests, backend tests, frontend tests, type checks, lint, builds, and available packaging smoke checks.

## Integration and final review

**Files:**

- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`
- Modify: `docs/product/2026-07-29-functional-issues.md`
- Modify: `docs/product/2026-07-29-productivity-feature-roadmap.md`

- [ ] Review each workstream against every FUNC identifier.
- [ ] Resolve file overlaps without discarding user or other-agent changes.
- [ ] Deploy new migrations to the test database and a cloned populated database.
- [ ] Run backend unit/integration/build/lint, frontend tests/typecheck/contracts/build/lint, and desktop tests/build.
- [ ] Run browser smoke for project views, employee progress drafts, meeting synchronization, activity timelines, reports, knowledge history/index repair, and folder progress.
- [ ] Run Electron smoke for runtime URL, startup preflight, and data-health paths.
- [ ] Record any Windows-only action that cannot be executed on the current macOS host as an explicit external acceptance boundary; do not report it as verified.
- [ ] Update the two product documents with actual delivered status and remaining platform-only acceptance.

