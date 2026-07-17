# 项目执行 P0 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在真实迁入的前端与后端框架中交付单机可用的项目、里程碑、任务、进展和首页驾驶舱闭环。

**Architecture:** NestJS 的 `workbench` 模块新增 `projects`、`tasks`、`dashboard` 三个垂直切片，Prisma 将所有业务表置于既有 `app` schema，并通过一份仅向前的迁移创建。React 在既有 Layout、React Query 与路由内新增项目列表、项目详情、任务页和驾驶舱；页面只经类型化 HTTP client 调用本地 API，不使用模拟业务数据。

**Tech Stack:** React 19、Vite、TanStack Query、React Router、shadcn/Tailwind、NestJS 10、Prisma 6、PostgreSQL 17、Jest、Vitest、Playwright。

---

## 范围与验收

- 项目档案支持编号、类型、研发方向、目标、预期成果、负责人、参与方、计划/实际日期、阶段、状态与归档。
- 里程碑支持计划/实际日期、负责人、关键标记和状态；任务支持父子任务、依赖、优先级、状态、截止时间、来源追溯与归档。
- 任务、关键里程碑和高风险预留的健康度输入会计算绿/黄/红及原因；本计划先实现任务和里程碑输入，风险输入在“管理闭环”计划接入。
- 首页展示真实的今日行动、逾期/临期、项目健康度、临近里程碑和快捷入口；空数据必须显示明确空态。
- 进展汇报可以记录并显示；列表、详情、看板是 P0 本计划的工作视图。日历、自动提醒和风险实体在后续独立计划实现。
- API 返回沿用既有 `{ success: true, data, meta? }` 包装；所有日期均按 ISO UTC 字符串传输和保存。

## 文件结构

```text
backend/
  prisma/schema.prisma                                      # P0 模型和枚举
  prisma/migrations/20260718010000_project_execution/migration.sql
  src/modules/workbench/projects/
    application/project-health.service.ts
    application/projects.service.ts
    interface/http/projects.controller.ts
    interface/http/dto/*.ts
    projects.module.ts
  src/modules/workbench/tasks/
    application/tasks.service.ts
    interface/http/tasks.controller.ts
    interface/http/dto/*.ts
    tasks.module.ts
  src/modules/workbench/dashboard/
    application/dashboard.service.ts
    interface/http/dashboard.controller.ts
    dashboard.module.ts
  test/integration/workbench-projects.spec.ts
  test/unit/modules/workbench/project-health.service.spec.ts

frontend/
  src/lib/http.ts                                           # 统一 fetch、错误与 API base URL
  src/modules/workbench/api/projects.ts
  src/modules/workbench/api/tasks.ts
  src/modules/workbench/api/dashboard.ts
  src/modules/workbench/types.ts
  src/modules/workbench/components/ProjectForm.tsx
  src/modules/workbench/components/TaskForm.tsx
  src/modules/workbench/components/HealthBadge.tsx
  src/modules/workbench/components/TaskBoard.tsx
  src/pages/ProjectsPage.tsx
  src/pages/ProjectDetailPage.tsx
  src/pages/TasksPage.tsx
  src/pages/WorkbenchHome.tsx
  src/router/routes.ts
  src/constants/routes.ts
  src/pages/__tests__/*.test.tsx
  e2e/workbench-project-execution.spec.ts
```

### Task 1: 建立 P0 数据模型和迁移

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260718010000_project_execution/migration.sql`
- Create: `backend/test/unit/modules/workbench/project-health.service.spec.ts`

- [ ] **Step 1: 写出模型可生成性测试，并确认当前缺少 `Project` 模型。**

```ts
import { PrismaClient } from '@prisma/client';

describe('project execution Prisma contract', () => {
  it('exposes project, milestone and workTask delegates', () => {
    const prisma = new PrismaClient();
    expect(prisma).toHaveProperty('project');
    expect(prisma).toHaveProperty('milestone');
    expect(prisma).toHaveProperty('workTask');
  });
});
```

Run: `cd backend && pnpm prisma:generate && pnpm test:unit -- project-execution-prisma.spec.ts`

Expected: FAIL because `Project`/`Milestone`/`WorkTask` delegates do not exist.

- [ ] **Step 2: 在 `schema.prisma` 加入下列稳定枚举与模型。**

```prisma
enum ProjectStatus {
  DRAFT ACTIVE ON_HOLD COMPLETED CANCELLED
  @@schema("app")
}
enum ProjectPhase {
  DISCOVERY PLANNING RESEARCH DEVELOPMENT VALIDATION DELIVERY
  @@schema("app")
}
enum MilestoneStatus {
  PENDING IN_PROGRESS COMPLETED MISSED
  @@schema("app")
}
enum TaskStatus {
  TODO IN_PROGRESS BLOCKED DONE CANCELLED
  @@schema("app")
}
enum TaskPriority {
  LOW MEDIUM HIGH CRITICAL
  @@schema("app")
}
enum ProjectHealth {
  GREEN YELLOW RED
  @@schema("app")
}

model Project {
  id String @id @default(cuid())
  code String @unique
  name String
  type String?
  researchDirection String? @map("research_direction")
  objective String?
  expectedOutcome String? @map("expected_outcome")
  leadName String? @map("lead_name")
  participantNames String[] @default([]) @map("participant_names")
  plannedStartAt DateTime? @map("planned_start_at") @db.Timestamptz(6)
  plannedEndAt DateTime? @map("planned_end_at") @db.Timestamptz(6)
  actualStartAt DateTime? @map("actual_start_at") @db.Timestamptz(6)
  actualEndAt DateTime? @map("actual_end_at") @db.Timestamptz(6)
  phase ProjectPhase @default(PLANNING)
  status ProjectStatus @default(DRAFT)
  archivedAt DateTime? @map("archived_at") @db.Timestamptz(6)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  milestones Milestone[]
  tasks WorkTask[]
  progressReports ProgressReport[]
  healthSnapshots ProjectHealthSnapshot[]
  @@index([status, archivedAt])
  @@index([plannedEndAt])
  @@schema("app")
  @@map("projects")
}
```

Add the remaining models exactly as follows:

```prisma
model Milestone {
  id String @id @default(cuid())
  projectId String @map("project_id")
  name String
  plannedAt DateTime? @map("planned_at") @db.Timestamptz(6)
  actualAt DateTime? @map("actual_at") @db.Timestamptz(6)
  ownerName String? @map("owner_name")
  isCritical Boolean @default(false) @map("is_critical")
  status MilestoneStatus @default(PENDING)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  tasks WorkTask[]
  @@index([projectId, plannedAt])
  @@schema("app")
  @@map("milestones")
}

model WorkTask {
  id String @id @default(cuid())
  projectId String? @map("project_id")
  milestoneId String? @map("milestone_id")
  parentId String? @map("parent_id")
  title String
  description String?
  assigneeName String? @map("assignee_name")
  collaboratorNames String[] @default([]) @map("collaborator_names")
  priority TaskPriority @default(MEDIUM)
  status TaskStatus @default(TODO)
  dueAt DateTime? @map("due_at") @db.Timestamptz(6)
  completedAt DateTime? @map("completed_at") @db.Timestamptz(6)
  sourceType String? @map("source_type")
  sourceId String? @map("source_id")
  archivedAt DateTime? @map("archived_at") @db.Timestamptz(6)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  project Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)
  milestone Milestone? @relation(fields: [milestoneId], references: [id], onDelete: SetNull)
  parent WorkTask? @relation("TaskHierarchy", fields: [parentId], references: [id], onDelete: SetNull)
  children WorkTask[] @relation("TaskHierarchy")
  dependencies TaskDependency[] @relation("DependencyTask")
  dependents TaskDependency[] @relation("DependencyDependsOn")
  @@index([projectId, status, dueAt])
  @@index([milestoneId])
  @@index([parentId])
  @@schema("app")
  @@map("tasks")
}

model TaskDependency {
  taskId String @map("task_id")
  dependsOnTaskId String @map("depends_on_task_id")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  task WorkTask @relation("DependencyTask", fields: [taskId], references: [id], onDelete: Cascade)
  dependsOnTask WorkTask @relation("DependencyDependsOn", fields: [dependsOnTaskId], references: [id], onDelete: Cascade)
  @@id([taskId, dependsOnTaskId])
  @@index([dependsOnTaskId])
  @@schema("app")
  @@map("task_dependencies")
}

model ProgressReport {
  id String @id @default(cuid())
  projectId String @map("project_id")
  reportedAt DateTime @map("reported_at") @db.Timestamptz(6)
  summary String
  completionPercent Int @map("completion_percent")
  blockers String?
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@index([projectId, reportedAt])
  @@schema("app")
  @@map("progress_reports")
}

model ProjectHealthSnapshot {
  id String @id @default(cuid())
  projectId String @map("project_id")
  health ProjectHealth
  reasons Json
  calculatedAt DateTime @default(now()) @map("calculated_at") @db.Timestamptz(6)
  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@index([projectId, calculatedAt])
  @@schema("app")
  @@map("project_health_snapshots")
}
```

- [ ] **Step 3: 用 Prisma 生成 SQL，并检查迁移只创建新类型、表、索引和外键。**

Run: `cd backend && pnpm prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script`

Expected: SQL only contains `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX`, and foreign-key statements; never `DROP`.

- [ ] **Step 4: 将审阅后的 SQL 保存为迁移并验证空测试库可部署。**

```sql
CREATE TABLE "app"."projects" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "participant_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "phase" "app"."ProjectPhase" NOT NULL DEFAULT 'PLANNING',
  "status" "app"."ProjectStatus" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);
```

The committed migration must additionally contain all columns and relations defined in Step 2; generate it from Prisma instead of hand-writing identifiers.

Run: `cd backend && pnpm prisma:generate && pnpm prisma:migrate:deploy`

Expected: Prisma reports the new migration applied or already applied; no database is reset.

- [ ] **Step 5: 运行模型测试并提交。**

Run: `cd backend && pnpm test:unit -- project-execution-prisma.spec.ts && pnpm lint && pnpm build`

Expected: PASS.

```bash
git add backend/prisma backend/test/unit/modules/workbench
git commit -m "feat: add project execution data model"
```

### Task 2: 实现项目健康度和项目 REST API

**Files:**
- Create: `backend/src/modules/workbench/projects/application/project-health.service.ts`
- Create: `backend/src/modules/workbench/projects/application/projects.service.ts`
- Create: `backend/src/modules/workbench/projects/interface/http/projects.controller.ts`
- Create: `backend/src/modules/workbench/projects/interface/http/dto/create-project.dto.ts`
- Create: `backend/src/modules/workbench/projects/interface/http/dto/update-project.dto.ts`
- Create: `backend/src/modules/workbench/projects/projects.module.ts`
- Modify: `backend/src/modules/workbench/workbench.module.ts`
- Test: `backend/test/unit/modules/workbench/project-health.service.spec.ts`
- Test: `backend/test/integration/workbench-projects.spec.ts`

- [ ] **Step 1: 写健康度规则的失败测试。**

```ts
expect(service.calculate({ today, overdueCriticalTasks: 1, missedMilestones: 0 }))
  .toEqual({ health: 'RED', reasons: ['1 项关键任务逾期'] });
expect(service.calculate({ today, overdueCriticalTasks: 0, missedMilestones: 0, dueSoonMilestones: 1 }))
  .toEqual({ health: 'YELLOW', reasons: ['1 个关键里程碑临期'] });
expect(service.calculate({ today, overdueCriticalTasks: 0, missedMilestones: 0, dueSoonMilestones: 0 }))
  .toEqual({ health: 'GREEN', reasons: [] });
```

Run: `cd backend && pnpm test:unit -- project-health.service.spec.ts`

Expected: FAIL because `ProjectHealthService` does not exist.

- [ ] **Step 2: 实现纯函数健康度服务。**

```ts
calculate(input: ProjectHealthInput): ProjectHealthResult {
  if (input.overdueCriticalTasks > 0 || input.missedMilestones > 0) {
    return { health: 'RED', reasons: this.redReasons(input) };
  }
  if (input.dueSoonMilestones > 0 || input.overdueTasks > 0) {
    return { health: 'YELLOW', reasons: this.yellowReasons(input) };
  }
  return { health: 'GREEN', reasons: [] };
}
```

`redReasons` and `yellowReasons` must return Chinese, count-bearing strings in deterministic order: missed milestones, critical overdue tasks, general overdue tasks, due-soon milestones. The service must not query Prisma so it remains unit-testable.

- [ ] **Step 3: 写项目创建、分页、详情和归档的失败集成测试。**

```ts
const create = await request(app.getHttpServer()).post('/api/projects').send({ code: 'RD-001', name: '抗逆育种' });
expect(create.status).toBe(201);
expect(create.body.data).toMatchObject({ code: 'RD-001', name: '抗逆育种', status: 'DRAFT' });

const list = await request(app.getHttpServer()).get('/api/projects?page=1&pageSize=20&status=DRAFT');
expect(list.body.meta).toMatchObject({ page: 1, pageSize: 20, total: 1 });

await request(app.getHttpServer()).delete(`/api/projects/${create.body.data.id}`).expect(204);
expect((await request(app.getHttpServer()).get('/api/projects')).body.data).toHaveLength(0);
```

Run: `cd backend && pnpm test:integration -- workbench-projects.spec.ts`

Expected: FAIL with 404 because project routes do not exist.

- [ ] **Step 4: 实现 DTO、服务与控制器。**

```ts
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post() create(@Body() dto: CreateProjectDto) { return this.projects.create(dto); }
  @Get() list(@Query() query: ListProjectsDto) { return this.projects.list(query); }
  @Get(':id') get(@Param('id') id: string) { return this.projects.get(id); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateProjectDto) { return this.projects.update(id, dto); }
  @Delete(':id') @HttpCode(HttpStatus.NO_CONTENT) archive(@Param('id') id: string) { return this.projects.archive(id); }
}
```

`CreateProjectDto` requires trimmed `code` and `name`, accepts optional scalar profile fields, ISO date strings, enum values and `participantNames: string[]`. `ProjectsService.list` must use Prisma `skip/take`, cap page size at 100, exclude archived rows, and return `{ data, meta: { page, pageSize, total } }`. `get` must include non-archived milestones, tasks, reports and latest health snapshot. Missing active IDs return Nest `NotFoundException`; duplicate code returns `ConflictException` with a stable `PROJECT_CODE_EXISTS` error code through the project exception mapping.

- [ ] **Step 5: 复跑所有项目后端测试并提交。**

Run: `cd backend && pnpm test:unit -- project-health.service.spec.ts && pnpm test:integration -- workbench-projects.spec.ts && pnpm lint && pnpm build`

Expected: PASS.

```bash
git add backend/src/modules/workbench backend/test/unit/modules/workbench backend/test/integration/workbench-projects.spec.ts
git commit -m "feat: add project management API"
```

### Task 3: 实现里程碑、任务、依赖和进展 REST API

**Files:**
- Create: `backend/src/modules/workbench/tasks/application/tasks.service.ts`
- Create: `backend/src/modules/workbench/tasks/interface/http/tasks.controller.ts`
- Create: `backend/src/modules/workbench/tasks/interface/http/dto/create-task.dto.ts`
- Create: `backend/src/modules/workbench/tasks/interface/http/dto/update-task.dto.ts`
- Create: `backend/src/modules/workbench/tasks/tasks.module.ts`
- Modify: `backend/src/modules/workbench/projects/application/projects.service.ts`
- Modify: `backend/src/modules/workbench/projects/interface/http/projects.controller.ts`
- Test: `backend/test/integration/workbench-tasks.spec.ts`

- [ ] **Step 1: 写任务依赖阻止完成、父任务和进展汇报的失败集成测试。**

```ts
const blocker = await createTask({ projectId, title: '完成试验', priority: 'CRITICAL' });
const task = await createTask({ projectId, title: '整理数据', dependencyIds: [blocker.id] });
await request(server).patch(`/api/tasks/${task.id}`).send({ status: 'DONE' }).expect(422);
await request(server).patch(`/api/tasks/${blocker.id}`).send({ status: 'DONE' }).expect(200);
await request(server).patch(`/api/tasks/${task.id}`).send({ status: 'DONE' }).expect(200);
await request(server).post(`/api/projects/${projectId}/progress-reports`).send({ reportedAt: '2026-07-18T00:00:00.000Z', summary: '完成田间试验', completionPercent: 60 }).expect(201);
```

Run: `cd backend && pnpm test:integration -- workbench-tasks.spec.ts`

Expected: FAIL because the task and progress routes are absent.

- [ ] **Step 2: 实现任务 API。**

```ts
@Controller('tasks')
export class TasksController {
  @Post() create(@Body() dto: CreateTaskDto) { return this.tasks.create(dto); }
  @Get() list(@Query() query: ListTasksDto) { return this.tasks.list(query); }
  @Get(':id') get(@Param('id') id: string) { return this.tasks.get(id); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateTaskDto) { return this.tasks.update(id, dto); }
  @Delete(':id') @HttpCode(HttpStatus.NO_CONTENT) archive(@Param('id') id: string) { return this.tasks.archive(id); }
}
```

`CreateTaskDto` requires a trimmed title; accepts optional `projectId`, `milestoneId`, `parentId`, `dependencyIds`, source fields and ISO due date. Service validation must reject self-dependency, duplicate dependency IDs, nonexistent active references, a milestone whose `projectId` differs from the task `projectId` (and a milestone on a task without `projectId`), and a DONE transition when any dependency is not DONE. On a DONE transition set `completedAt`; clear it for every non-DONE status. List filters support `projectId`, `status`, `assigneeName`, `dueBefore`, `overdue`, `page`, and `pageSize`.

- [ ] **Step 3: 实现嵌套路由。**

```ts
@Post(':id/milestones')
createMilestone(@Param('id') projectId: string, @Body() dto: CreateMilestoneDto) {
  return this.projects.createMilestone(projectId, dto);
}

@Post(':id/progress-reports')
createProgressReport(@Param('id') projectId: string, @Body() dto: CreateProgressReportDto) {
  return this.projects.createProgressReport(projectId, dto);
}
```

Milestone create/update accepts `name`, `plannedAt`, `actualAt`, `ownerName`, `isCritical`, and `status`; report requires `reportedAt`, `summary`, and integer `completionPercent` 0–100. Both confirm that the project exists and is not archived. Recompute and persist `ProjectHealthSnapshot` after task/milestone writes.

- [ ] **Step 4: 运行任务 API 的完整验证并提交。**

Run: `cd backend && pnpm test:integration -- workbench-projects.spec.ts workbench-tasks.spec.ts && pnpm lint && pnpm build`

Expected: PASS.

```bash
git add backend/src/modules/workbench backend/test/integration/workbench-tasks.spec.ts
git commit -m "feat: add milestones tasks and progress API"
```

### Task 4: 实现真实首页驾驶舱 API

**Files:**
- Create: `backend/src/modules/workbench/dashboard/application/dashboard.service.ts`
- Create: `backend/src/modules/workbench/dashboard/interface/http/dashboard.controller.ts`
- Create: `backend/src/modules/workbench/dashboard/dashboard.module.ts`
- Modify: `backend/src/modules/workbench/workbench.module.ts`
- Test: `backend/test/integration/workbench-dashboard.spec.ts`

- [ ] **Step 1: 写驾驶舱时间窗口的失败测试。**

```ts
const response = await request(server).get('/api/dashboard');
expect(response.body.data).toMatchObject({
  todayActions: expect.arrayContaining([expect.objectContaining({ title: '今天完成记录' })]),
  overdueTasks: [expect.objectContaining({ title: '昨天到期任务' })],
  dueSoonMilestones: [expect.objectContaining({ name: '本周节点' })],
  healthDistribution: { GREEN: 1, YELLOW: 0, RED: 1 },
});
```

Run: `cd backend && pnpm test:integration -- workbench-dashboard.spec.ts`

Expected: FAIL with 404.

- [ ] **Step 2: 实现只读聚合服务和控制器。**

```ts
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}
  @Get() get() { return this.dashboard.get(new Date()); }
}
```

`DashboardService.get(now)` must query only non-archived projects/tasks, use `startOfLocalDay` and `endOfLocalDay` calculated from the local process timezone, and return exactly: `todayActions`, `overdueTasks`, `dueSoonMilestones` (next seven days), `healthDistribution`, `projectsNeedingAttention`, and `recentProgressReports`. Empty collections must be empty arrays and each health bucket must exist with numeric zero.

- [ ] **Step 3: 验证并提交。**

Run: `cd backend && pnpm test:integration -- workbench-dashboard.spec.ts && pnpm lint && pnpm build`

Expected: PASS.

```bash
git add backend/src/modules/workbench/dashboard backend/src/modules/workbench/workbench.module.ts backend/test/integration/workbench-dashboard.spec.ts
git commit -m "feat: add project dashboard API"
```

### Task 5: 建立前端 HTTP 契约和项目/任务查询层

**Files:**
- Create: `frontend/src/lib/http.ts`
- Create: `frontend/src/modules/workbench/types.ts`
- Create: `frontend/src/modules/workbench/api/projects.ts`
- Create: `frontend/src/modules/workbench/api/tasks.ts`
- Create: `frontend/src/modules/workbench/api/dashboard.ts`
- Modify: `frontend/.env.example`
- Test: `frontend/src/modules/workbench/api/__tests__/projects.test.ts`

- [ ] **Step 1: 写 API 响应解包与错误传播的失败测试。**

```ts
vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { id: 'p1' } }), { status: 200 })));
await expect(getProject('p1')).resolves.toEqual({ id: 'p1' });

vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, error: { code: 'PROJECT_NOT_FOUND', message: '不存在' } }), { status: 404 })));
await expect(getProject('missing')).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND', status: 404 });
```

Run: `cd frontend && pnpm test -- projects.test.ts`

Expected: FAIL because the workbench API modules do not exist.

- [ ] **Step 2: 实现最小、类型化的 API client。**

```ts
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers },
  });
  const payload = await response.json() as ApiEnvelope<T>;
  if (!response.ok || !payload.success) throw new ApiError(response.status, payload.error);
  return payload.data;
}
```

Read `VITE_API_BASE_URL`; default to `http://127.0.0.1:3000/api` only in development. Define client-facing project/task/dashboard types separately from Prisma names. Export `listProjects`, `getProject`, `createProject`, `updateProject`, `archiveProject`, `listTasks`, `createTask`, `updateTask`, and `getDashboard`; each has a fixed resource path and JSON request body.

- [ ] **Step 3: 运行前端单元验证并提交。**

Run: `cd frontend && pnpm test -- projects.test.ts && pnpm lint && pnpm typecheck`

Expected: PASS.

```bash
git add frontend/src/lib/http.ts frontend/src/modules/workbench frontend/.env.example
git commit -m "feat: add workbench API client"
```

### Task 6: 实现项目、任务和驾驶舱页面

**Files:**
- Create: `frontend/src/modules/workbench/components/ProjectForm.tsx`
- Create: `frontend/src/modules/workbench/components/TaskForm.tsx`
- Create: `frontend/src/modules/workbench/components/HealthBadge.tsx`
- Create: `frontend/src/modules/workbench/components/TaskBoard.tsx`
- Create: `frontend/src/pages/ProjectsPage.tsx`
- Create: `frontend/src/pages/ProjectDetailPage.tsx`
- Create: `frontend/src/pages/TasksPage.tsx`
- Modify: `frontend/src/pages/WorkbenchHome.tsx`
- Modify: `frontend/src/constants/routes.ts`
- Modify: `frontend/src/router/routes.ts`
- Test: `frontend/src/pages/__tests__/ProjectsPage.test.tsx`
- Test: `frontend/src/pages/__tests__/WorkbenchHome.test.tsx`

- [ ] **Step 1: 写真实数据、加载态和空态的失败组件测试。**

```tsx
render(<ProjectsPage />);
expect(await screen.findByRole('heading', { name: '项目' })).toBeVisible();
expect(await screen.findByText('抗逆育种')).toBeVisible();
await userEvent.click(screen.getByRole('button', { name: '新建项目' }));
await userEvent.type(screen.getByLabelText('项目编号'), 'RD-002');
await userEvent.type(screen.getByLabelText('项目名称'), '耐盐材料筛选');
await userEvent.click(screen.getByRole('button', { name: '保存项目' }));
expect(createProject).toHaveBeenCalledWith(expect.objectContaining({ code: 'RD-002' }));
```

Run: `cd frontend && pnpm test -- ProjectsPage.test.tsx WorkbenchHome.test.tsx`

Expected: FAIL because the routes and components do not exist.

- [ ] **Step 2: 新增路由和页面状态。**

```ts
export const ROUTES = {
  HOME: '/',
  PROJECTS: '/projects',
  PROJECT_DETAIL: '/projects/:projectId',
  TASKS: '/tasks',
  SETTINGS: '/settings',
} as const;
```

`ProjectsPage` renders filterable table cards from `useQuery`, a dialog form from `ProjectForm`, and links each row to the detail route. `ProjectDetailPage` renders profile, milestone timeline, recent reports and project-scoped task board. `TasksPage` renders a three-column TODO/IN_PROGRESS/BLOCKED/DONE board with accessible status headings and a task dialog. Every mutation invalidates the affected list/detail/dashboard query keys, shows a Sonner success/error message, disables its submit button while pending, and leaves a readable empty state when there is no data.

- [ ] **Step 3: 将首页占位替换为驾驶舱。**

```tsx
const { data, isLoading, isError } = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard });
if (isLoading) return <DashboardSkeleton />;
if (isError) return <InlineError title="无法读取本地工作台" onRetry={() => void refetch()} />;
return <Dashboard data={data} />;
```

Show four labelled sections: `今日行动`、`逾期任务`、`临近里程碑`、`项目健康度`. `HealthBadge` must render text as well as color (`正常`/`关注`/`风险`) so the dashboard does not rely on color alone. Retain the existing “科研档案台” typography and semantic theme variables; do not introduce hard-coded palette overrides or fake counts.

- [ ] **Step 4: 运行前端质量门禁并提交。**

Run: `cd frontend && pnpm test && pnpm lint && pnpm typecheck && pnpm build`

Expected: PASS.

```bash
git add frontend/src/pages frontend/src/modules/workbench frontend/src/router/routes.ts frontend/src/constants/routes.ts
git commit -m "feat: add project execution workspace pages"
```

### Task 7: 端到端联调、可访问性与文档

**Files:**
- Create: `frontend/e2e/workbench-project-execution.spec.ts`
- Modify: `README.md`
- Modify: `task_plan.md`
- Modify: `progress.md`

- [ ] **Step 1: 写 P0 用户路径的 Playwright 测试。**

```ts
test('manager creates a project and sees it on the dashboard', async ({ page }) => {
  await page.goto('/#/projects');
  await page.getByRole('button', { name: '新建项目' }).click();
  await page.getByLabel('项目编号').fill(`E2E-${Date.now()}`);
  await page.getByLabel('项目名称').fill('端到端项目');
  await page.getByRole('button', { name: '保存项目' }).click();
  await expect(page.getByText('端到端项目')).toBeVisible();
  await page.getByRole('link', { name: '首页' }).click();
  await expect(page.getByRole('heading', { name: '研发主管工作台' })).toBeVisible();
});
```

- [ ] **Step 2: 启动后端和前端，运行真实端到端测试。**

Run: `cd backend && pnpm prisma:migrate:deploy && pnpm start:dev` (terminal A); `cd frontend && VITE_API_BASE_URL=http://127.0.0.1:3000/api pnpm dev` (terminal B); `cd frontend && pnpm test:e2e -- workbench-project-execution.spec.ts`

Expected: PASS; test uses only the dedicated test database and creates no production records.

- [ ] **Step 3: 记录运行方法和已完成范围。**

Add to root README the separate commands for `backend` and `frontend`, required `VITE_API_BASE_URL`, and P0 capabilities. Mark Phase 4 / Project Execution complete in `task_plan.md` only after every command in Step 4 passes.

- [ ] **Step 4: 执行最终门禁并提交。**

Run: `cd backend && pnpm prisma:generate && pnpm test && pnpm lint && pnpm build && pnpm test:e2e`; `cd frontend && pnpm test && pnpm lint && pnpm typecheck && pnpm build && pnpm test:e2e`

Expected: all commands PASS and `git diff --check` has no output.

```bash
git add frontend/e2e README.md task_plan.md progress.md
git commit -m "test: verify project execution workflow"
```

## 后续独立计划队列

1. `application-case-p0`：申报认定、可配置流程、材料版本、证据、补正和提交。
2. `management-loop-p0`：风险、问题、决策、合作方、沟通、会议和行动项转任务。
3. `intelligence-p0`：主题、来源、手工/定时采集、简报和转任务/风险/会议。
4. `data-governance-p0`：附件、通知、全局搜索、CSV/Excel、备份恢复和审计。
5. `p1-operations`：非项目研发、资源负荷、报表、自动周报与多格式导出。
6. `p2-extensions`：AI、外部系统集成、局域网多人和角色权限。
7. `electron-shell`：在上述 API 与页面稳定后加入 Electron main/preload、Utility Process、数据库首次启动诊断和打包验收。

## 自检

- 本计划只覆盖“项目执行”这个可独立验收子项目；申报、协作、情报、数据治理、P1/P2 和 Electron 明确排入后续独立计划，避免一次大爆炸。
- 模型、DTO、端点与 UI 使用同一名称：`Project`、`Milestone`、`WorkTask`、`ProgressReport`，端点用 `/projects`、`/tasks`、`/dashboard`。
- 所有数据库步骤禁止 `db push`、`migrate reset`、`DROP DATABASE` 和 `DROP ROLE`，并给出生成与部署命令。
