# 项目空间与我的工作 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将项目详情和个人任务从列表页面升级为本地飞书式项目空间、收件箱和日历提醒闭环。

**Architecture:** 项目空间复用已存在的 Project、WorkTask、Milestone、ProgressReport、Risk、Issue 与 Meeting 数据，以 projectId 为唯一上下文。新建 `TaskReminder` 和 `TaskLater` 只扩展本地个人工作流；后端提供项目聚合、我的工作和日历查询 API，前端以 React Query 保持项目页签与工作台缓存一致。

**Tech Stack:** NestJS、Prisma/PostgreSQL、React 19、React Router 7、TanStack Query、shadcn/ui、Vitest/Jest/Playwright。

---

## 文件结构

| 文件 | 责任 |
| --- | --- |
| `backend/prisma/schema.prisma` + 新迁移 | `TaskReminder`、`TaskLater` 及日期/状态索引 |
| `backend/src/modules/workbench/workspace/*` | 项目聚合、我的工作、日历与提醒的 DTO、service、controller、tests |
| `frontend/src/modules/workbench/api/workspace.ts` | workspace/my-work/calendar/reminder HTTP 合同 |
| `frontend/src/modules/workbench/types.ts` | 共享响应类型 |
| `frontend/src/pages/ProjectWorkspacePage.tsx` | 项目页签和真实 projectId 上下文 |
| `frontend/src/pages/MyWorkPage.tsx` | 收件箱、今日、本周、日历、稍后处理 |
| `frontend/src/pages/ProjectSpacesPage.tsx` | 项目空间卡片入口 |
| `frontend/src/pages/__tests__/*Workspace*.test.tsx` | 页签、加载、空、错误、提醒与日历行为 |

### Task 1: 建立本地提醒与稍后处理的数据模型和迁移

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260718060000_project_space_my_work/migration.sql`
- Create: `backend/test/unit/workspace-schema.contract.spec.ts`

- [ ] **Step 1: 写失败的 schema 合同测试**

```ts
expect(schema).toContain('model TaskReminder')
expect(schema).toContain('taskId String @map("task_id")')
expect(schema).toContain('model TaskLater')
expect(schema).toContain('@@unique([taskId])')
```

- [ ] **Step 2: 运行 RED**

Run: `pnpm test:unit -- workspace-schema.contract.spec.ts`

Expected: FAIL，因为两个模型尚不存在。

- [ ] **Step 3: 添加最小模型与前向迁移**

`TaskReminder` 字段为 `id`、`taskId`、`remindAt`、`dismissedAt`、`createdAt`、`updatedAt`；`taskId` 唯一并以 `onDelete: Cascade` 关联 `WorkTask`，索引 `[remindAt, dismissedAt]`。`TaskLater` 字段为 `id`、`taskId`、`deferredUntil`、`createdAt`、`updatedAt`；`taskId` 唯一并以 `onDelete: Cascade` 关联 `WorkTask`，索引 `[deferredUntil]`。在 `WorkTask` 增加可选 `reminder` 和 `later` 关系。

- [ ] **Step 4: 生成客户端并运行 GREEN**

Run: `pnpm prisma:generate && pnpm test:unit -- workspace-schema.contract.spec.ts`

Expected: PASS。

- [ ] **Step 5: 提交模型**

```bash
git add backend/prisma backend/test/unit/workspace-schema.contract.spec.ts
git commit -m "feat: add local task reminder models"
```

### Task 2: 实现项目聚合、我的工作、日历和提醒 API

**Files:**
- Create: `backend/src/modules/workbench/workspace/application/workspace.service.ts`
- Create: `backend/src/modules/workbench/workspace/interface/http/workspace.controller.ts`
- Create: `backend/src/modules/workbench/workspace/interface/http/dto/*.ts`
- Create: `backend/src/modules/workbench/workspace/workspace.module.ts`
- Modify: `backend/src/modules/workbench/workbench.module.ts`
- Modify: `backend/src/shared/errors/error-codes.ts`
- Create: `backend/test/unit/workspace.service.spec.ts`
- Create: `backend/test/integration/workspace.http.spec.ts`

- [ ] **Step 1: 写服务与 HTTP RED 测试**

```ts
await expect(service.getProjectWorkspace('project-1')).resolves.toMatchObject({
  project: { id: 'project-1' }, tasks: expect.any(Array), milestones: expect.any(Array),
  progressReports: expect.any(Array), risks: expect.any(Array), issues: expect.any(Array), meetings: expect.any(Array),
})
await request(app.getHttpServer()).get('/api/my-work?view=today').expect(200)
await request(app.getHttpServer()).post('/api/tasks/task-1/reminder').send({ remindAt }).expect(201)
```

- [ ] **Step 2: 运行 RED**

Run: `pnpm test:unit -- workspace.service.spec.ts && pnpm test:integration -- workspace.http.spec.ts`

Expected: FAIL，因为 module/controller/service 与路由尚不存在。

- [ ] **Step 3: 实现有界 API**

实现以下接口：

```text
GET  /projects/:projectId/workspace
GET  /my-work?view=inbox|today|week|later
GET  /calendar?from=<ISO>&to=<ISO>
PUT  /tasks/:taskId/reminder { remindAt }
DELETE /tasks/:taskId/reminder
PUT  /tasks/:taskId/later { deferredUntil }
DELETE /tasks/:taskId/later
```

`getProjectWorkspace` 必须一次读取未归档 project、milestones、tasks、progressReports、risks、issues、meetings 和最新 health；找不到项目返回既有结构化 404。`my-work` 只返回未归档且未完成任务，`later` 排除 `deferredUntil > now` 的普通视图，`today/week` 使用服务器本机时区的日界。calendar 返回 `{ tasks, meetings, reminders }`，范围要求 `from <= to` 且最多 93 天，非法范围 400。写入 reminder/later 前必须验证未归档 task 存在；一个 task 更新为 DONE 时自动清除未完成 reminder/later。

- [ ] **Step 4: 运行 GREEN 与数据库迁移**

Run: `pnpm prisma:generate && pnpm prisma:migrate:deploy && pnpm test:unit -- workspace.service.spec.ts && pnpm test:integration -- workspace.http.spec.ts && pnpm build`

Expected: PASS，迁移只新增表和索引。

- [ ] **Step 5: 提交后端闭环**

```bash
git add backend/src/modules/workbench/workspace backend/src/modules/workbench/workbench.module.ts backend/src/shared/errors/error-codes.ts backend/test
git commit -m "feat: add project workspace and my work APIs"
```

### Task 3: 建立前端 API 合同与项目空间页签

**Files:**
- Create: `frontend/src/modules/workbench/api/workspace.ts`
- Modify: `frontend/src/modules/workbench/types.ts`
- Create: `frontend/src/pages/ProjectWorkspacePage.tsx`
- Create: `frontend/src/pages/__tests__/ProjectWorkspacePage.test.tsx`
- Modify: `frontend/src/router/routes.ts`

- [ ] **Step 1: 写项目空间 RED 测试**

```tsx
renderAt('/spaces/projects/project-1/tasks')
expect(await screen.findByRole('heading', { name: '新材料研发' })).toBeInTheDocument()
expect(screen.getByRole('tab', { name: '任务' })).toHaveAttribute('aria-selected', 'true')
expect(screen.getByText('完成实验记录')).toBeInTheDocument()
```

另写 `getProjectWorkspace` reject 时“无法读取该项目空间”与重试按钮，以及资料页签空状态不能调用附件 API。

- [ ] **Step 2: 运行 RED**

Run: `pnpm vitest run src/pages/__tests__/ProjectWorkspacePage.test.tsx`

Expected: FAIL，因为当前 detail route 仍渲染 `ProjectsPage`。

- [ ] **Step 3: 实现页面和合同**

定义 `ProjectWorkspaceData`、`MyWorkData`、`CalendarData`、`TaskReminder` 和 `TaskLater` 类型；API 使用 `request()`，不绕过统一错误包。`ProjectWorkspacePage` 用 `useParams` 获取 projectId/section，支持 `overview`、`tasks`、`progress`、`governance`、`meetings`、`materials`。概要显示真实健康、里程碑、临近任务和进展；任务/进展/风险问题/会议显示聚合数据；资料页签显示“附件中心将在阶段三接入”，且不请求不存在 API。无效 section replace 到 overview。

- [ ] **Step 4: 运行 GREEN**

Run: `pnpm vitest run src/pages/__tests__/ProjectWorkspacePage.test.tsx && pnpm typecheck`

Expected: PASS。

- [ ] **Step 5: 提交项目空间前端**

```bash
git add frontend/src/modules/workbench/api/workspace.ts frontend/src/modules/workbench/types.ts frontend/src/pages/ProjectWorkspacePage.tsx frontend/src/pages/__tests__/ProjectWorkspacePage.test.tsx frontend/src/router/routes.ts
git commit -m "feat: add project detail workspace"
```

### Task 4: 实现我的工作、日历、提醒和稍后处理 UI

**Files:**
- Create: `frontend/src/pages/MyWorkPage.tsx`
- Create: `frontend/src/pages/__tests__/MyWorkPage.test.tsx`
- Create: `frontend/src/modules/workbench/components/MyWorkCalendar.tsx`
- Create: `frontend/src/modules/workbench/components/__tests__/MyWorkCalendar.test.tsx`
- Modify: `frontend/src/router/routes.ts`

- [ ] **Step 1: 写 My Work RED 测试**

```tsx
render(<MyWorkPage />)
await user.click(await screen.findByRole('tab', { name: '本周' }))
expect(listMyWork).toHaveBeenLastCalledWith('week')
await user.click(screen.getByRole('button', { name: '稍后处理：完成实验记录' }))
expect(setTaskLater).toHaveBeenCalledWith('task-1', expect.objectContaining({ deferredUntil: expect.any(String) }))
```

增加日历测试：任务截止、会议与 reminder 显示在给定日期；空日历、API 错误和 reminder 删除均有可见反馈。

- [ ] **Step 2: 运行 RED**

Run: `pnpm vitest run src/pages/__tests__/MyWorkPage.test.tsx src/modules/workbench/components/__tests__/MyWorkCalendar.test.tsx`

Expected: FAIL，因为页面、日历和 API 交互不存在。

- [ ] **Step 3: 实现个人工作流**

`MyWorkPage` 提供收件箱、今日、本周、日历、稍后处理五个语义 tabs。任务卡可进入 `ROUTES.projectWorkspace(task.projectId)`（有 projectId 时）、完成、设提醒、移入稍后和恢复；mutation 成功后同时 invalidate `my-work`、`calendar`、`tasks`、`dashboard`、`project-workspace`。`MyWorkCalendar` 接收真实 `CalendarData`，以月格和可访问日期按钮呈现，不实现拖放；日格详情列出任务、会议、提醒。

- [ ] **Step 4: 运行 GREEN 和前端门禁**

Run: `pnpm vitest run src/pages/__tests__/MyWorkPage.test.tsx src/modules/workbench/components/__tests__/MyWorkCalendar.test.tsx && pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Expected: PASS。

- [ ] **Step 5: 提交我的工作 UI**

```bash
git add frontend/src/pages/MyWorkPage.tsx frontend/src/pages/__tests__/MyWorkPage.test.tsx frontend/src/modules/workbench/components/MyWorkCalendar.tsx frontend/src/modules/workbench/components/__tests__/MyWorkCalendar.test.tsx frontend/src/router/routes.ts
git commit -m "feat: add my work calendar and reminders"
```

### Task 5: 项目空间入口、端到端验证与状态更新

**Files:**
- Modify: `frontend/src/pages/ProjectSpacesPage.tsx`
- Create: `frontend/e2e/project-space-my-work.spec.ts`
- Modify: `task_plan.md`
- Modify: `progress.md`

- [ ] **Step 1: 写入口与 e2e RED 测试**

```ts
test('opens a project workspace from project spaces', async ({ page }) => {
  await page.goto('/#/spaces/projects')
  await page.getByRole('link', { name: /打开项目空间/ }).first().click()
  await expect(page.getByRole('tab', { name: '概览' })).toBeVisible()
})
```

使用 API mock 或测试数据库 fixture；不得依赖开发机已有记录。

- [ ] **Step 2: 运行 RED**

Run: `pnpm test:e2e -- project-space-my-work.spec.ts`

Expected: FAIL，因为项目空间列表还未提供语义入口或目标详情页签。

- [ ] **Step 3: 实现入口和验证**

项目卡片/列表行以 `Link` 提供 `aria-label="打开项目空间：<名称>"`，目标为 `ROUTES.projectWorkspace(project.id)`；保留现有筛选和新建。e2e 同时验证 legacy `/#/projects` replace 到项目空间、我的工作页面可打开、planned 资料页签不显示伪数据。

- [ ] **Step 4: 运行全栈质量门禁**

Run: `cd backend && pnpm prisma:generate && pnpm test:unit && pnpm test:integration && pnpm build`

Run: `cd frontend && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`

Expected: 全部 exit 0；记录现有无关 warning，不将其误报为失败。

- [ ] **Step 5: 更新状态并提交**

```bash
git add frontend/src/pages/ProjectSpacesPage.tsx frontend/e2e/project-space-my-work.spec.ts task_plan.md progress.md
git commit -m "test: verify project space and my work flow"
```

## 计划自检

- **规格覆盖：** Task 1/2 完成 reminder/later 和真实项目/个人时间 API；Task 3 完成项目六页签；Task 4 完成收件箱、今日、本周、日历、稍后处理；Task 5 完成入口、兼容路由和全栈验证。
- **范围限制：** 资料附件、知识页、全局搜索、情报、导入导出、备份、资源负荷与 Electron 不在本阶段实现；项目资料页签只说明其阶段三入口，绝不伪造数据。
- **数据安全：** 迁移只前向新增；每个 reminder/later 只属于一个未归档任务；时间范围与 projectId 都经后端验证。
