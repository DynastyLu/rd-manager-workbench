# Employee Work Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an employee management workspace where an administrator uploads a standard weekly Excel plan/summary, resolves validation errors, and obtains traceable weekly/monthly team, employee, and project progress dashboards.

**Architecture:** Add a focused `employees` NestJS module that extends the existing `ResourceProfile` employee master data and owns workbook parsing, staged imports, atomic version commits, progress snapshots, query projections, risk conversion, and search integration. Reuse existing PostgreSQL, Prisma, storage, audit, resource-load, project, task, risk, React Query, Semi UI, route-state, and project-workspace patterns; the frontend receives one new primary app with directory, detail, import, and dashboard views.

**Tech Stack:** NestJS 10, Prisma 6, PostgreSQL, ExcelJS, Jest/Supertest, React 19, TypeScript, React Query, React Router 7, Semi UI, Vitest/Testing Library, Playwright.

---

## Execution constraints

- Work directly in `/Users/dynastylu/Desktop/AICode/rd-manager-workbench`; the user has explicitly requested visible edits in the existing workspace rather than a separate worktree.
- Follow test-driven development for every task: failing focused test, minimal implementation, focused pass, then commit.
- Preserve the existing `/resources` API and resource-load page during the migration. New UI wording and new APIs use “员工”.
- Never commit `.superpowers/`; it is already ignored.
- Do not push until all backend and frontend verification commands in Task 13 pass.

## File and responsibility map

### Backend files to create

- `backend/src/modules/workbench/employees/employees.module.ts` — module boundary and dependency wiring.
- `backend/src/modules/workbench/employees/domain/employee-work.types.ts` — normalized workbook rows, validation errors, progress metrics, and query projection types.
- `backend/src/modules/workbench/employees/application/employees.service.ts` — employee directory/profile CRUD over `ResourceProfile`.
- `backend/src/modules/workbench/employees/application/employee-workbook.service.ts` — template generation and strict workbook parsing.
- `backend/src/modules/workbench/employees/application/employee-import-validator.service.ts` — normalization, employee/project/task resolution, and row errors.
- `backend/src/modules/workbench/employees/application/employee-imports.service.ts` — upload, preview, resolution, list/detail, source/error download, restore, and lifecycle orchestration.
- `backend/src/modules/workbench/employees/application/employee-import-commit.service.ts` — version lock, atomic work-item/load replacement, audit, and idempotent commit.
- `backend/src/modules/workbench/employees/application/employee-progress-snapshot.service.ts` — weekly/monthly TEAM/EMPLOYEE/PROJECT snapshot generation.
- `backend/src/modules/workbench/employees/application/employee-progress-query.service.ts` — team, employee, project, work-item, and import-history reads.
- `backend/src/modules/workbench/employees/application/employee-work-risk.service.ts` — idempotent conversion from employee work risk to project risk.
- `backend/src/modules/workbench/employees/interface/http/employees.controller.ts` — employee and progress endpoints.
- `backend/src/modules/workbench/employees/interface/http/employee-imports.controller.ts` — multipart upload, template, preview, resolution, commit, restore, rebuild, and file responses.
- `backend/src/modules/workbench/employees/interface/http/dto/employees.dto.ts` — validated employee and progress query DTOs.
- `backend/src/modules/workbench/employees/interface/http/dto/employee-imports.dto.ts` — validated import-resolution and lifecycle DTOs.
- `backend/src/modules/workbench/search/adapters/employees-search.adapter.ts` — employee and employee-work global search candidates.
- `backend/prisma/migrations/20260723010000_employee_work_progress/migration.sql` — enums, tables, backfills, constraints, and indexes.

### Backend files to modify

- `backend/prisma/schema.prisma` — employee fields, immutable task code, import/staging/work/snapshot models, risk link, and load source links.
- `backend/src/modules/workbench/workbench.module.ts` — register `EmployeesModule`.
- `backend/src/modules/workbench/search/domain/search.types.ts` — add `EMPLOYEE` and `EMPLOYEE_WORK`.
- `backend/src/modules/workbench/search/search.module.ts` — register the employee search adapter.
- `backend/src/modules/workbench/governance/application/audit-log.service.ts` — allow safe employee-import metadata keys.
- `backend/src/shared/errors/error-codes.ts` — add stable employee/import/snapshot error codes.

### Frontend files to create

- `frontend/src/modules/employees/api.ts` — employee, import, progress, risk-conversion, template, and download API.
- `frontend/src/modules/employees/types.ts` — API contract types.
- `frontend/src/modules/employees/queryKeys.ts` — focused React Query keys.
- `frontend/src/modules/employees/components/EmployeeProfileForm.tsx` — shared create/edit form.
- `frontend/src/modules/employees/components/EmployeeImportWizard.tsx` — five-step upload flow.
- `frontend/src/modules/employees/components/EmployeeProgressFilters.tsx` — URL-backed week/month, department, project, and status filters.
- `frontend/src/modules/employees/components/EmployeeProgressMetrics.tsx` — metric cards with null-safe percentage rendering.
- `frontend/src/modules/employees/components/EmployeeWorkTable.tsx` — traceable work rows and project/task links.
- `frontend/src/modules/employees/components/EmployeeProgressTrend.tsx` — compact accessible weekly/monthly trend.
- `frontend/src/modules/employees/components/EmployeeImportHistory.tsx` — versions, downloads, restore, and snapshot rebuild.
- `frontend/src/pages/EmployeesPage.tsx` and `frontend/src/pages/EmployeesPage.less` — team overview, directory, work detail, and import history tabs.
- `frontend/src/pages/EmployeeDetailPage.tsx` and `frontend/src/pages/EmployeeDetailPage.less` — employee progress, contribution, load/skills, and import history.

### Frontend files to modify

- `frontend/src/constants/routes.ts` — employee routes.
- `frontend/src/router/routes.ts` — lazy pages and employee primary navigation.
- `frontend/src/components/AppShell/WorkspaceNavigation.tsx` — employee icon mapping.
- `frontend/src/pages/ProjectWorkspacePage.tsx` — project team-progress section and employee drill-through.
- `frontend/src/pages/ProjectWorkspacePage.less` — team-progress layout.
- `frontend/src/pages/SearchPage.tsx` — labels and filters for employee search types.
- `frontend/src/modules/workbench/api/__tests__/contracts.test.ts` — compile-time task-code and project-team-progress contract.

## Task 1: Add the database catalog, migration, and task-code compatibility

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260723010000_employee_work_progress/migration.sql`
- Create: `backend/test/integration/prisma/employee-work-progress-catalog.spec.ts`
- Modify: `backend/test/integration/modules/workbench/tasks.controller.spec.ts`

- [ ] **Step 1: Write the failing schema catalog test**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');

describe('employee work progress Prisma catalog', () => {
  it('declares employee import, work item, snapshot, task code, and load source contracts', () => {
    expect(schema).toMatch(/enum EmployeeWorkImportStatus/);
    expect(schema).toMatch(/enum EmployeeSnapshotStatus/);
    expect(schema).toMatch(/enum EmployeeWorkStatus/);
    expect(schema).toMatch(/enum EmployeeProgressScope/);
    expect(schema).toMatch(/model EmployeeWorkImportBatch/);
    expect(schema).toMatch(/model EmployeeWorkImportRow/);
    expect(schema).toMatch(/model EmployeeWorkItem/);
    expect(schema).toMatch(/model EmployeeProgressSnapshot/);
    expect(schema).toMatch(/code\s+String\s+@unique/);
    expect(schema).toMatch(/employeeWorkItemId\s+String\?/);
    expect(schema).toMatch(/riskId\s+String\?\s+@unique/);
  });
});
```

- [ ] **Step 2: Run the catalog test and verify failure**

Run:

```bash
cd backend
pnpm test:integration -- --runInBand test/integration/prisma/employee-work-progress-catalog.spec.ts
```

Expected: FAIL because the new enums and models do not exist.

- [ ] **Step 3: Add the Prisma models and relations**

Add these enums and models to `schema.prisma`, using the exact names below:

```prisma
enum EmploymentStatus {
  ACTIVE
  ON_LEAVE
  LEFT
  @@schema("app")
}

enum EmployeeWorkImportStatus {
  UPLOADED
  PREVIEWED
  RESOLVING
  READY
  IMPORTING
  COMPLETED
  FAILED
  SUPERSEDED
  EXPIRED
  @@schema("app")
}

enum EmployeeSnapshotStatus {
  NOT_STARTED
  GENERATING
  READY
  FAILED
  @@schema("app")
}

enum EmployeeWorkStatus {
  NOT_STARTED
  IN_PROGRESS
  COMPLETED
  AT_RISK
  BLOCKED
  @@schema("app")
}

enum EmployeeProgressScope {
  TEAM
  EMPLOYEE
  PROJECT
  @@schema("app")
}

enum EmployeeProgressPeriod {
  WEEK
  MONTH
  @@schema("app")
}

enum EmployeeImportRowStatus {
  VALID
  ERROR
  UNRESOLVED
  @@schema("app")
}
```

Use these model contracts:

```prisma
model EmployeeWorkImportBatch {
  id                 String                   @id @default(cuid())
  periodType         EmployeeProgressPeriod   @default(WEEK) @map("period_type")
  periodStartAt      DateTime                 @map("period_start_at") @db.Date
  periodEndAt        DateTime                 @map("period_end_at") @db.Date
  version            Int?
  status             EmployeeWorkImportStatus @default(UPLOADED)
  snapshotStatus     EmployeeSnapshotStatus   @default(NOT_STARTED) @map("snapshot_status")
  snapshotError      String?                  @map("snapshot_error")
  originalName       String                   @map("original_name")
  fileHash           String                   @map("file_hash")
  sourceStorageKey   String                   @map("source_storage_key")
  errorStorageKey    String?                  @map("error_storage_key")
  templateVersion    Int                      @map("template_version")
  previewFingerprint String?                  @map("preview_fingerprint")
  totalRows          Int                      @default(0) @map("total_rows")
  validRows          Int                      @default(0) @map("valid_rows")
  errorRows          Int                      @default(0) @map("error_rows")
  unresolvedRows     Int                      @default(0) @map("unresolved_rows")
  importedRows       Int                      @default(0) @map("imported_rows")
  supersedesBatchId  String?                  @map("supersedes_batch_id")
  restoredFromBatchId String?                 @map("restored_from_batch_id")
  committedAt        DateTime?                @map("committed_at") @db.Timestamptz(6)
  expiresAt          DateTime                 @map("expires_at") @db.Timestamptz(6)
  archivedAt         DateTime?                @map("archived_at") @db.Timestamptz(6)
  createdAt          DateTime                 @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime                 @updatedAt @map("updated_at") @db.Timestamptz(6)
  supersedes         EmployeeWorkImportBatch? @relation("EmployeeImportSupersedes", fields: [supersedesBatchId], references: [id], onDelete: SetNull)
  supersededBy       EmployeeWorkImportBatch[] @relation("EmployeeImportSupersedes")
  restoredFrom       EmployeeWorkImportBatch? @relation("EmployeeImportRestores", fields: [restoredFromBatchId], references: [id], onDelete: SetNull)
  restoredBy         EmployeeWorkImportBatch[] @relation("EmployeeImportRestores")
  rows               EmployeeWorkImportRow[]
  workItems          EmployeeWorkItem[]
  loadEntries        ResourceLoadEntry[]

  @@unique([periodType, periodStartAt, version])
  @@index([periodType, periodStartAt, status])
  @@index([fileHash, periodType, periodStartAt])
  @@map("employee_work_import_batches")
  @@schema("app")
}

model EmployeeWorkImportRow {
  id                 String                  @id @default(cuid())
  batchId            String                  @map("batch_id")
  rowNumber          Int                     @map("row_number")
  rawValues          Json                    @map("raw_values")
  normalizedValues   Json                    @map("normalized_values")
  status             EmployeeImportRowStatus
  errors             Json
  resolvedEmployeeId String?                 @map("resolved_employee_id")
  resolvedProjectId  String?                 @map("resolved_project_id")
  resolvedTaskId     String?                 @map("resolved_task_id")
  keepUnlinked       Boolean                 @default(false) @map("keep_unlinked")
  createdAt          DateTime                @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime                @updatedAt @map("updated_at") @db.Timestamptz(6)
  batch              EmployeeWorkImportBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)
  resolvedEmployee   ResourceProfile?        @relation(fields: [resolvedEmployeeId], references: [id], onDelete: SetNull)
  resolvedProject    Project?                @relation(fields: [resolvedProjectId], references: [id], onDelete: SetNull)
  resolvedTask       WorkTask?               @relation(fields: [resolvedTaskId], references: [id], onDelete: SetNull)
  workItem           EmployeeWorkItem?

  @@unique([batchId, rowNumber])
  @@index([batchId, status])
  @@map("employee_work_import_rows")
  @@schema("app")
}

model EmployeeWorkItem {
  id             String                  @id @default(cuid())
  employeeId     String                  @map("employee_id")
  importBatchId  String                  @map("import_batch_id")
  sourceRowId    String                  @unique @map("source_row_id")
  periodStartAt  DateTime                @map("period_start_at") @db.Date
  periodEndAt    DateTime                @map("period_end_at") @db.Date
  title          String
  planText       String?                 @map("plan_text")
  summaryText    String?                 @map("summary_text")
  completionRate Int?                    @map("completion_rate")
  status         EmployeeWorkStatus
  nextPlanText   String?                 @map("next_plan_text")
  riskText       String?                 @map("risk_text")
  plannedHours   Decimal?                @map("planned_hours") @db.Decimal(6, 2)
  actualHours    Decimal?                @map("actual_hours") @db.Decimal(6, 2)
  projectId      String?                 @map("project_id")
  taskId         String?                 @map("task_id")
  riskId         String?                 @unique @map("risk_id")
  note           String?
  rawRow         Json                    @map("raw_row")
  archivedAt     DateTime?               @map("archived_at") @db.Timestamptz(6)
  createdAt      DateTime                @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime                @updatedAt @map("updated_at") @db.Timestamptz(6)
  employee       ResourceProfile         @relation(fields: [employeeId], references: [id], onDelete: Restrict)
  importBatch    EmployeeWorkImportBatch @relation(fields: [importBatchId], references: [id], onDelete: Restrict)
  sourceRow      EmployeeWorkImportRow   @relation(fields: [sourceRowId], references: [id], onDelete: Restrict)
  project        Project?                @relation(fields: [projectId], references: [id], onDelete: SetNull)
  task           WorkTask?               @relation(fields: [taskId], references: [id], onDelete: SetNull)
  risk           Risk?                   @relation(fields: [riskId], references: [id], onDelete: SetNull)
  loadEntry      ResourceLoadEntry?

  @@index([employeeId, periodStartAt, archivedAt])
  @@index([projectId, periodStartAt, archivedAt])
  @@index([importBatchId, archivedAt])
  @@map("employee_work_items")
  @@schema("app")
}

model EmployeeProgressSnapshot {
  id             String                 @id @default(cuid())
  scopeType      EmployeeProgressScope  @map("scope_type")
  scopeKey       String                 @map("scope_key")
  scopeId        String?                @map("scope_id")
  periodType     EmployeeProgressPeriod @map("period_type")
  periodStartAt  DateTime               @map("period_start_at") @db.Date
  periodEndAt    DateTime               @map("period_end_at") @db.Date
  version        Int
  metrics        Json
  highlights     Json
  risks          Json
  sourceBatchIds String[]               @map("source_batch_ids")
  generatedAt    DateTime               @default(now()) @map("generated_at") @db.Timestamptz(6)
  archivedAt     DateTime?              @map("archived_at") @db.Timestamptz(6)
  createdAt      DateTime               @default(now()) @map("created_at") @db.Timestamptz(6)

  @@unique([scopeKey, periodType, periodStartAt, version])
  @@index([scopeType, scopeId, periodType, periodStartAt])
  @@map("employee_progress_snapshots")
  @@schema("app")
}
```

`scopeKey` is always non-null: `TEAM`, `EMPLOYEE:<employeeId>`, or `PROJECT:<projectId>`. This closes PostgreSQL's nullable-unique gap for team snapshots.

Import-batch `version` remains null while the batch is staged. The commit transaction locks the current period, allocates `max(version) + 1`, and writes the non-null version together with `COMPLETED`; this avoids reserving visible versions for abandoned drafts.

Extend:

```prisma
model ResourceProfile {
  department       String?
  managerName      String?          @map("manager_name")
  employmentStatus EmploymentStatus @default(ACTIVE) @map("employment_status")
  employeeWorkItems EmployeeWorkItem[]
  resolvedEmployeeImportRows EmployeeWorkImportRow[]
}

model WorkTask {
  code              String             @unique @default(dbgenerated("app.generate_task_code()"))
  employeeWorkItems EmployeeWorkItem[]
  resolvedEmployeeImportRows EmployeeWorkImportRow[]
}

model ResourceLoadEntry {
  employeeWorkItemId        String?           @unique @map("employee_work_item_id")
  employeeWorkImportBatchId String?           @map("employee_work_import_batch_id")
  employeeWorkItem          EmployeeWorkItem? @relation(fields: [employeeWorkItemId], references: [id], onDelete: SetNull)
  employeeWorkImportBatch   EmployeeWorkImportBatch? @relation(fields: [employeeWorkImportBatchId], references: [id], onDelete: SetNull)
}

model Project {
  employeeWorkItems EmployeeWorkItem[]
  resolvedEmployeeImportRows EmployeeWorkImportRow[]
}

model Risk {
  employeeWorkItem EmployeeWorkItem?
}
```

- [ ] **Step 4: Add an API regression test for database-generated task codes**

Extend `tasks.controller.spec.ts`:

```ts
const created = await request(app.getHttpServer())
  .post('/api/tasks')
  .send({ title: `${prefix} coded task` })
  .expect(201);
expect(created.body.data.code).toMatch(/^TASK-[A-F0-9]{10}$/);
await expect(prisma.workTask.findUniqueOrThrow({
  where: { id: created.body.data.id },
})).resolves.toMatchObject({ code: created.body.data.code });
```

The create and update DTOs must not expose `code`.

- [ ] **Step 5: Write and apply the SQL migration**

The migration must:

1. Create the enums and tables.
2. Add employee fields to `app.resource_profiles`.
3. Create the volatile PostgreSQL function `app.generate_task_code()`, add nullable `code` to `app.tasks`, backfill with `TASK-` plus the first ten uppercase characters of `md5(id)`, set the function as the column default, set `NOT NULL`, and add a unique index. The database default keeps direct Prisma fixture creation and every service path compatible.
4. Add employee-source columns to `app.resource_load_entries`.
5. Add indexes for active employee names, batch period/version, batch hash, row status, work period/employee/project, and snapshot scope/period.
6. Add foreign keys with `RESTRICT` for employee and batch facts and `SET NULL` for project/task/risk historical links.

Use this database default:

```sql
CREATE OR REPLACE FUNCTION app.generate_task_code()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT 'TASK-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10))
$$;

ALTER TABLE app.tasks
  ALTER COLUMN code SET DEFAULT app.generate_task_code();
```

Run:

```bash
cd backend
pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm test:integration -- --runInBand test/integration/prisma/employee-work-progress-catalog.spec.ts
pnpm test:integration -- --runInBand test/integration/modules/workbench/tasks.controller.spec.ts
pnpm build
```

Expected: Prisma generation succeeds, migration deploys once, the catalog and task-controller tests pass, and the backend still builds.

- [ ] **Step 6: Commit the catalog**

```bash
git add backend/prisma backend/test/integration/prisma/employee-work-progress-catalog.spec.ts backend/test/integration/modules/workbench/tasks.controller.spec.ts
git commit -m "feat: add employee progress data catalog and task codes"
```

## Task 2: Expose employee profile CRUD

**Files:**
- Create: `backend/src/modules/workbench/employees/employees.module.ts`
- Create: `backend/src/modules/workbench/employees/application/employees.service.ts`
- Create: `backend/src/modules/workbench/employees/interface/http/employees.controller.ts`
- Create: `backend/src/modules/workbench/employees/interface/http/dto/employees.dto.ts`
- Modify: `backend/src/modules/workbench/workbench.module.ts`
- Modify: `backend/src/shared/errors/error-codes.ts`
- Create: `backend/test/unit/modules/workbench/employees.service.spec.ts`
- Create: `backend/test/integration/modules/workbench/employees.controller.spec.ts`

- [ ] **Step 1: Write failing service tests**

Test employee-name uniqueness, status filtering, update, and archive behavior:

```ts
it('lists active employees and preserves the employee profile vocabulary', async () => {
  const prisma = {
    resourceProfile: {
      findMany: jest.fn().mockResolvedValue([{ id: 'employee-1', displayName: '张明' }]),
      count: jest.fn().mockResolvedValue(1),
    },
    $transaction: jest.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
  } as unknown as PlatformPrismaService;
  const service = new EmployeesService(prisma);
  await expect(service.list({ employmentStatus: EmploymentStatus.ACTIVE })).resolves.toMatchObject({
    data: [{ displayName: '张明' }],
    meta: { total: 1 },
  });
});

```

- [ ] **Step 2: Run focused tests and verify failure**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/employees.service.spec.ts
```

Expected: FAIL because `EmployeesService` is missing.

- [ ] **Step 3: Implement DTOs and employee service**

`employees.dto.ts` must define:

```ts
export class ListEmployeesQueryDto {
  @Transform(trim) @IsOptional() @IsString() q?: string;
  @Transform(trim) @IsOptional() @IsString() department?: string;
  @IsOptional() @IsEnum(EmploymentStatus) employmentStatus?: EmploymentStatus;
  @Transform(number) @IsOptional() @IsInt() @Min(1) page?: number;
  @Transform(number) @IsOptional() @IsInt() @Min(1) pageSize?: number;
}

export class CreateEmployeeDto {
  @Transform(trim) @IsString() @IsNotEmpty() displayName!: string;
  @Transform(trim) @IsOptional() @IsString() department?: string;
  @Transform(trim) @IsOptional() @IsString() roleTitle?: string;
  @Transform(trim) @IsOptional() @IsString() managerName?: string;
  @IsOptional() @IsEnum(EmploymentStatus) employmentStatus?: EmploymentStatus;
  @Transform(number) @IsOptional() @IsInt() @Min(0) @Max(168) weeklyCapacityHours?: number;
  @Transform(trim) @IsOptional() @IsString() developmentGoal?: string;
  @Transform(trim) @IsOptional() @IsString() notes?: string;
}

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}
```

`EmployeesService` must query `resourceProfile`, include skills, translate Prisma `P2002` into `RESOURCE_NAME_EXISTS`, and reuse the existing archive guard for active load entries.

- [ ] **Step 4: Add controllers and module wiring**

Expose:

```ts
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}
  @Get() list(@Query() query: ListEmployeesQueryDto) { return this.employees.list(query); }
  @Post() create(@Body() dto: CreateEmployeeDto) { return this.employees.create(dto); }
  @Get(':id') get(@Param('id') id: string) { return this.employees.get(id); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employees.update(id, dto);
  }
  @Delete(':id') @HttpCode(HttpStatus.NO_CONTENT) async archive(@Param('id') id: string) {
    await this.employees.archive(id);
  }
}
```

Register `EmployeesModule` in `WorkbenchModule`.

- [ ] **Step 5: Add and run the integration lifecycle test**

The integration test must create, list, update, read, and archive an employee through `/api/employees`.

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/employees.service.spec.ts
pnpm test:integration -- --runInBand test/integration/modules/workbench/employees.controller.spec.ts
```

Expected: all focused tests pass.

- [ ] **Step 6: Commit employee master data**

```bash
git add backend/src/modules/workbench/employees backend/src/modules/workbench/workbench.module.ts backend/src/shared/errors/error-codes.ts backend/test
git commit -m "feat: add employee profiles"
```

## Task 3: Generate and parse the standard employee workbook

**Files:**
- Create: `backend/src/modules/workbench/employees/domain/employee-work.types.ts`
- Create: `backend/src/modules/workbench/employees/application/employee-workbook.service.ts`
- Create: `backend/test/unit/modules/workbench/employee-workbook.service.spec.ts`
- Modify: `backend/src/modules/workbench/employees/employees.module.ts`

- [ ] **Step 1: Write failing template and parser tests**

```ts
it('generates the approved two-sheet workbook and parses one work item', async () => {
  const template = await service.template();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template);
  expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['说明', '工作明细']);
  const sheet = workbook.getWorksheet('工作明细')!;
  sheet.addRow(['张明', '接口重构', '完成权限接口', '核心接口完成', 90, '进行中', '补缓存', '', 16, 18, 'RD-026', '', '']);
  const parsed = await service.parse(Buffer.from(await workbook.xlsx.writeBuffer()));
  expect(parsed.rows[0]).toMatchObject({
    rowNumber: 2,
    employeeName: '张明',
    title: '接口重构',
    completionRate: 90,
    projectCode: 'RD-026',
  });
});

it.each([
  ['缺少工作内容', ['员工姓名']],
  ['完成度越界', ['员工姓名', '工作内容', '完成度']],
])('%s produces a field-level error', async (_name, headers) => {
  await expect(parseWithHeaders(headers)).rejects.toMatchObject({
    code: 'EMPLOYEE_IMPORT_TEMPLATE_INVALID',
  });
});
```

- [ ] **Step 2: Run and verify failure**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/employee-workbook.service.spec.ts
```

Expected: FAIL because the workbook service is absent.

- [ ] **Step 3: Implement the workbook contract**

Define the normalized row as:

```ts
export interface NormalizedEmployeeWorkRow {
  rowNumber: number;
  employeeName: string;
  title: string;
  planText: string | null;
  summaryText: string | null;
  completionRate: number | null;
  status: EmployeeWorkStatus;
  nextPlanText: string | null;
  riskText: string | null;
  plannedHours: number | null;
  actualHours: number | null;
  projectCode: string | null;
  taskCode: string | null;
  note: string | null;
  rawValues: Record<string, string | number | null>;
}
```

`EmployeeWorkbookService.template()` must create:

- `说明`: template version `1`, type `WEEK`, start/end date cells, allowed status values, and field instructions.
- `工作明细`: the thirteen exact headers from the spec, frozen first row, filters, widths, date/percentage/hour validation, and status drop-down.

`parse()` must reject non-XLSX signatures, files above 20 MiB, missing sheets, unsupported template versions, missing/duplicate headers, over 50,000 data rows, and cell text above 10,000 characters.

- [ ] **Step 4: Run parser tests**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/employee-workbook.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit workbook support**

```bash
git add backend/src/modules/workbench/employees backend/test/unit/modules/workbench/employee-workbook.service.spec.ts
git commit -m "feat: add employee work workbook contract"
```

## Task 4: Upload, preview, validate, and resolve import rows

**Files:**
- Create: `backend/src/modules/workbench/employees/application/employee-import-validator.service.ts`
- Create: `backend/src/modules/workbench/employees/application/employee-imports.service.ts`
- Create: `backend/src/modules/workbench/employees/interface/http/employee-imports.controller.ts`
- Create: `backend/src/modules/workbench/employees/interface/http/dto/employee-imports.dto.ts`
- Modify: `backend/src/modules/workbench/employees/employees.module.ts`
- Modify: `backend/src/modules/workbench/governance/application/audit-log.service.ts`
- Create: `backend/test/unit/modules/workbench/employee-import-validator.service.spec.ts`
- Create: `backend/test/unit/modules/workbench/employee-imports.service.spec.ts`
- Create: `backend/test/integration/modules/workbench/employee-imports.controller.spec.ts`

- [ ] **Step 1: Write failing validator tests**

Cover exact employee/project/task matching and field errors:

```ts
it('marks unknown employees and projects unresolved and rejects a task outside the project', async () => {
  const result = await validator.validate([
    row({ employeeName: '未知员工', projectCode: 'RD-404' }),
    row({ employeeName: '张明', projectCode: 'RD-026', taskCode: 'TASK-OTHER001' }),
  ]);
  expect(result).toEqual([
    expect.objectContaining({ status: 'UNRESOLVED', errors: expect.arrayContaining([
      expect.objectContaining({ field: '员工姓名', code: 'EMPLOYEE_NOT_FOUND' }),
      expect.objectContaining({ field: '项目编号', code: 'PROJECT_NOT_FOUND' }),
    ]) }),
    expect.objectContaining({ status: 'UNRESOLVED', errors: [
      expect.objectContaining({ field: '任务编号', code: 'TASK_PROJECT_MISMATCH' }),
    ] }),
  ]);
});
```

- [ ] **Step 2: Run the validator test and verify failure**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/employee-import-validator.service.spec.ts
```

Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Implement upload and preview**

`POST /employee-work-imports` must:

- accept exactly one `file`,
- calculate SHA-256,
- sanitize the displayed original name with `basename()` and replace control characters,
- return an existing non-expired batch for the same period and hash,
- store the source under `employee-imports/<batchId>/source.xlsx`,
- create `UPLOADED`,
- audit `EMPLOYEE_IMPORT_UPLOADED`.

`PATCH /employee-work-imports/:id/preview` must:

- parse the stored workbook,
- resolve all names/codes in bulk,
- replace staged rows in one transaction,
- store field-level errors,
- emit an error workbook when errors exist,
- calculate a preview fingerprint from file hash, period, normalized rows, and resolutions,
- set `PREVIEWED`, `RESOLVING`, or `READY`.

Update `EmployeesModule` to import `StorageModule` and `GovernanceModule`, then register the workbook, validator, import service, and import controller. Use the existing `StoragePort`; do not read or write upload paths directly.

- [ ] **Step 4: Implement explicit resolutions**

Use this DTO:

```ts
export class ResolveEmployeeImportRowDto {
  @IsInt() @Min(2) rowNumber!: number;
  @IsOptional() @IsString() employeeId?: string | null;
  @IsOptional() @IsString() projectId?: string | null;
  @IsOptional() @IsString() taskId?: string | null;
  @IsOptional() @IsBoolean() keepUnlinked?: boolean;
}

export class ResolveEmployeeImportDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResolveEmployeeImportRowDto)
  rows!: ResolveEmployeeImportRowDto[];
}
```

`PATCH /employee-work-imports/:id/resolutions` must revalidate every changed row and then recompute batch counts and fingerprint. It may allow an unknown project to become intentionally unlinked, but it may not allow an unknown employee or project/task mismatch.

- [ ] **Step 5: Add safe draft cleanup**

Expose `DELETE /employee-work-imports/:id`. It may remove stored source/error files and mark a batch `EXPIRED` only when status is `UPLOADED`, `PREVIEWED`, `RESOLVING`, `READY`, or `FAILED`. It must reject `IMPORTING`, `COMPLETED`, and `SUPERSEDED`.

- [ ] **Step 6: Add integration coverage**

Use an in-memory ExcelJS workbook to verify upload, preview, unresolved rows, resolution, error download, and no writes to `EmployeeWorkItem`.

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/employee-import-validator.service.spec.ts test/unit/modules/workbench/employee-imports.service.spec.ts
pnpm test:integration -- --runInBand test/integration/modules/workbench/employee-imports.controller.spec.ts
```

Expected: all tests pass; preview leaves formal work items at zero.

- [ ] **Step 7: Commit staged imports**

```bash
git add backend/src/modules/workbench/employees backend/src/modules/workbench/governance/application/audit-log.service.ts backend/test
git commit -m "feat: add employee work import preflight"
```

## Task 5: Commit imports atomically and replace period versions

**Files:**
- Create: `backend/src/modules/workbench/employees/application/employee-import-commit.service.ts`
- Modify: `backend/src/modules/workbench/employees/application/employee-imports.service.ts`
- Modify: `backend/src/modules/workbench/employees/interface/http/employee-imports.controller.ts`
- Modify: `backend/src/modules/workbench/employees/employees.module.ts`
- Create: `backend/test/unit/modules/workbench/employee-import-commit.service.spec.ts`
- Modify: `backend/test/integration/modules/workbench/employee-imports.controller.spec.ts`

- [ ] **Step 1: Write failing commit tests**

```ts
it('replaces the current week in one transaction and archives derived load from the old version', async () => {
  const result = await service.commit('batch-v2');
  expect(result).toMatchObject({ status: 'COMPLETED', version: 2 });
  expect(tx.employeeWorkImportBatch.update).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'batch-v1' },
    data: { status: 'SUPERSEDED' },
  }));
  expect(tx.resourceLoadEntry.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { employeeWorkImportBatchId: 'batch-v1', archivedAt: null },
  }));
});

it('returns the completed batch when commit is retried', async () => {
  await expect(service.commit('already-completed')).resolves.toMatchObject({
    id: 'already-completed',
    status: 'COMPLETED',
  });
});
```

- [ ] **Step 2: Run and verify failure**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/employee-import-commit.service.spec.ts
```

Expected: FAIL because commit orchestration is absent.

- [ ] **Step 3: Implement the transactional claim and write**

`commit(batchId)` must:

1. Return completed batches unchanged.
2. Reject non-`READY` batches.
3. Claim with `updateMany({ status: READY }, { status: IMPORTING })`.
4. Lock current completed batch for the same week using `FOR UPDATE`.
5. Recheck employee/project/task activity and preview fingerprint.
6. Create work items in deterministic row-number order.
7. Create one load entry per work item with non-null planned hours.
8. Archive old-version load entries and work items.
9. Mark old batch `SUPERSEDED`.
10. Allocate `version = max(completed/superseded version) + 1`, mark the new batch `COMPLETED`, and set `snapshotStatus: NOT_STARTED`.
11. Record audit data through the same transaction.

Map load kind exactly:

```ts
function loadKind(input: { projectId: string | null; taskId: string | null }) {
  if (input.taskId) return LoadEntryKind.TASK;
  if (input.projectId) return LoadEntryKind.PROJECT;
  return LoadEntryKind.OTHER;
}
```

- [ ] **Step 4: Verify transaction rollback and retry**

Extend integration tests to force one invalid task after preview, expect `422`, and assert:

- zero new work items,
- zero new load entries,
- old batch remains current,
- failed batch status becomes `FAILED`,
- a corrected new preview can be committed safely.

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/employee-import-commit.service.spec.ts
pnpm test:integration -- --runInBand test/integration/modules/workbench/employee-imports.controller.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit atomic period replacement**

```bash
git add backend/src/modules/workbench/employees backend/test
git commit -m "feat: commit employee work imports atomically"
```

## Task 6: Generate weekly and monthly progress snapshots

**Files:**
- Create: `backend/src/modules/workbench/employees/application/employee-progress-snapshot.service.ts`
- Modify: `backend/src/modules/workbench/employees/application/employee-import-commit.service.ts`
- Modify: `backend/src/modules/workbench/employees/application/employee-imports.service.ts`
- Modify: `backend/src/modules/workbench/employees/interface/http/employee-imports.controller.ts`
- Modify: `backend/src/modules/workbench/employees/employees.module.ts`
- Create: `backend/test/unit/modules/workbench/employee-progress-snapshot.service.spec.ts`
- Modify: `backend/test/integration/modules/workbench/employee-imports.controller.spec.ts`

- [ ] **Step 1: Write failing metric tests**

```ts
it('uses null rather than a misleading zero percent when the denominator is empty', () => {
  expect(service.metrics([])).toEqual(expect.objectContaining({
    workItemCount: 0,
    completionRate: null,
    averageCompletionRate: null,
  }));
});

it('builds month data from current weekly batches and reports missing weeks', async () => {
  const snapshot = await service.rebuildMonth(new Date('2026-07-01T00:00:00.000Z'));
  expect(snapshot.metrics).toMatchObject({
    workItemCount: 8,
    missingWeeks: ['2026-07-06'],
    dataComplete: false,
  });
});
```

- [ ] **Step 2: Run and verify failure**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/employee-progress-snapshot.service.spec.ts
```

Expected: FAIL because snapshot generation does not exist.

- [ ] **Step 3: Implement deterministic snapshot metrics**

Create a pure metric reducer returning:

```ts
export interface EmployeeProgressMetrics {
  workItemCount: number;
  completedCount: number;
  completionRate: number | null;
  averageCompletionRate: number | null;
  plannedHours: number;
  actualHours: number;
  riskCount: number;
  blockedCount: number;
  projectCount: number;
  unlinkedCount: number;
  dataComplete: boolean;
  missingWeeks: string[];
}
```

Generate `TEAM`, every affected `EMPLOYEE`, and every affected `PROJECT` weekly snapshot. Rebuild the month containing the week end date from only `COMPLETED` current batches. Snapshot JSON must include highlight work-item IDs, risk work-item IDs, and source batch IDs.

For each scope and period, lock existing active snapshots, archive them, and create `version = max(version) + 1`. Build `scopeKey` exactly as `TEAM`, `EMPLOYEE:<employeeId>`, or `PROJECT:<projectId>` so retrying rebuild produces one new auditable version rather than conflicting nullable team keys.

- [ ] **Step 4: Connect generation to commit and rebuild**

After the database transaction:

1. Set `snapshotStatus: GENERATING`.
2. Generate weekly snapshots.
3. Rebuild affected monthly snapshots.
4. Set `snapshotStatus: READY`.
5. On failure, set `snapshotStatus: FAILED`, persist the safe error code, and return the completed batch with a warning.

Expose `POST /employee-work-imports/:id/rebuild-snapshots`; it must be idempotent.

- [ ] **Step 5: Run unit and integration tests**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/employee-progress-snapshot.service.spec.ts
pnpm test:integration -- --runInBand test/integration/modules/workbench/employee-imports.controller.spec.ts
```

Expected: snapshot metrics and rebuild lifecycle pass.

- [ ] **Step 6: Commit snapshot generation**

```bash
git add backend/src/modules/workbench/employees backend/test
git commit -m "feat: generate employee progress snapshots"
```

## Task 7: Add dashboard, employee, project, work-detail, and import-history reads

**Files:**
- Create: `backend/src/modules/workbench/employees/application/employee-progress-query.service.ts`
- Modify: `backend/src/modules/workbench/employees/interface/http/employees.controller.ts`
- Modify: `backend/src/modules/workbench/employees/interface/http/employee-imports.controller.ts`
- Modify: `backend/src/modules/workbench/employees/interface/http/dto/employees.dto.ts`
- Modify: `backend/src/modules/workbench/employees/employees.module.ts`
- Create: `backend/test/unit/modules/workbench/employee-progress-query.service.spec.ts`
- Create: `backend/test/integration/modules/workbench/employee-progress.controller.spec.ts`

- [ ] **Step 1: Write failing query tests**

```ts
it('returns team metrics, employee rows, project contribution, and completeness for one week', async () => {
  const result = await service.team({ periodType: 'WEEK', periodStart: '2026-07-20' });
  expect(result).toEqual(expect.objectContaining({
    period: { type: 'WEEK', start: '2026-07-20', end: '2026-07-26' },
    metrics: expect.objectContaining({ workItemCount: 8 }),
    employees: expect.arrayContaining([expect.objectContaining({ employeeId: 'employee-1' })]),
    projects: expect.arrayContaining([expect.objectContaining({ projectCode: 'RD-026' })]),
  }));
});
```

- [ ] **Step 2: Run and verify failure**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/employee-progress-query.service.spec.ts
```

Expected: FAIL because the query service is absent.

- [ ] **Step 3: Implement DTOs and projections**

Add:

```ts
export class ProgressPeriodQueryDto {
  @IsEnum(EmployeeProgressPeriod) periodType!: EmployeeProgressPeriod;
  @IsDateString() periodStart!: string;
  @Transform(trim) @IsOptional() @IsString() department?: string;
  @Transform(trim) @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsEnum(EmployeeWorkStatus) status?: EmployeeWorkStatus;
}

export class ListEmployeeWorkItemsQueryDto extends ProgressPeriodQueryDto {
  @Transform(trim) @IsOptional() @IsString() employeeId?: string;
  @Transform(number) @IsOptional() @IsInt() @Min(1) page?: number;
  @Transform(number) @IsOptional() @IsInt() @Min(1) pageSize?: number;
}
```

Expose:

- `GET /employee-progress`
- `GET /employee-work-items`
- `GET /employees/:id/progress`
- `GET /projects/:id/team-progress`
- `GET /employee-work-imports`
- `GET /employee-work-imports/:id`
- source and error downloads

Every response must include source batch IDs and work-item links needed for drill-through.

- [ ] **Step 4: Add restore lifecycle**

`POST /employee-work-imports/:id/restore` must:

- require a `SUPERSEDED` or `COMPLETED` source batch,
- copy its resolved rows into a new batch version,
- set `restoredFromBatchId`,
- run the normal commit and snapshot path,
- preserve every prior version.

- [ ] **Step 5: Run query integration tests**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/employee-progress-query.service.spec.ts
pnpm test:integration -- --runInBand test/integration/modules/workbench/employee-progress.controller.spec.ts
```

Expected: team, employee, project, work-detail, history, and restore queries pass.

- [ ] **Step 6: Commit progress queries**

```bash
git add backend/src/modules/workbench/employees backend/test
git commit -m "feat: expose employee progress dashboards"
```

## Task 8: Add risk conversion, audit coverage, search, and export

**Files:**
- Create: `backend/src/modules/workbench/employees/application/employee-work-risk.service.ts`
- Create: `backend/src/modules/workbench/search/adapters/employees-search.adapter.ts`
- Modify: `backend/src/modules/workbench/employees/interface/http/employees.controller.ts`
- Modify: `backend/src/modules/workbench/employees/employees.module.ts`
- Modify: `backend/src/modules/workbench/search/domain/search.types.ts`
- Modify: `backend/src/modules/workbench/search/search.module.ts`
- Modify: `backend/src/modules/workbench/governance/application/audit-log.service.ts`
- Create: `backend/test/unit/modules/workbench/employee-work-risk.service.spec.ts`
- Create: `backend/test/unit/modules/workbench/employees-search.adapter.spec.ts`
- Modify: `backend/test/integration/modules/workbench/employee-progress.controller.spec.ts`

- [ ] **Step 1: Write failing risk-conversion and search tests**

```ts
it('creates one linked project risk and returns it on retry', async () => {
  const first = await service.convert('work-1');
  const second = await service.convert('work-1');
  expect(first.risk.id).toBe(second.risk.id);
  expect(second.alreadyExists).toBe(true);
});

it('finds employees and confirmed work content', async () => {
  const hits = await adapter.search('权限', ['EMPLOYEE', 'EMPLOYEE_WORK']);
  expect(hits).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'EMPLOYEE_WORK', path: '/employees/employee-1?periodType=WEEK&periodStart=2026-07-20&workItemId=work-1' }),
  ]));
});
```

- [ ] **Step 2: Run and verify failure**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/employee-work-risk.service.spec.ts test/unit/modules/workbench/employees-search.adapter.spec.ts
```

Expected: FAIL because both services are absent.

- [ ] **Step 3: Implement idempotent risk conversion**

The conversion endpoint is `POST /employee-work-items/:id/convert-risk`. It must reject:

- archived or superseded work items,
- empty risk text and non-risk statuses,
- missing/archived projects.

Use `RisksService.createRiskInTransaction()` with:

```ts
{
  title: workItem.title,
  description: workItem.riskText ?? undefined,
  likelihood: RiskLikelihood.POSSIBLE,
  impact: RiskImpact.MEDIUM,
  level: RiskLevel.MEDIUM,
  ownerName: workItem.employee.displayName,
  projectId: workItem.projectId!,
  taskId: workItem.taskId ?? undefined,
}
```

Persist `riskId` in the same transaction and return `{ risk, alreadyExists }`.

Import `ManagementModule` into `EmployeesModule` so the employee module reuses the exported `RisksService` instead of duplicating project-health recalculation.

- [ ] **Step 4: Register employee search and export**

Add `EMPLOYEE` and `EMPLOYEE_WORK` to `SEARCH_TYPES`, register `EmployeesSearchAdapter`, and add employee/work labels in the search response contract. Add an XLSX export method for `GET /employee-work-items/export` using the current filters and the approved columns. Prefix formula-like text with an apostrophe, matching `ReportsService`.

- [ ] **Step 5: Complete audit coverage**

Allow only safe scalar metadata keys:

```ts
['periodType', 'periodStart', 'periodEnd', 'version', 'rowCount', 'snapshotStatus', 'restoredFromBatchId']
```

Record succeeded/failed events for upload, preview, resolution, commit, snapshot rebuild, restore, export, and risk conversion.

- [ ] **Step 6: Run tests and commit**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/employee-work-risk.service.spec.ts test/unit/modules/workbench/employees-search.adapter.spec.ts
pnpm test:integration -- --runInBand test/integration/modules/workbench/employee-progress.controller.spec.ts test/integration/modules/workbench/search.controller.spec.ts
git add backend/src backend/test
git commit -m "feat: integrate employee progress with risk and search"
```

Expected: focused tests pass and the commit succeeds.

## Task 9: Add frontend API contracts, routes, navigation, and query keys

**Files:**
- Create: `frontend/src/modules/employees/types.ts`
- Create: `frontend/src/modules/employees/api.ts`
- Create: `frontend/src/modules/employees/queryKeys.ts`
- Modify: `frontend/src/constants/routes.ts`
- Modify: `frontend/src/router/routes.ts`
- Modify: `frontend/src/components/AppShell/WorkspaceNavigation.tsx`
- Modify: `frontend/src/router/__tests__/routes.test.ts`
- Modify: `frontend/src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx`
- Create: `frontend/src/modules/employees/__tests__/api.test.ts`
- Modify: `frontend/src/modules/workbench/api/__tests__/contracts.test.ts`

- [ ] **Step 1: Write failing route and API tests**

```ts
it('places employees after projects in primary navigation', () => {
  expect(primaryNavigation.map((item) => item.title)).toEqual([
    '工作台', '我的工作', '项目', '员工', '文档与知识库', '多维表格', '日历', '搜索',
  ]);
  expect(ROUTES.employeeDetail('员工 / A')).toBe('/employees/%E5%91%98%E5%B7%A5%20%2F%20A');
});

it('uploads and previews the employee workbook', async () => {
  const file = new File(['xlsx'], '周报.xlsx');
  await uploadEmployeeWorkImport(file);
  await previewEmployeeWorkImport('batch / 1');
  expect(request).toHaveBeenNthCalledWith(2, '/employee-work-imports/batch%20%2F%201/preview', {
    method: 'PATCH',
    body: JSON.stringify({}),
  });
});
```

- [ ] **Step 2: Run and verify failure**

```bash
cd frontend
pnpm test -- src/router/__tests__/routes.test.ts src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx src/modules/employees/__tests__/api.test.ts
```

Expected: FAIL because employee routes and API files are absent.

- [ ] **Step 3: Define frontend contracts**

`types.ts` must include:

- `Employee`, `EmployeeSkill`, `EmploymentStatus`
- `EmployeeWorkImportBatch`, `EmployeeWorkImportRow`, `ImportRowError`
- `EmployeeWorkItem`, `EmployeeWorkStatus`
- `EmployeeProgressMetrics`, `EmployeeProgressPeriod`
- `TeamProgress`, `EmployeeProgress`, `ProjectTeamProgress`

The property names must exactly match backend DTO outputs. Add compile-time contract samples to `contracts.test.ts`, including non-null `WorkTask.code`.

`EmployeeWorkImportBatch.version` is `number | null` while staged; frontend code may display a version only for completed, superseded, or restored batches.

- [ ] **Step 4: Implement API and routes**

Use `request` for JSON, `download` for template/source/error/export, and `FormData` for upload. Define:

```ts
export const employeeQueryKeys = {
  all: ['employees'] as const,
  list: (filters: EmployeeFilters) => ['employees', 'list', filters] as const,
  detail: (id: string) => ['employees', 'detail', id] as const,
  teamProgress: (filters: ProgressFilters) => ['employees', 'team-progress', filters] as const,
  progress: (id: string, filters: ProgressFilters) => ['employees', 'progress', id, filters] as const,
  imports: (filters: ImportFilters) => ['employees', 'imports', filters] as const,
};
```

Add:

```ts
EMPLOYEES: '/employees',
employeeDetail: (employeeId: string) => `/employees/${encodeURIComponent(employeeId)}`,
```

Use `IconUserGroup` for the employee navigation icon.

- [ ] **Step 5: Run tests and commit**

```bash
cd frontend
pnpm test -- src/router/__tests__/routes.test.ts src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx src/modules/employees/__tests__/api.test.ts
pnpm typecheck:contracts
git add frontend/src
git commit -m "feat: add employee workspace frontend contracts"
```

Expected: all focused tests and contract typecheck pass.

## Task 10: Build the employee directory and profile experience

**Files:**
- Create: `frontend/src/modules/employees/components/EmployeeProfileForm.tsx`
- Create: `frontend/src/pages/EmployeesPage.tsx`
- Create: `frontend/src/pages/EmployeesPage.less`
- Create: `frontend/src/pages/__tests__/EmployeesPage.test.tsx`
- Modify: `frontend/src/router/routes.ts`

- [ ] **Step 1: Write the failing directory test**

```tsx
it('lists employees, filters by department, and edits a profile', async () => {
  renderPage('/employees?tab=directory&department=研发一组');
  expect(await screen.findByText('张明')).toBeInTheDocument();
  expect(screen.getByText('研发一组')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '编辑张明' }));
  await user.clear(screen.getByLabelText('岗位'));
  await user.type(screen.getByLabelText('岗位'), '高级后端工程师');
  await user.click(screen.getByRole('button', { name: '保存员工档案' }));
  await waitFor(() => expect(api.updateEmployee).toHaveBeenCalledWith('employee-1', expect.objectContaining({
    roleTitle: '高级后端工程师',
  })));
});
```

- [ ] **Step 2: Run and verify failure**

```bash
cd frontend
pnpm test -- src/pages/__tests__/EmployeesPage.test.tsx
```

Expected: FAIL because `EmployeesPage` does not exist.

- [ ] **Step 3: Implement directory and URL-backed tabs**

Use Semi `Tabs`, `Table`, `Input`, `Select`, `Tag`, `Modal`, `Button`, `Empty`, `Banner`, and the shared workspace spacing tokens. Tabs are:

- `overview`
- `directory`
- `work-items`
- `imports`

Persist `tab`, `query`, `department`, `employmentStatus`, `periodType`, and `periodStart` through `useWorkspaceSearchParams`. The directory table must expose name, department, role, manager, status, capacity, skills, and actions.

- [ ] **Step 4: Implement the shared profile form**

Use controlled Semi inputs/selects and a standard modal footer:

```tsx
<Modal
  visible={visible}
  title={employee ? '编辑员工档案' : '新建员工'}
  onCancel={onCancel}
  footer={
    <div className="employee-modal__footer">
      <Button onClick={onCancel}>取消</Button>
      <Button theme="solid" type="primary" loading={mutation.isPending} onClick={submit}>
        保存员工档案
      </Button>
    </div>
  }
>
  <EmployeeProfileForm value={draft} onChange={setDraft} />
</Modal>
```

Do not use native date or select controls.

- [ ] **Step 5: Run tests and commit**

```bash
cd frontend
pnpm test -- src/pages/__tests__/EmployeesPage.test.tsx
pnpm typecheck
git add frontend/src
git commit -m "feat: build employee directory"
```

Expected: focused test and typecheck pass.

## Task 11: Build the five-step import wizard and import history

**Files:**
- Create: `frontend/src/modules/employees/components/EmployeeImportWizard.tsx`
- Create: `frontend/src/modules/employees/components/EmployeeImportHistory.tsx`
- Create: `frontend/src/modules/employees/__tests__/EmployeeImportWizard.test.tsx`
- Create: `frontend/src/modules/employees/__tests__/EmployeeImportHistory.test.tsx`
- Modify: `frontend/src/pages/EmployeesPage.tsx`
- Modify: `frontend/src/pages/EmployeesPage.less`

- [ ] **Step 1: Write failing wizard tests**

```tsx
it('blocks commit until every employee and project error is resolved', async () => {
  renderWizard();
  await user.upload(screen.getByLabelText('选择员工计划与总结 Excel'), workbook);
  await screen.findByText('错误 1 行');
  expect(screen.getByRole('button', { name: '确认导入' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '为第 18 行选择员工' }));
  await selectSemiOption(screen.getByLabelText('第 18 行员工'), '张明');
  await user.click(screen.getByRole('button', { name: '保存关联' }));
  expect(await screen.findByRole('button', { name: '确认导入' })).toBeEnabled();
});
```

- [ ] **Step 2: Run and verify failure**

```bash
cd frontend
pnpm test -- src/modules/employees/__tests__/EmployeeImportWizard.test.tsx src/modules/employees/__tests__/EmployeeImportHistory.test.tsx
```

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the five states**

Render:

1. File drop/select and template download.
2. Template/period recognition.
3. Full preflight counts and row errors.
4. Employee/project/task resolutions.
5. Version replacement confirmation and final result.

Use one `Modal` with `footer={null}` and an internal padded footer. Keep pending/error state in React Query mutations. On close, delete only uncommitted import sessions after explicit confirmation.

- [ ] **Step 4: Implement history and recovery**

History must show file, period, version, import status, snapshot status, counts, timestamps, replacement/restoration links, and actions:

- download source,
- download errors,
- rebuild snapshots,
- restore version,
- archive expired draft.

Require `Modal.confirm` for restore and explain that restore creates a new version.

- [ ] **Step 5: Run tests and commit**

```bash
cd frontend
pnpm test -- src/modules/employees/__tests__/EmployeeImportWizard.test.tsx src/modules/employees/__tests__/EmployeeImportHistory.test.tsx src/pages/__tests__/EmployeesPage.test.tsx
pnpm typecheck
git add frontend/src
git commit -m "feat: add employee work import workflow"
```

Expected: focused tests and typecheck pass.

## Task 12: Build dashboards, employee detail, and project drill-through

**Files:**
- Create: `frontend/src/modules/employees/components/EmployeeProgressFilters.tsx`
- Create: `frontend/src/modules/employees/components/EmployeeProgressMetrics.tsx`
- Create: `frontend/src/modules/employees/components/EmployeeWorkTable.tsx`
- Create: `frontend/src/modules/employees/components/EmployeeProgressTrend.tsx`
- Create: `frontend/src/pages/EmployeeDetailPage.tsx`
- Create: `frontend/src/pages/EmployeeDetailPage.less`
- Create: `frontend/src/pages/__tests__/EmployeeDetailPage.test.tsx`
- Modify: `frontend/src/pages/EmployeesPage.tsx`
- Modify: `frontend/src/pages/ProjectWorkspacePage.tsx`
- Modify: `frontend/src/pages/ProjectWorkspacePage.less`
- Modify: `frontend/src/pages/__tests__/ProjectWorkspacePage.test.tsx`
- Modify: `frontend/src/pages/SearchPage.tsx`

- [ ] **Step 1: Write failing dashboard tests**

```tsx
it('switches week/month in the URL and drills from one employee work item to its project', async () => {
  renderPage('/employees/employee-1?periodType=WEEK&periodStart=2026-07-20');
  expect(await screen.findByText('平均完成度')).toBeInTheDocument();
  expect(screen.getByText('88%')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '月' }));
  expect(screen.getByTestId('location')).toHaveTextContent('periodType=MONTH');
  expect(screen.getByRole('link', { name: 'RD-026 权限平台' })).toHaveAttribute(
    'href',
    '/spaces/projects/project-1/overview',
  );
});

it('shows project team progress and links back to the employee period', async () => {
  renderProject('progress');
  expect(await screen.findByRole('heading', { name: '团队进展' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '张明' })).toHaveAttribute(
    'href',
    '/employees/employee-1?periodType=WEEK&periodStart=2026-07-20',
  );
});
```

- [ ] **Step 2: Run and verify failure**

```bash
cd frontend
pnpm test -- src/pages/__tests__/EmployeeDetailPage.test.tsx src/pages/__tests__/ProjectWorkspacePage.test.tsx
```

Expected: FAIL because the dashboard components and project section are absent.

- [ ] **Step 3: Implement team overview and filters**

The overview must render null percentages as “暂无数据”, a missing-week warning, employee progress, project contribution, and risk/blocked cards. Keep period/filter state in the URL and query keys.

`EmployeeProgressMetrics` must use:

```tsx
const percentage = (value: number | null) => value === null ? '暂无数据' : `${value}%`;
```

- [ ] **Step 4: Implement employee detail**

Display profile metadata, period metrics, work rows, trend, project distribution, risks, source batch, and original row. Add a risk-conversion action only when `riskText` exists, a project exists, and `riskId` is null.

- [ ] **Step 5: Implement project team progress**

Fetch `/projects/:id/team-progress` only when the project progress section is visible. Render participants, hours, completions, next plans, and risks with links back to employee detail. Invalidate project health/risk queries after risk conversion.

- [ ] **Step 6: Update global search labels**

Add “员工”和“员工工作” to search filters and ensure returned paths open the appropriate employee and work row.

- [ ] **Step 7: Run tests and commit**

```bash
cd frontend
pnpm test -- src/pages/__tests__/EmployeeDetailPage.test.tsx src/pages/__tests__/EmployeesPage.test.tsx src/pages/__tests__/ProjectWorkspacePage.test.tsx src/pages/__tests__/SearchPage.test.tsx
pnpm typecheck
git add frontend/src
git commit -m "feat: add employee progress dashboards"
```

Expected: all focused UI tests and typecheck pass.

## Task 13: Complete end-to-end verification and product documentation

**Files:**
- Create: `frontend/e2e/employee-work-progress.spec.ts`
- Create: `backend/test/fixtures/employee-work-progress-valid.xlsx`
- Create: `backend/test/fixtures/employee-work-progress-invalid.xlsx`
- Modify: `README.md`
- Modify: `docs/product/2026-07-18-local-feishu-style-functional-backlog.md`

- [ ] **Step 1: Add the end-to-end scenario**

The Playwright test must:

1. Open `/employees`.
2. Create two employees.
3. Download the template.
4. Upload the invalid fixture.
5. Observe unknown employee/project errors and disabled commit.
6. Resolve or re-upload corrected rows.
7. Commit the valid fixture.
8. Verify team and employee weekly dashboards.
9. Open a linked project and verify team progress.
10. Upload a second version for the same week.
11. Verify the old version remains in history and the dashboard uses the new one.
12. Switch to month view and verify missing-week warning.
13. Convert one work risk into a project risk.

- [ ] **Step 2: Run backend verification**

```bash
cd backend
pnpm prisma:generate
pnpm lint
pnpm test:unit -- --runInBand
pnpm test:integration -- --runInBand
pnpm build
```

Expected: every command exits `0`.

- [ ] **Step 3: Run frontend verification**

```bash
cd frontend
pnpm lint
pnpm typecheck
pnpm typecheck:contracts
pnpm test
pnpm build
pnpm test:e2e -- employee-work-progress.spec.ts
```

Expected: every command exits `0`; the employee E2E scenario passes.

- [ ] **Step 4: Verify migration from a populated database**

Use a disposable database cloned from the current schema:

```bash
cd backend
pnpm prisma:migrate:deploy
pnpm prisma:generate
```

Verify:

- existing tasks received non-null unique task codes,
- existing resource profiles remain readable through `/resources` and `/employees`,
- existing load reports are unchanged,
- no old business data was deleted.

- [ ] **Step 5: Update user-facing documentation**

Document:

- employee page route,
- standard template flow,
- required columns,
- exact employee/project matching,
- same-period version replacement,
- snapshot rebuild behavior,
- source/error download locations,
- startup/migration commands.

Mark the employee plan/summary dashboard backlog items complete only after the preceding verification passes.

- [ ] **Step 6: Review the complete diff**

```bash
git status --short
git diff --check
git log --oneline --decorate -15
```

Expected: no whitespace errors, no generated Excel fixtures outside `backend/test/fixtures`, and only intended source/test/doc changes.

- [ ] **Step 7: Commit final verification assets**

```bash
git add frontend/e2e backend/test/fixtures README.md docs/product
git commit -m "test: verify employee work progress workflow"
```

## Final acceptance checklist

- [ ] Employee names are globally unique and existing resource profiles are reused.
- [ ] Every task has an immutable business code.
- [ ] The standard Excel template contains one work item per row.
- [ ] Upload never writes formal work data before successful preflight and confirmation.
- [ ] Unknown employees and invalid project/task references block commit.
- [ ] Repeated commit calls are idempotent.
- [ ] Same-period re-upload creates a new version and preserves history.
- [ ] Period replacement updates imported resource-load entries without touching manual entries.
- [ ] Weekly and monthly TEAM/EMPLOYEE/PROJECT snapshots use only current completed versions.
- [ ] Missing weeks are visible and percentages with no denominator are null.
- [ ] Team, employee, and project pages drill through in both directions.
- [ ] Risk conversion is idempotent and preserves the source work item.
- [ ] Import source, errors, versions, restore, audit, search, and export are usable.
- [ ] No native date/select controls are introduced.
- [ ] Backend lint, unit, integration, and build pass.
- [ ] Frontend lint, typecheck, contracts, unit, build, and employee E2E pass.
