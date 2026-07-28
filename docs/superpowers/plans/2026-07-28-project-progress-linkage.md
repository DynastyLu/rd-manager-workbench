# Project Progress Linkage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make milestone dates, linked task completion, milestone weights, project progress, schedule progress, and progress history form one traceable project-management loop.

**Architecture:** Add persisted milestone planning inputs and progress-report provenance, while keeping milestone/project percentages as deterministic values calculated by a focused domain service. Integrate that service into existing task and milestone transactions, return a stable `progressSummary` projection from project details, and render the confirmed timeline UI with Semi UI controls.

**Tech Stack:** NestJS 10, Prisma 6, PostgreSQL, Jest, React 19, TypeScript, TanStack Query, Semi UI, Vitest, Playwright.

---

## File map

- `backend/prisma/schema.prisma`: new enums and persisted planning/provenance fields.
- `backend/prisma/migrations/20260728093000_project_progress_linkage/migration.sql`: additive migration and old-data backfill.
- `backend/src/modules/workbench/projects/domain/project-progress.ts`: pure milestone/project/time calculations.
- `backend/src/modules/workbench/projects/application/project-progress.service.ts`: Prisma projection and system progress-report persistence.
- `backend/src/modules/workbench/projects/projects.module.ts`: export progress service.
- `backend/src/modules/workbench/projects/application/projects.service.ts`: attach `progressSummary` and calculated milestone fields.
- `backend/src/modules/workbench/tasks/application/tasks.service.ts`: recalculate after task/milestone writes and create manual reports without overriding calculated progress.
- `backend/src/modules/workbench/tasks/interface/http/dto/*.dto.ts`: new milestone and progress inputs.
- `frontend/src/modules/workbench/types.ts`: response contracts.
- `frontend/src/modules/workbench/api/projects.ts`: request contracts.
- `frontend/src/modules/workbench/components/ProjectProgressTimeline.tsx`: timeline and project/time comparison.
- `frontend/src/modules/workbench/components/MilestoneForm.tsx`: date range, weight and manual progress.
- `frontend/src/modules/workbench/components/ProgressReportForm.tsx`: summary, results, blockers and next steps.
- `frontend/src/pages/ProjectWorkspacePage.tsx`: use calculated progress throughout.
- `frontend/src/pages/ProjectWorkspacePage.less`: responsive timeline, cards and history styles.

### Task 1: Add the progress data model and migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260728093000_project_progress_linkage/migration.sql`
- Create: `backend/test/integration/prisma/project-progress-catalog.spec.ts`

- [ ] **Step 1: Write the failing catalog test**

Assert that `app.projects.weight_mode`, milestone planning fields, and progress provenance fields exist:

```ts
it('contains project progress linkage columns', async () => {
  const rows = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'app'
      AND table_name IN ('projects', 'milestones', 'progress_reports')
  `;
  const names = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
  expect(names).toEqual(expect.arrayContaining([
    'projects.weight_mode',
    'milestones.planned_start_at',
    'milestones.planned_end_at',
    'milestones.weight_percent',
    'milestones.manual_completion_percent',
    'progress_reports.source_type',
    'progress_reports.previous_percent',
    'progress_reports.milestone_id',
    'progress_reports.task_id',
    'progress_reports.next_steps',
    'progress_reports.change_snapshot',
  ]));
});
```

- [ ] **Step 2: Run the catalog test and verify failure**

Run:

```bash
cd backend
pnpm test:integration -- --runInBand test/integration/prisma/project-progress-catalog.spec.ts
```

Expected: FAIL because the new columns do not exist.

- [ ] **Step 3: Extend the Prisma schema**

Add:

```prisma
enum ProjectWeightMode {
  EQUAL
  CUSTOM
  @@schema("app")
}

enum ProgressReportSourceType {
  MANUAL
  TASK_CHANGE
  MILESTONE_CHANGE
  SYSTEM_RECALCULATION
  @@schema("app")
}
```

Add `weightMode ProjectWeightMode @default(EQUAL) @map("weight_mode")` to `Project`.

Add these fields to `Milestone`:

```prisma
plannedStartAt           DateTime? @map("planned_start_at") @db.Timestamptz(6)
plannedEndAt             DateTime? @map("planned_end_at") @db.Timestamptz(6)
weightPercent            Decimal?  @map("weight_percent") @db.Decimal(5, 2)
manualCompletionPercent  Decimal?  @map("manual_completion_percent") @db.Decimal(5, 2)
```

Add these fields and relations to `ProgressReport`:

```prisma
sourceType       ProgressReportSourceType @default(MANUAL) @map("source_type")
previousPercent  Decimal?                 @map("previous_percent") @db.Decimal(5, 2)
milestoneId      String?                  @map("milestone_id")
taskId           String?                  @map("task_id")
nextSteps        String?                  @map("next_steps")
changeSnapshot   Json?                    @map("change_snapshot")
milestone        Milestone?               @relation(fields: [milestoneId], references: [id], onDelete: SetNull)
task             WorkTask?                @relation(fields: [taskId], references: [id], onDelete: SetNull)
```

Add matching `progressReports` back-relations to `Milestone` and `WorkTask`.

- [ ] **Step 4: Create the SQL migration**

Create the enums and columns additively. Backfill:

```sql
UPDATE app.milestones
SET planned_end_at = planned_at
WHERE planned_at IS NOT NULL AND planned_end_at IS NULL;

UPDATE app.progress_reports
SET source_type = 'MANUAL'
WHERE source_type IS NULL;
```

Add indexes on `(project_id, planned_start_at, planned_end_at)` and `(project_id, source_type, reported_at)`. Do not drop `planned_at`.

- [ ] **Step 5: Generate Prisma and run the catalog test**

Run:

```bash
cd backend
pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm test:integration -- --runInBand test/integration/prisma/project-progress-catalog.spec.ts
```

Expected: Prisma generation succeeds, migration applies once, test PASS.

- [ ] **Step 6: Commit the model**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260728093000_project_progress_linkage backend/test/integration/prisma/project-progress-catalog.spec.ts
git commit -m "feat: add project progress linkage schema"
```

### Task 2: Implement deterministic progress calculations

**Files:**
- Create: `backend/src/modules/workbench/projects/domain/project-progress.ts`
- Create: `backend/test/unit/modules/workbench/project-progress.spec.ts`

- [ ] **Step 1: Write failing pure-domain tests**

Cover completed milestones, task-derived progress, manual fallback, equal/custom weights, no milestones, time clamping and schedule state:

```ts
expect(calculateMilestoneProgress({
  status: 'IN_PROGRESS',
  manualCompletionPercent: 20,
  tasks: [{ status: 'TODO', completionPercent: 40 }, { status: 'DONE', completionPercent: 100 }],
})).toEqual({ percent: 70, source: 'TASKS', linkedTaskCount: 2 });

expect(calculateProjectProgress([
  { percent: 100, effectiveWeightPercent: 25 },
  { percent: 40, effectiveWeightPercent: 75 },
])).toBe(55);

expect(calculateScheduleProgress({
  plannedStartAt: new Date('2026-01-01T00:00:00Z'),
  plannedEndAt: new Date('2026-01-11T00:00:00Z'),
  now: new Date('2026-01-06T00:00:00Z'),
  actualPercent: 40,
})).toEqual({ timePercent: 50, variancePercent: -10, scheduleState: 'BEHIND' });
```

- [ ] **Step 2: Verify the tests fail**

Run:

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/project-progress.spec.ts
```

Expected: FAIL because `project-progress.ts` does not exist.

- [ ] **Step 3: Implement the pure calculator**

Export:

```ts
export type CompletionSource = 'COMPLETED' | 'TASKS' | 'MANUAL' | 'EMPTY';
export type ScheduleState = 'AHEAD' | 'ON_TRACK' | 'BEHIND' | 'UNPLANNED';

export function calculateMilestoneProgress(input: MilestoneProgressInput): MilestoneProgressResult;
export function resolveMilestoneWeights(
  mode: 'EQUAL' | 'CUSTOM',
  milestones: Array<{ id: string; weightPercent: number | null }>,
): Map<string, number>;
export function calculateProjectProgress(
  milestones: Array<{ percent: number; effectiveWeightPercent: number }>,
): number | null;
export function calculateScheduleProgress(input: ScheduleProgressInput): ScheduleProgressResult;
```

Use `Math.min(100, Math.max(0, value))`, ignore tasks with status `CANCELLED`, round public values to two decimals, and return `null` project progress when there are no milestones.

- [ ] **Step 4: Run the unit tests**

Run the command from Step 2.

Expected: all progress-domain tests PASS.

- [ ] **Step 5: Commit the calculator**

```bash
git add backend/src/modules/workbench/projects/domain/project-progress.ts backend/test/unit/modules/workbench/project-progress.spec.ts
git commit -m "feat: calculate milestone and project progress"
```

### Task 3: Add the project progress application service

**Files:**
- Create: `backend/src/modules/workbench/projects/application/project-progress.service.ts`
- Modify: `backend/src/modules/workbench/projects/projects.module.ts`
- Create: `backend/test/unit/modules/workbench/project-progress.service.spec.ts`

- [ ] **Step 1: Write failing service tests**

Mock a transaction client and verify:

```ts
it('returns calculated milestone and schedule summaries', async () => {
  prisma.milestone.findMany.mockResolvedValue([milestoneWithTwoTasks]);
  prisma.project.findUnique.mockResolvedValue(projectCycle);
  await expect(service.getSummary(prisma, 'project-1', now)).resolves.toMatchObject({
    actualPercent: 70,
    timePercent: 60,
    variancePercent: 10,
    scheduleState: 'AHEAD',
    milestones: [{ id: 'milestone-1', completionPercent: 70, completionSource: 'TASKS' }],
  });
});

it('writes one system report only when the public percentage changes', async () => {
  prisma.progressReport.findFirst.mockResolvedValue({ completionPercent: 50 });
  await service.recalculate(prisma, 'project-1', { sourceType: 'TASK_CHANGE', taskId: 'task-1' });
  expect(prisma.progressReport.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ previousPercent: 50, completionPercent: 55 }),
  }));
});
```

- [ ] **Step 2: Verify failure**

Run:

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/project-progress.service.spec.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the service**

`getSummary(client, projectId, now)` loads the project cycle and all milestones with non-archived tasks, then delegates to the pure functions.

`recalculate(client, projectId, trigger)`:

1. Acquires `pg_advisory_xact_lock(hashtext('project-progress:' || projectId))`.
2. Calculates the new summary.
3. Reads the latest report as the prior public snapshot.
4. Creates a system report only when `previousPercent !== actualPercent`.
5. Stores `sourceType`, `milestoneId`, `taskId`, `previousPercent`, `completionPercent` and JSON `changeSnapshot`.

- [ ] **Step 4: Export from ProjectsModule**

Register and export `ProjectProgressService` so `TasksModule` can inject it through its existing `ProjectsModule` import.

- [ ] **Step 5: Run service tests and build**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/project-progress.service.spec.ts
pnpm build
```

Expected: tests PASS and Nest build succeeds.

- [ ] **Step 6: Commit the service**

```bash
git add backend/src/modules/workbench/projects/application/project-progress.service.ts backend/src/modules/workbench/projects/projects.module.ts backend/test/unit/modules/workbench/project-progress.service.spec.ts
git commit -m "feat: persist traceable project progress"
```

### Task 4: Integrate task, milestone and manual-report writes

**Files:**
- Modify: `backend/src/modules/workbench/tasks/application/tasks.service.ts`
- Modify: `backend/src/modules/workbench/tasks/interface/http/dto/create-milestone.dto.ts`
- Modify: `backend/src/modules/workbench/tasks/interface/http/dto/update-milestone.dto.ts`
- Modify: `backend/src/modules/workbench/tasks/interface/http/dto/create-progress-report.dto.ts`
- Modify: `backend/src/modules/workbench/tasks/interface/http/dto/update-progress-report.dto.ts`
- Modify: `backend/src/modules/workbench/projects/interface/http/dto/create-project.dto.ts`
- Modify: `backend/src/modules/workbench/projects/interface/http/dto/update-project.dto.ts`
- Modify: `backend/test/unit/modules/workbench/projects.service.spec.ts`
- Modify: `backend/test/unit/modules/workbench/tasks.service.spec.ts`
- Modify: `backend/test/integration/modules/workbench/projects.controller.spec.ts`

- [ ] **Step 1: Add failing DTO and transaction tests**

Verify that:

- `plannedEndAt < plannedStartAt` is rejected by service validation.
- custom milestone weights outside 0–100 are rejected.
- custom project weights must total 100 before the project switches to `CUSTOM`.
- creating/updating/archiving a task invokes one recalculation for the old and new project IDs.
- manual reports derive `completionPercent` from `ProjectProgressService` and accept `nextSteps`.

- [ ] **Step 2: Run the focused tests and verify failure**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/projects.service.spec.ts test/unit/modules/workbench/tasks.service.spec.ts
pnpm test:integration -- --runInBand test/integration/modules/workbench/projects.controller.spec.ts
```

Expected: new assertions FAIL against current DTOs and services.

- [ ] **Step 3: Update DTO contracts**

Milestone DTOs accept ISO dates plus:

```ts
plannedStartAt?: string;
plannedEndAt?: string;
weightPercent?: number;
manualCompletionPercent?: number;
```

Use `@IsNumber()`, `@Min(0)`, and `@Max(100)` for percentages.

Progress report create/update DTOs remove required `completionPercent` and accept:

```ts
milestoneId?: string;
completedResults?: string;
blockers?: string;
nextSteps?: string;
```

Project DTOs accept `weightMode?: ProjectWeightMode`.

- [ ] **Step 4: Integrate recalculation in TasksService**

Inject `ProjectProgressService`. Within the existing transaction:

- Capture old project/milestone references.
- Perform the write.
- Recalculate each affected project once with `TASK_CHANGE` or `MILESTONE_CHANGE`.
- Recalculate after archive/delete.
- For manual reports, call `getSummary`, save its `actualPercent ?? 0`, and set `sourceType: MANUAL`.
- Reject edits/deletes of non-`MANUAL` reports.

- [ ] **Step 5: Validate custom weights**

When switching a project to `CUSTOM`, sum current milestone weights using decimal-safe integer hundredths. Reject totals other than `10000` with an `AppError` whose message includes the current total and remaining difference.

- [ ] **Step 6: Run tests and build**

Run the commands from Step 2, followed by:

```bash
cd backend
pnpm build
```

Expected: focused tests PASS and build succeeds.

- [ ] **Step 7: Commit write integration**

```bash
git add backend/src/modules/workbench/tasks backend/src/modules/workbench/projects/interface/http/dto backend/test/unit/modules/workbench backend/test/integration/modules/workbench/projects.controller.spec.ts
git commit -m "feat: link task and milestone progress updates"
```

### Task 5: Return calculated project details

**Files:**
- Modify: `backend/src/modules/workbench/projects/application/projects.service.ts`
- Modify: `backend/test/unit/modules/workbench/projects.service.spec.ts`
- Modify: `frontend/src/modules/workbench/types.ts`
- Modify: `frontend/src/modules/workbench/api/projects.ts`
- Modify: `frontend/src/modules/workbench/api/__tests__/projects.test.ts`

- [ ] **Step 1: Write failing response-contract tests**

Expect `get(projectId)` to return:

```ts
{
  progressSummary: {
    actualPercent: 56,
    timePercent: 64,
    variancePercent: -8,
    scheduleState: 'BEHIND',
    weightMode: 'EQUAL',
    currentMilestoneId: 'm2',
  },
  milestones: [{
    completionPercent: 68,
    completionSource: 'TASKS',
    effectiveWeightPercent: 35,
    linkedTaskCount: 6,
  }],
}
```

Add a frontend contract test asserting `CreateProgressReportInput` no longer accepts `completionPercent`.

- [ ] **Step 2: Run backend and frontend contract tests**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/projects.service.spec.ts
cd ../frontend
pnpm test -- src/modules/workbench/api/__tests__/projects.test.ts
pnpm typecheck:contracts
```

Expected: FAIL on missing response fields and stale request types.

- [ ] **Step 3: Project the progress summary**

Inject `ProjectProgressService` into `ProjectsService`, calculate once in `get`, merge calculated milestone properties by ID, and order milestones by `plannedStartAt`, then `plannedEndAt`, then ID.

- [ ] **Step 4: Update frontend contracts**

Add:

```ts
export type ProjectWeightMode = 'EQUAL' | 'CUSTOM';
export type CompletionSource = 'COMPLETED' | 'TASKS' | 'MANUAL' | 'EMPTY';
export type ScheduleState = 'AHEAD' | 'ON_TRACK' | 'BEHIND' | 'UNPLANNED';
```

Extend `ProjectDetail`, `Milestone`, and `ProgressReport` exactly to match the API. Update request inputs to use planned start/end, weight, manual completion, next steps and optional milestone association.

- [ ] **Step 5: Run contract tests and builds**

Run the commands from Step 2, then:

```bash
cd frontend
pnpm typecheck
```

Expected: all PASS.

- [ ] **Step 6: Commit response contracts**

```bash
git add backend/src/modules/workbench/projects/application/projects.service.ts backend/test/unit/modules/workbench/projects.service.spec.ts frontend/src/modules/workbench/types.ts frontend/src/modules/workbench/api/projects.ts frontend/src/modules/workbench/api/__tests__/projects.test.ts
git commit -m "feat: expose calculated project progress"
```

### Task 6: Upgrade milestone and progress forms

**Files:**
- Modify: `frontend/src/modules/workbench/components/MilestoneForm.tsx`
- Modify: `frontend/src/modules/workbench/components/ProgressReportForm.tsx`
- Create: `frontend/src/modules/workbench/components/__tests__/MilestoneForm.test.tsx`
- Create: `frontend/src/modules/workbench/components/__tests__/ProgressReportForm.test.tsx`

- [ ] **Step 1: Write failing form tests**

Use Testing Library to verify:

- milestone uses Semi UI `DatePicker` with `type="dateRange"`.
- end-before-start shows a validation error.
- task-derived milestones show progress as read-only.
- manual milestones allow 0–100 progress.
- manual progress form has summary, milestone, results, blockers and next steps but no editable project percent.

- [ ] **Step 2: Run the tests and verify failure**

```bash
cd frontend
pnpm test -- src/modules/workbench/components/__tests__/MilestoneForm.test.tsx src/modules/workbench/components/__tests__/ProgressReportForm.test.tsx
```

Expected: FAIL against current forms.

- [ ] **Step 3: Implement the forms**

Use Semi UI `DatePicker`, `Select`, `InputNumber`, `Input`, `TextArea`, `Checkbox`, and `Button`. Convert the selected date range to two ISO strings. Show:

```tsx
{milestone?.completionSource === 'TASKS' ? (
  <Banner type="info" description={`当前进度由 ${milestone.linkedTaskCount} 个工作项自动计算`} />
) : (
  <InputNumber min={0} max={100} suffix="%" value={manualCompletionPercent} />
)}
```

Keep actions inside `workspace-modal-form__actions` so modal footer spacing remains consistent.

- [ ] **Step 4: Run tests, typecheck and lint**

```bash
cd frontend
pnpm test -- src/modules/workbench/components/__tests__/MilestoneForm.test.tsx src/modules/workbench/components/__tests__/ProgressReportForm.test.tsx
pnpm typecheck
pnpm lint
```

Expected: PASS.

- [ ] **Step 5: Commit the forms**

```bash
git add frontend/src/modules/workbench/components
git commit -m "feat: improve milestone and progress forms"
```

### Task 7: Render the confirmed project timeline

**Files:**
- Create: `frontend/src/modules/workbench/components/ProjectProgressTimeline.tsx`
- Create: `frontend/src/modules/workbench/components/__tests__/ProjectProgressTimeline.test.tsx`
- Modify: `frontend/src/pages/ProjectWorkspacePage.tsx`
- Modify: `frontend/src/pages/ProjectWorkspacePage.less`
- Modify: `frontend/src/pages/__tests__/ProjectWorkspacePage.test.tsx`

- [ ] **Step 1: Write failing timeline and page tests**

Verify:

- actual 56%, time 64%, and “滞后 8%” appear together.
- milestone nodes show plan range, progress and weight.
- unplanned projects show “配置项目周期” and “创建里程碑”.
- progress history distinguishes system and manual records.
- existing latest manual report no longer drives the overview percent.

- [ ] **Step 2: Run tests and verify failure**

```bash
cd frontend
pnpm test -- src/modules/workbench/components/__tests__/ProjectProgressTimeline.test.tsx src/pages/__tests__/ProjectWorkspacePage.test.tsx
```

Expected: FAIL because the page still reads `progressReports[0].completionPercent`.

- [ ] **Step 3: Build ProjectProgressTimeline**

The component receives only `project`, `progressSummary`, `milestones`, and `onSelectMilestone`. It renders summary cards and a horizontally scrollable semantic ordered list. Use `Progress` for percentages and text labels for schedule state; do not rely only on green/yellow/red.

- [ ] **Step 4: Replace old overview calculations**

Delete `latestProgress`, `completedMilestones / total` as the primary percent, and all duplicated client calculations. Read `project.progressSummary.actualPercent`, `timePercent`, `variancePercent`, and calculated milestone fields.

In the progress tab, render system entries with a source tag and the `previousPercent → completionPercent` transition. Manual entries show results, blockers and next steps.

- [ ] **Step 5: Add responsive styles**

Use the existing light design tokens. At widths below 900px, stack summary cards and allow the timeline rail to scroll. Maintain 16–24px card padding and modal/footer spacing consistent with the rest of the application.

- [ ] **Step 6: Run focused and full frontend checks**

```bash
cd frontend
pnpm test -- src/modules/workbench/components/__tests__/ProjectProgressTimeline.test.tsx src/pages/__tests__/ProjectWorkspacePage.test.tsx
pnpm typecheck
pnpm lint
pnpm build
```

Expected: PASS.

- [ ] **Step 7: Commit the timeline**

```bash
git add frontend/src/modules/workbench/components/ProjectProgressTimeline.tsx frontend/src/modules/workbench/components/__tests__/ProjectProgressTimeline.test.tsx frontend/src/pages/ProjectWorkspacePage.tsx frontend/src/pages/ProjectWorkspacePage.less frontend/src/pages/__tests__/ProjectWorkspacePage.test.tsx
git commit -m "feat: add project progress timeline"
```

### Task 8: End-to-end verification

**Files:**
- Create: `frontend/e2e/project-progress-linkage.spec.ts`
- Modify: `backend/test/integration/modules/workbench/projects.controller.spec.ts`

- [ ] **Step 1: Add the end-to-end scenario**

The Playwright scenario must:

1. Create/open a project with a plan cycle.
2. Create two milestones.
3. Link two work items to the active milestone.
4. Change one item to 40% and the other to 100%.
5. Assert milestone progress is 70%.
6. Assert project progress follows the configured milestone weight.
7. Mark the milestone completed and assert 100%.
8. Assert a system progress record identifies the triggering work item or milestone.

- [ ] **Step 2: Run backend verification**

```bash
cd backend
pnpm test:unit -- --runInBand
pnpm test:integration -- --runInBand
pnpm lint
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 3: Run frontend verification**

```bash
cd frontend
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm test:e2e -- project-progress-linkage.spec.ts
```

Expected: all commands exit 0 and the scenario passes.

- [ ] **Step 4: Commit verification**

```bash
git add frontend/e2e/project-progress-linkage.spec.ts backend/test/integration/modules/workbench/projects.controller.spec.ts
git commit -m "test: verify project progress linkage"
```
