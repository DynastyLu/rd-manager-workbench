# Employee Weekly Workbook V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visible employee weekly-report template with the approved multi-sheet V2 workbook, preserve V1 import compatibility, persist every V2 business field, and complete the import, association, progress, plan, project, risk, load, search, reminder, export, versioning, audit, and cross-platform workflows.

**Architecture:** Keep the existing import batch state machine and weekly snapshot pipeline. Add a format detector plus a focused V2 workbook codec, extend the existing work-item model, introduce a separate next-week plan model, and reuse the existing resolution workflow through one bulk association modal. Current-week facts continue driving completion snapshots; future plans are queried and reported separately so they never corrupt current-week metrics.

**Tech Stack:** NestJS 10, Prisma 6, PostgreSQL, ExcelJS, React 19, TanStack Query, Semi Design, Socket.IO, Jest, Vitest, Playwright.

---

## File ownership and parallel boundaries

- Database contract and shared types are completed first by the main agent.
- Workbook codec work owns `employee-workbook*.ts` and workbook unit tests.
- Import lifecycle work owns import/commit/validator services, DTOs, controllers, and related backend tests.
- Frontend import work owns `EmployeeImportWizard`, employee API/types, and its tests.
- Dashboard work starts after backend contracts stabilize and owns employee pages/progress components.
- Search/export/reminder work starts after persistence stabilizes and owns the corresponding adapters/services.
- Agents must not modify files outside their assigned boundary without notifying the main agent.
- Because the user explicitly requires the current workspace and visible parallel progress, no worktree is created; the main agent performs integration commits.

### Task 1: Database contract and Prisma migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260728110000_employee_weekly_workbook_v2/migration.sql`
- Modify: `backend/test/integration/prisma/employee-work-progress-catalog.spec.ts`
- Modify: `frontend/src/modules/employees/types.ts`

- [ ] **Step 1: Add failing catalog assertions**

Assert the migration contains `work_direction`, `planned_completion_at`, import source fields, `EmployeeWorkKind`, `EmployeePlanPriority`, `EmployeePlanCarryStatus`, and `employee_week_plan_items`.

- [ ] **Step 2: Run the catalog test and confirm failure**

Run:

```bash
cd backend
pnpm test:integration -- --runInBand test/integration/prisma/employee-work-progress-catalog.spec.ts
```

Expected: FAIL because the migration and fields do not exist.

- [ ] **Step 3: Extend Prisma models**

Add:

```prisma
enum EmployeeWorkKind {
  PROJECT
  NON_PROJECT
  @@schema("app")
}

enum EmployeePlanPriority {
  UNSPECIFIED
  LOW
  MEDIUM
  HIGH
  URGENT
  @@schema("app")
}

enum EmployeePlanCarryStatus {
  PLANNED
  MATCHED
  CANCELLED
  @@schema("app")
}
```

Extend `ResourceProfile`, `EmployeeWorkImportRow`, and `EmployeeWorkItem` with the approved nullable compatibility fields. Create `EmployeeWeekPlanItem` with source, period, content, priority, collaboration, project/task, carry status, matching, raw row, archive, and audit timestamps. Add all reverse relations and indexes needed by employee, project, task, batch, source row, period, carry status, and archive queries.

- [ ] **Step 4: Write the additive SQL migration**

The SQL must use additive columns with safe defaults for existing work items:

```sql
CREATE TYPE "app"."EmployeeWorkKind" AS ENUM ('PROJECT', 'NON_PROJECT');
CREATE TYPE "app"."EmployeePlanPriority" AS ENUM ('UNSPECIFIED', 'LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "app"."EmployeePlanCarryStatus" AS ENUM ('PLANNED', 'MATCHED', 'CANCELLED');
ALTER TABLE "app"."resource_profiles" ADD COLUMN "work_direction" TEXT;
ALTER TABLE "app"."employee_work_items"
  ADD COLUMN "work_kind" "app"."EmployeeWorkKind",
  ADD COLUMN "planned_completion_at" DATE;
```

Existing V1 rows keep `work_kind = NULL`; API formatting maps this to legacy unclassified data rather than silently labelling it non-project.

- [ ] **Step 5: Generate Prisma and validate**

Run:

```bash
cd backend
pnpm prisma:generate
pnpm exec prisma validate
pnpm test:integration -- --runInBand test/integration/prisma/employee-work-progress-catalog.spec.ts
```

Expected: PASS.

### Task 2: Anonymous V2 fixture generator and format detection

**Files:**
- Modify: `backend/test/fixtures/generate-employee-fixtures.ts`
- Create: `backend/src/modules/workbench/employees/application/employee-workbook-format.ts`
- Create: `backend/test/unit/modules/workbench/employee-workbook-format.spec.ts`

- [ ] **Step 1: Write failing detector tests**

Cover V1, V2, missing `填写说明`, employee-sheet header mismatch, and unknown workbook. Use anonymous employees only.

- [ ] **Step 2: Run the detector test and confirm failure**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/employee-workbook-format.spec.ts
```

- [ ] **Step 3: Generate anonymous V2 workbooks**

Extend the fixture generator to create:

- valid three-employee V2
- V2 with one unknown employee
- V2 with mixed periods
- V2 with formula in an editable cell
- V2 with invalid status/progress/priority
- V2 with partial rows and blank template rows

Do not copy or commit the user-provided workbook.

- [ ] **Step 4: Implement deterministic detection**

Return:

```ts
type EmployeeWorkbookFormat =
  | { version: 1; kind: 'FLAT' }
  | { version: 2; kind: 'EMPLOYEE_SHEETS'; employeeSheetNames: string[] }
```

Detection uses workbook structure and exact approved headers; it never guesses column mappings.

- [ ] **Step 5: Run detector and security tests**

```bash
cd backend
pnpm test:unit -- --runInBand \
  test/unit/modules/workbench/employee-workbook-format.spec.ts \
  test/unit/modules/workbench/employee-workbook-security.spec.ts
```

Expected: PASS.

### Task 3: V2 template generator and parser

**Files:**
- Create: `backend/src/modules/workbench/employees/application/employee-workbook-v2.service.ts`
- Modify: `backend/src/modules/workbench/employees/application/employee-workbook.service.ts`
- Modify: `backend/src/modules/workbench/employees/domain/employee-work.types.ts`
- Modify: `backend/test/unit/modules/workbench/employee-workbook.service.spec.ts`
- Modify: `backend/test/unit/modules/workbench/employee-workbook-security.spec.ts`

- [ ] **Step 1: Write failing V2 parser and template tests**

Assert all metadata, current-work fields, next-plan fields, source sheet/section/row, empty-row rules, formula policy, date consistency, and automatic-summary exclusion.

- [ ] **Step 2: Confirm failures**

```bash
cd backend
pnpm test:unit -- --runInBand \
  test/unit/modules/workbench/employee-workbook.service.spec.ts \
  test/unit/modules/workbench/employee-workbook-security.spec.ts
```

- [ ] **Step 3: Add normalized V2 contracts**

Define discriminated rows:

```ts
type NormalizedEmployeeWorkbookRow =
  | ({ sourceSection: 'CURRENT_WORK' } & NormalizedEmployeeWorkRow)
  | {
      sourceSection: 'NEXT_WEEK_PLAN';
      rowNumber: number;
      sourceSheetName: string;
      sourceRowNumber: number;
      employeeName: string;
      title: string;
      deliverableText: string | null;
      plannedCompletionAt: string | null;
      priority: EmployeePlanPriority;
      collaborationText: string | null;
      planText: string | null;
      note: string | null;
      rawValues: Record<string, string | number | null>;
    };
```

- [ ] **Step 4: Implement V2 parsing**

Parse employee metadata and both approved regions, derive the next period, preserve source coordinates, reject formulas in editable cells, ignore default-only rows, and return profile warnings separately from blocking issues.

- [ ] **Step 5: Replace the visible template generator**

Generate V2 from active employee profiles and a requested Monday. Reproduce the approved workbook hierarchy, styling, validations, formulas, protected structure, and editable regions. Retain an internal V1 generator for compatibility tests.

- [ ] **Step 6: Run workbook tests**

Use the command from Step 2. Expected: PASS.

### Task 4: Import staging, validation, resolutions, and atomic commit

**Files:**
- Modify: `backend/src/modules/workbench/employees/application/employee-imports.service.ts`
- Modify: `backend/src/modules/workbench/employees/application/employee-import-validator.service.ts`
- Modify: `backend/src/modules/workbench/employees/application/employee-import-staged-row.ts`
- Modify: `backend/src/modules/workbench/employees/application/employee-import-commit.service.ts`
- Modify: `backend/src/modules/workbench/employees/application/employee-import-fingerprint.ts`
- Modify: `backend/src/modules/workbench/employees/interface/http/dto/employee-imports.dto.ts`
- Modify: `backend/src/modules/workbench/employees/interface/http/dto/employees.dto.ts`
- Modify: `backend/src/modules/workbench/employees/interface/http/employee-imports.controller.ts`
- Modify: `backend/test/unit/modules/workbench/employee-imports.service.spec.ts`
- Modify: `backend/test/unit/modules/workbench/employee-import-validator.service.spec.ts`
- Modify: `backend/test/unit/modules/workbench/employee-import-commit.service.spec.ts`
- Modify: `backend/test/integration/modules/workbench/employee-imports.controller.spec.ts`

- [ ] **Step 1: Add failing V2 lifecycle tests**

Cover employee/profile warnings, work-kind requirement, project-required rule, project-task membership, batch persistence, risk candidate, hours, current work, next plan, version replacement, restore, and rollback.

- [ ] **Step 2: Confirm failures**

```bash
cd backend
pnpm test:unit -- --runInBand \
  test/unit/modules/workbench/employee-imports.service.spec.ts \
  test/unit/modules/workbench/employee-import-validator.service.spec.ts \
  test/unit/modules/workbench/employee-import-commit.service.spec.ts
```

- [ ] **Step 3: Extend staged-row persistence**

Persist global row number plus source sheet, section, original row, source key, normalized row kind, work kind, system-supplied project/task/hours, profile action, and risk decision. Include all of them in the preview fingerprint.

- [ ] **Step 4: Extend resolution DTOs**

Accept bounded resolution inputs:

```ts
{
  rowId: string;
  employeeId?: string;
  createEmployee?: { displayName: string; department?: string; workDirection?: string };
  updateEmployeeProfile?: boolean;
  workKind: 'PROJECT' | 'NON_PROJECT';
  projectId?: string;
  taskId?: string;
  plannedHours?: number;
  actualHours?: number;
  riskDecision?: 'KEEP' | 'REMOVE' | 'EDIT';
  riskText?: string;
}
```

- [ ] **Step 5: Commit current facts and future plans atomically**

Within the existing transaction, create current `EmployeeWorkItem` records and future `EmployeeWeekPlanItem` records, archive the previous version’s work, plans, and generated loads, refresh weekly/monthly snapshots, and audit every changed category.

- [ ] **Step 6: Preserve V1 behavior**

Map legacy project/task references exactly as before. Existing V1 tests must remain unchanged or receive only additive expected response fields.

- [ ] **Step 7: Run unit and integration tests**

```bash
cd backend
pnpm test:unit -- --runInBand \
  test/unit/modules/workbench/employee-imports.service.spec.ts \
  test/unit/modules/workbench/employee-import-validator.service.spec.ts \
  test/unit/modules/workbench/employee-import-commit.service.spec.ts
pnpm test:integration -- --runInBand test/integration/modules/workbench/employee-imports.controller.spec.ts
```

Expected: PASS.

### Task 5: Frontend contracts and bulk association modal

**Files:**
- Modify: `frontend/src/modules/employees/types.ts`
- Modify: `frontend/src/modules/employees/api.ts`
- Create: `frontend/src/modules/employees/components/EmployeeImportAssociationModal.tsx`
- Modify: `frontend/src/modules/employees/components/EmployeeImportWizard.tsx`
- Modify: `frontend/src/modules/employees/components/employee-progress.less`
- Modify: `frontend/src/modules/employees/__tests__/api.test.ts`
- Modify: `frontend/src/modules/employees/__tests__/EmployeeImportWizard.test.tsx`
- Create: `frontend/src/modules/employees/__tests__/EmployeeImportAssociationModal.test.tsx`

- [ ] **Step 1: Write failing contract and interaction tests**

Cover V2 summary, grouped filters, work-kind requirement, project/task cascading, bulk actions, risk decisions, hours, sticky footer, persisted draft, error navigation, and disabled confirmation.

- [ ] **Step 2: Confirm failures**

```bash
cd frontend
pnpm test -- \
  src/modules/employees/__tests__/api.test.ts \
  src/modules/employees/__tests__/EmployeeImportWizard.test.tsx \
  src/modules/employees/__tests__/EmployeeImportAssociationModal.test.tsx
```

- [ ] **Step 3: Extend TypeScript/API contracts**

Mirror backend discriminated row types and additive batch metrics. Keep V1-compatible nullable fields.

- [ ] **Step 4: Build one Semi Design modal**

Use `Modal`, `Table`, `Select`, `InputNumber`, `Tag`, `Banner`, and `Progress`. Provide employee grouping, row-type/status filters, selected-row bulk controls, conditional required fields, candidate labels, and a fixed footer using the shared modal footer spacing.

- [ ] **Step 5: Simplify the wizard**

Flow becomes upload → automatic preview → association modal when needed → summary confirmation. Do not open one modal per row.

- [ ] **Step 6: Run tests, typecheck, and lint**

```bash
cd frontend
pnpm test -- \
  src/modules/employees/__tests__/api.test.ts \
  src/modules/employees/__tests__/EmployeeImportWizard.test.tsx \
  src/modules/employees/__tests__/EmployeeImportAssociationModal.test.tsx
pnpm typecheck
pnpm lint
```

Expected: PASS.

### Task 6: Query APIs, employee pages, and project linkage

**Files:**
- Modify: `backend/src/modules/workbench/employees/application/employee-progress-query.service.ts`
- Modify: `backend/src/modules/workbench/employees/interface/http/employees.controller.ts`
- Modify: `backend/src/modules/workbench/employees/interface/http/dto/employees.dto.ts`
- Modify: `frontend/src/modules/employees/types.ts`
- Modify: `frontend/src/modules/employees/api.ts`
- Modify: `frontend/src/modules/employees/components/EmployeeWorkTable.tsx`
- Create: `frontend/src/modules/employees/components/EmployeeWeekPlanTable.tsx`
- Modify: `frontend/src/pages/EmployeeDetailPage.tsx`
- Modify: `frontend/src/pages/EmployeesPage.tsx`
- Modify: `frontend/src/pages/ProjectWorkspacePage.tsx`
- Modify: associated backend/frontend tests

- [ ] **Step 1: Add failing query and page tests**

Assert work direction, work kind, due date, source coordinates, next plans, priority, collaboration, carry status, filters, and project reverse links.

- [ ] **Step 2: Add bounded plan endpoints**

Implement list/detail/update-system-fields/cancel/match/convert-to-task operations with audit and idempotency. Imported source business text remains read-only.

- [ ] **Step 3: Extend current work formatting**

Return explicit legacy/unclassified state for V1 rows, overdue metadata, data-consistency warnings, and complete source coordinates.

- [ ] **Step 4: Build current/next UI sections**

Employee details render separate current execution and next plan tables. Team and project pages add filters, plan counts, collaboration needs, and drill-down links.

- [ ] **Step 5: Run focused backend and frontend tests**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/employee-progress-query.service.spec.ts
pnpm test:integration -- --runInBand test/integration/modules/workbench/employee-progress.controller.spec.ts
cd ../frontend
pnpm test -- \
  src/pages/__tests__/EmployeeDetailPage.test.tsx \
  src/pages/__tests__/EmployeesPage.test.tsx \
  src/pages/__tests__/ProjectWorkspacePage.test.tsx
```

Expected: PASS.

### Task 7: Snapshots, dashboards, work direction, and load completeness

**Files:**
- Modify: `backend/src/modules/workbench/employees/application/employee-progress-snapshot.service.ts`
- Modify: `backend/src/modules/workbench/employees/application/employees.service.ts`
- Modify: `frontend/src/modules/employees/components/EmployeeProfileForm.tsx`
- Modify: `frontend/src/modules/employees/components/EmployeeProgressMetrics.tsx`
- Modify: `frontend/src/modules/employees/components/EmployeeProgressTrend.tsx`
- Modify: `frontend/src/pages/EmployeesPage.tsx`
- Modify: related tests

- [ ] **Step 1: Write failing metrics tests**

Cover overdue count, project/non-project count, work-direction distribution, plan priorities, collaboration count, unmatched plans, separate missing-week and missing-hours completeness, and no-denominator display.

- [ ] **Step 2: Extend snapshot metrics**

Current-week facts drive completion metrics. Future plans provide a separate `nextPlanMetrics` object. Load utilization includes only non-null planned hours and reports completeness separately.

- [ ] **Step 3: Add work direction profile UI**

Create/edit/filter employee profiles by work direction; import profile updates remain explicit.

- [ ] **Step 4: Run focused tests**

```bash
cd backend
pnpm test:unit -- --runInBand \
  test/unit/modules/workbench/employee-progress-snapshot.service.spec.ts \
  test/unit/modules/workbench/employees.service.spec.ts
cd ../frontend
pnpm test -- \
  src/pages/__tests__/EmployeesPage.test.tsx \
  src/pages/__tests__/EmployeeDetailPage.test.tsx
```

Expected: PASS.

### Task 8: Search, export, reminders, risk, audit, and restore

**Files:**
- Modify: `backend/src/modules/workbench/search/adapters/employees-search.adapter.ts`
- Modify: `backend/src/modules/workbench/employees/application/employee-work-export.service.ts`
- Modify: `backend/src/modules/workbench/employees/application/employee-work-risk.service.ts`
- Modify: employee import restore/audit paths
- Modify: reminder application files selected by existing reminder patterns
- Modify: related backend/frontend tests

- [ ] **Step 1: Add failing focused tests**

Cover all V2 searchable fields, current/plan result types, full export columns, risk conversion, plan due-date reminder candidates, cancellation/reschedule, version restore, and audit metadata.

- [ ] **Step 2: Extend global search**

Index current title/plan/summary/next action and future title/deliverable/collaboration/plan/note with employee, work direction, project, task, period, and source links.

- [ ] **Step 3: Extend exports**

Excel/CSV exports preserve every V2 business field plus system fields, project/task, hours, risk, source sheet, section, and row. Provide personal weekly and team summary export shapes.

- [ ] **Step 4: Connect reminders safely**

Due dates become reminder candidates. Import never auto-enables SMS. Existing page/socket/desktop/SMS delivery remains explicit, auditable, cancellable, and rescheduled when dates change.

- [ ] **Step 5: Complete risk/version/restore behavior**

Risk conversion is idempotent; non-project risks remain employee risks. Restore creates a new version and restores current facts, plans, generated loads, snapshots, and source references atomically.

- [ ] **Step 6: Run focused tests**

```bash
cd backend
pnpm test:unit -- --runInBand \
  test/unit/modules/workbench/employees-search.adapter.spec.ts \
  test/unit/modules/workbench/employee-work-export.service.spec.ts \
  test/unit/modules/workbench/employee-work-risk.service.spec.ts
```

Expected: PASS.

### Task 9: End-to-end workflow and cross-platform UX

**Files:**
- Create: `frontend/e2e/employee-weekly-workbook-v2.spec.ts`
- Modify: frontend page/component styles as failures reveal
- Modify: `README.md`

- [ ] **Step 1: Write the failing Playwright workflow**

Upload anonymous V2, resolve one employee, classify project/non-project work, bulk associate a project, confirm a risk, submit, verify current and next sections, project reverse link, dashboard metrics, source coordinates, replacement, and restore.

- [ ] **Step 2: Run and confirm failure**

```bash
cd frontend
pnpm exec playwright test e2e/employee-weekly-workbook-v2.spec.ts
```

- [ ] **Step 3: Fix only observed integration/UX gaps**

Use Semi components, shared modal footer spacing, accessible labels, stable date rendering, and friendly error messages. Never expose backend stack traces.

- [ ] **Step 4: Document Windows/macOS setup**

Document template download, import workflow, PostgreSQL migration, local storage, and the anonymous cross-platform acceptance procedure.

- [ ] **Step 5: Run E2E**

Run the command from Step 2. Expected: PASS.

### Task 10: Full verification, final review, and delivery

**Files:**
- Modify only defects found by verification
- Update: `task_plan.md`, `findings.md`, `progress.md`

- [ ] **Step 1: Apply migration to the explicit local workbench database**

```bash
cd backend
pnpm prisma:migrate:deploy
pnpm prisma migrate status
```

Expected: migration applied and database schema up to date.

- [ ] **Step 2: Run backend verification**

```bash
cd backend
pnpm prisma:generate
pnpm test:unit -- --runInBand
pnpm test:integration -- --runInBand
pnpm lint
pnpm build
```

Expected: PASS.

- [ ] **Step 3: Run frontend verification**

```bash
cd frontend
pnpm test
pnpm typecheck
pnpm typecheck:contracts
pnpm lint
pnpm build
pnpm exec playwright test e2e/employee-weekly-workbook-v2.spec.ts e2e/smoke.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Perform real visual and data checks**

Verify the generated V2 workbook, upload flow, association modal, employee detail, team dashboard, project progress, search, export, reminder candidate, version restore, and responsive/Windows-safe layout. Use the user workbook only for local manual verification and never add it to Git.

- [ ] **Step 5: Run final spec and code-quality review**

Review every `WT` through `QS` requirement against tests and UI behavior. Fix all blocking and important findings before completion.

- [ ] **Step 6: Commit delivery**

Commit only verified source, migrations, anonymous tests, and documentation. Confirm the working tree is clean and report local/remote status accurately.
