# 非项目研发与本地管理 P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 在本地单人飞书式工作台中交付非项目研发、资源技能/负荷、本地日历和可编辑周报草稿。

**Architecture:** 新领域放进 `backend/src/modules/workbench/operations`；`ResourceProfile` 是主管维护的本地资源档案而非登录用户。所有日历/报表只做允许清单内对象的只读投影；周报持久化来源快照并通过版本追加，不能覆盖编辑内容。

**Tech Stack:** NestJS 10、Prisma 6/PostgreSQL、class-validator、Jest/Supertest、React 19、TanStack Query、Vitest、Tailwind/shadcn。

---

## 固定范围

- 非项目事项：技术预研、新方向、平台工具、技术债、专利、标准方法、培训和临时支持；仅生成“建议项目”预填值，绝不自动创建 Project。
- 人员能力/负荷是本机主管的计划视图；禁止由任务 assignee 文本推断人员关联。
- 日历只读任务、里程碑、会议、申报、非项目事项和提醒；无系统日历、邀请或 iCalendar。
- 周报只能本机生成建议草稿，刷新产生新版本，FINAL/ARCHIVED 版本永不修改。
- 不实现账号、组织、权限、协作编辑、评论、聊天、云同步、联网或外部日历。

## Files

- Modify: `backend/prisma/schema.prisma`, `backend/src/modules/workbench/workbench.module.ts`, `backend/src/shared/errors/error-codes.ts`.
- Create: `backend/prisma/migrations/20260718050000_operations_p1/migration.sql`.
- Create: `backend/src/modules/workbench/operations/application/{operations-reference,non-project-rd,resources,calendar,reports}.service.ts`.
- Create: `backend/src/modules/workbench/operations/interface/http/{non-project-rd,resources,calendar,weekly-reports}.controller.ts` and `dto/*.dto.ts`.
- Create: `backend/src/modules/workbench/operations/operations.module.ts`.
- Modify: `frontend/src/modules/workbench/types.ts`, `frontend/src/constants/routes.ts`, `frontend/src/router/routes.ts`.
- Create: `frontend/src/modules/workbench/api/operations.ts`, `components/operations/{NonProjectRdForm,ResourceProfileForm,LoadEntryForm,CalendarBoard,WeeklyReportEditor}.tsx`, `pages/{OperationsPage,CalendarPage,ReportsPage}.tsx`.
- Create tests: `backend/test/integration/prisma/operations-catalog.spec.ts`; `backend/test/unit/modules/workbench/{non-project-rd,resources,calendar,reports}.service.spec.ts`; `backend/test/integration/modules/workbench/operations.controller.spec.ts`; `frontend/src/modules/workbench/api/__tests__/operations.contracts.test.ts`; component/page tests.

## Exact data and API contract

Add all enum in `app` schema:

```prisma
enum NonProjectRdKind { TECH_EXPLORATION NEW_DIRECTION PLATFORM_TOOL TECH_DEBT PATENT STANDARD_METHOD TRAINING TEMPORARY_SUPPORT }
enum NonProjectRdStatus { DRAFT PLANNED IN_PROGRESS ON_HOLD COMPLETED CANCELLED }
enum NonProjectOutcomeStatus { DRAFT VERIFIED REJECTED }
enum SkillLevel { AWARE PRACTICING PROFICIENT EXPERT }
enum LoadEntryKind { NON_PROJECT_RD PROJECT TASK OTHER }
enum WeeklyReportStatus { DRAFT FINAL ARCHIVED }
```

All models have cuid id, UTC created/updated timestamps and `@@schema("app")`. Roots carry `archivedAt`.

```text
NonProjectRdItem(code unique, kind, title, objective?, expectedOutcome?, ownerName?,
 plannedStartAt?, plannedEndAt?, actualStartAt?, actualEndAt?, plannedPersonHours Int=0,
 status, impactScope?, severity?, suggestedProjectName?, projectId?, archivedAt?)
NonProjectRdOutcome(itemId, title, summary?, status, verifiedAt?, evidenceNote?)
ResourceProfile(displayName unique, roleTitle?, weeklyCapacityHours Int=40, developmentGoal?, notes?, archivedAt?)
ResourceSkill(resourceId, name, level, evidence?, assessedAt?; unique(resourceId,name))
ResourceLoadEntry(resourceId, weekStartAt Date, kind, nonProjectRdItemId?, projectId?, taskId?,
 plannedHours Decimal(6,2), note?, archivedAt?)
WeeklyReportDraft(weekStartAt Date, title, content Json, sourceSnapshot Json, status,
 version Int, generatedAt, archivedAt?; unique(weekStartAt,version))
```

Required item/resource FKs use Restrict; optional project/task/item FKs use SetNull. Add indexes: item `[status,archivedAt,plannedEndAt]`, load `[resourceId,archivedAt,weekStartAt]`, report `[weekStartAt,archivedAt]`. Migration includes named `resource_load_entries_reference_by_kind_check`: each NON_PROJECT_RD/PROJECT/TASK row has exactly its matching reference; OTHER has no domain reference.

```text
GET/POST/PATCH/DELETE /api/non-project-rd
GET/POST/PATCH/DELETE /api/non-project-rd/:itemId/outcomes
POST /api/non-project-rd/:itemId/project-suggestion
GET/POST/PATCH/DELETE /api/resources
GET/POST/PATCH/DELETE /api/resources/:resourceId/skills
GET/POST/PATCH/DELETE /api/resources/:resourceId/load-entries
GET /api/resources/load-summary?weekStartAt=YYYY-MM-DD
GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&kinds=TASK,MEETING
GET/POST/PATCH/DELETE /api/weekly-reports
POST /api/weekly-reports/generate
POST /api/weekly-reports/:id/refresh-suggestion
```

Lists use established page/pageSize/search envelope; DELETE soft archives with 204. Add exact stable errors: `NON_PROJECT_RD_NOT_FOUND`, `NON_PROJECT_RD_CODE_EXISTS`, `NON_PROJECT_RD_REFERENCE_INVALID`, `RESOURCE_NOT_FOUND`, `RESOURCE_NAME_EXISTS`, `RESOURCE_SKILL_NOT_FOUND`, `RESOURCE_LOAD_ENTRY_NOT_FOUND`, `RESOURCE_LOAD_REFERENCE_INVALID`, `CALENDAR_RANGE_INVALID`, `WEEKLY_REPORT_NOT_FOUND`, `WEEKLY_REPORT_FINALIZED`, `WEEKLY_REPORT_VERSION_EXISTS`.

### Task 1: Add schema and forward migration

**Files:** modify schema; create P1 migration; test catalog.

- [ ] **Step 1: Write a failing catalog integration test.** Create project/task/resource/item/load; assert P1 tables/indexes. Assert duplicate skill rejects P2002 and an item-kind load without item violates the named check.

```ts
await expect(prisma.resourceSkill.create({
  data: { resourceId, name: 'PostgreSQL', level: 'EXPERT' },
})).rejects.toMatchObject({ code: 'P2002' })
```

- [ ] **Step 2: Run RED.**

Run: `cd backend && pnpm test:integration -- operations-catalog.spec.ts`

Expected: FAIL because delegates/tables do not exist in the test database.

- [ ] **Step 3: Implement exact models, relations and migration.** Generate then inspect SQL; retain only CREATE TYPE/TABLE/INDEX and ADD CONSTRAINT. Remove DROP, reset, database recreation and unrelated schema edits.

- [ ] **Step 4: Generate Prisma and prove GREEN.**

Run: `cd backend && pnpm prisma:generate && pnpm test:integration -- operations-catalog.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260718050000_operations_p1 backend/test/integration/prisma/operations-catalog.spec.ts
git commit -m "feat: add operations p1 data model"
```

### Task 2: Deliver non-project R&D lifecycle

**Files:** create non-project service/controller/create-update-outcome DTOs/module; modify module/errors; test service/controller.

- [ ] **Step 1: Write failing tests** for active code uniqueness, archived exclusion, outcome create, archived project rejection and project suggestion. Assert the suggestion has code/name/type/objective/expectedOutcome/planned dates and no Project write occurs.

- [ ] **Step 2: Run RED.**

Run: `cd backend && pnpm test:unit -- non-project-rd.service.spec.ts && pnpm test:integration -- operations.controller.spec.ts`

Expected: FAIL because API/service is absent.

- [ ] **Step 3: Implement DTO/service.** Trim/reject blank code/title; nonnegative planned hours; `impactScope/severity` allowed only for TECH_DEBT; validate visible project. Soft archive only. Suggest `NPRD-itemCode`, resolve project code collisions with -2, -3 by querying only codes; never call Projects create.

- [ ] **Step 4: Run GREEN and commit.**

Run: `cd backend && pnpm test:unit -- non-project-rd.service.spec.ts && pnpm test:integration -- operations.controller.spec.ts`

```bash
git add backend/src/modules/workbench/operations backend/src/modules/workbench/workbench.module.ts backend/src/shared/errors/error-codes.ts backend/test
git commit -m "feat: add non-project rd lifecycle"
```

### Task 3: Deliver local resource skills and load

**Files:** create resources service/controller/profile-skill-load DTOs; tests.

- [ ] **Step 1: Write failing tests.** Capacity 40 plus 12.5/10 entries yields exactly 22.5 planned, 40 capacity and 56.25 percent. Missing/archived task yields `RESOURCE_LOAD_REFERENCE_INVALID`; active entries block profile archive.

- [ ] **Step 2: Run RED.**

Run: `cd backend && pnpm test:unit -- resources.service.spec.ts`

Expected: FAIL because ResourcesService does not exist.

- [ ] **Step 3: Implement profile, skill, load and summary.** Store Decimal then serialize Number; normalize week start to Monday UTC; reject any other date. Skill update replaces level/evidence instead of duplicate insert; only query nonarchived references.

- [ ] **Step 4: Run GREEN and commit.**

Run: `cd backend && pnpm test:unit -- resources.service.spec.ts && pnpm test:integration -- operations.controller.spec.ts`

```bash
git add backend/src/modules/workbench/operations backend/test
git commit -m "feat: add local resource load management"
```

### Task 4: Build local calendar and weekly reports

**Files:** create calendar/reports services, controllers and DTOs; tests.

- [ ] **Step 1: Write failing calendar tests.** Seed due task, noon meeting and planned item; assert event exact kind/sourceId/title/startsAt/allDay/route, archived exclusion, and a range greater than 93 days gives `CALENDAR_RANGE_INVALID`.

- [ ] **Step 2: Run RED.**

Run: `cd backend && pnpm test:unit -- calendar.service.spec.ts`

Expected: FAIL.

- [ ] **Step 3: Implement calendar.** Query each allowed entity separately; date-only fields produce all-day UTC bounds, timed remain timed; sort startsAt/kind/sourceId. Routes: task `/tasks`, project/milestone `/projects`, meeting `/meetings`, application `/application-cases`, item `/operations`.

- [ ] **Step 4: Write failing weekly report tests.** Generated source snapshot stores IDs/timestamps/counts and content keys `highlights/projectProgress/risks/nonProjectProgress/nextWeek`. Final update gets `WEEKLY_REPORT_FINALIZED`. Refresh yields version 2 while version 1 bytes remain unchanged.

- [ ] **Step 5: Implement report generation.** Monday-only seven-day UTC interval queries progress, completed/late tasks, high risks, held meetings and verified outcomes. Content arrays are `{sourceType,sourceId,text}`. Use a serializable transaction and advisory lock by week to create next version. Do not call AI.

- [ ] **Step 6: Run GREEN and commit.**

Run: `cd backend && pnpm test:unit -- calendar.service.spec.ts reports.service.spec.ts && pnpm test:integration -- operations.controller.spec.ts`

```bash
git add backend/src/modules/workbench/operations backend/test
git commit -m "feat: add local calendar and weekly reports"
```

### Task 5: Build P1 workspaces, verify and review

**Files:** frontend types/API/components/pages/routes and listed Vitest files; status files.

- [ ] **Step 1: Write failing frontend tests.** Assert API URL encoding/contracts; Operations/Calendar/Reports have loading/error/empty states; calendar separates all-day/timed; FINAL report disables save and offers “生成新版本”.

- [ ] **Step 2: Run RED.**

Run: `cd frontend && pnpm test -- operations.contracts.test.ts OperationsPage.test.tsx CalendarPage.test.tsx ReportsPage.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement typed client and Feishu-style object workspaces.** Keys: `['non-project-rd',filters]`, `['resources',filters]`, `['calendar',from,to,kinds]`, `['weekly-reports',week]`. Create in dialog/drawer, use selected detail panel, invalidate only affected keys. Register labels `研发运营`, `日历`, `研发报表`; never render a people directory or collaboration control.

- [ ] **Step 4: Run frontend gates.**

Run: `cd frontend && pnpm test && pnpm lint && pnpm typecheck && pnpm typecheck:contracts && pnpm build`

Expected: all PASS.

- [ ] **Step 5: Apply only forward migration and run full backend gates.**

Run: `cd backend && pnpm prisma:migrate:deploy && pnpm prisma:generate && pnpm test:unit && pnpm test:integration && pnpm test:e2e && pnpm lint && pnpm build`

Expected: all PASS; never migrate reset, db push, DROP or recreate database.

- [ ] **Step 6: Smoke/review/merge.** Create a TECH_EXPLORATION/resource/load; verify calendar/report values and frontend navigation. Obtain independent spec and quality reviews, fix findings, merge reviewed branch into main, update `task_plan.md`/`progress.md` and commit status.
