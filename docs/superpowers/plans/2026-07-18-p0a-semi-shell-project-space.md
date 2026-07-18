# P0-A Semi 工作台与项目空间 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有后台式导航重构为可直接使用的飞书式本地工作台壳，并交付真实的项目列表与项目详情空间。

**Architecture:** 保持 React Router、TanStack Query 和现有 Nest 项目 API；Semi Design 统一应用级组件与视觉 token。项目列表和项目详情分别作为独立页面，详情页通过项目 ID 加载已有项目聚合数据，并在固定项目上下文内组织页签。

**Tech Stack:** React 19、TypeScript、Vite、React Router、Semi Design、TanStack Query、Vitest、Testing Library、NestJS/Prisma existing APIs

---

### Task 1: 接入 Semi Design 与工作台视觉 token

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/pnpm-lock.yaml`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/index.css`
- Create: `frontend/src/styles/workspace-tokens.css`
- Test: `frontend/src/lib/__tests__/semiFoundation.test.ts`

- [ ] **Step 1: 写失败契约测试**

```ts
expect(packageJson.dependencies['@douyinfe/semi-ui']).toBeDefined()
expect(mainSource).toContain("@douyinfe/semi-ui/dist/css/semi.min.css")
expect(tokenSource).toContain('--workspace-sidebar-width')
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `cd frontend && pnpm test -- src/lib/__tests__/semiFoundation.test.ts`

Expected: FAIL，Semi 依赖、样式入口和工作台 token 尚不存在。

- [ ] **Step 3: 安装 Semi 并实现视觉基础**

Run: `cd frontend && pnpm add @douyinfe/semi-ui @douyinfe/semi-icons`

在 `main.tsx` 导入 Semi 样式和 `workspace-tokens.css`；token 至少定义侧栏宽度、顶栏高度、应用背景、浮层阴影、品牌蓝、边框、主/次文字色和紧凑圆角。

- [ ] **Step 4: 运行 GREEN 与静态检查**

Run: `cd frontend && pnpm test -- src/lib/__tests__/semiFoundation.test.ts && pnpm typecheck`

Expected: focused tests PASS，TypeScript exit 0。

- [ ] **Step 5: 提交**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/src/main.tsx frontend/src/index.css frontend/src/styles/workspace-tokens.css frontend/src/lib/__tests__/semiFoundation.test.ts
git commit -m "feat: add semi workspace design foundation"
```

### Task 2: 重构七入口路由和左侧导航

**Files:**
- Modify: `frontend/src/constants/routes.ts`
- Modify: `frontend/src/router/routes.ts`
- Modify: `frontend/src/router/__tests__/routes.test.ts`
- Modify: `frontend/src/components/AppShell/WorkspaceNavigation.tsx`
- Modify: `frontend/src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx`

- [ ] **Step 1: 写失败测试锁定七入口**

```ts
expect(primaryNavigation.map((item) => item.title)).toEqual([
  '工作台', '我的工作', '项目', '文档与知识库', '多维表格', '日历', '搜索'
])
```

导航测试要求使用 Semi 图标、当前入口 `aria-current=page`，且设置从顶部操作进入而不占主入口。

- [ ] **Step 2: 运行测试确认 RED**

Run: `cd frontend && pnpm test -- src/router/__tests__/routes.test.ts src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx`

Expected: FAIL，当前仍有业务库、会议资料、自动化数据和设置等后台式入口。

- [ ] **Step 3: 实现七入口路由注册表与导航**

保留旧 URL 为 redirect；新增 `/docs`、`/base`、`/calendar`、`/search`。导航图标用 `@douyinfe/semi-icons`，标签只显示真实入口，不显示“规划中”角标。

- [ ] **Step 4: 运行 GREEN**

Run: `cd frontend && pnpm test -- src/router/__tests__/routes.test.ts src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx && pnpm typecheck`

Expected: tests PASS，TypeScript exit 0。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/constants/routes.ts frontend/src/router/routes.ts frontend/src/router/__tests__/routes.test.ts frontend/src/components/AppShell/WorkspaceNavigation.tsx frontend/src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx
git commit -m "feat: align workspace navigation with core apps"
```

### Task 3: 飞书式全局顶栏和应用壳

**Files:**
- Modify: `frontend/src/components/AppShell/AppShell.tsx`
- Modify: `frontend/src/components/AppShell/AppShell.less`
- Modify: `frontend/src/components/AppShell/WorkspaceHeader.tsx`
- Modify: `frontend/src/components/AppShell/__tests__/AppShell.test.tsx`
- Modify: `frontend/src/components/AppShell/__tests__/WorkspaceHeader.test.tsx`

- [ ] **Step 1: 写失败交互测试**

测试顶栏包含搜索框、全局新建、通知、最近访问与设置按钮；主内容区保持唯一 `main` landmark；项目详情路径仍正确匹配项目入口。

- [ ] **Step 2: 运行测试确认 RED**

Run: `cd frontend && pnpm test -- src/components/AppShell/__tests__/AppShell.test.tsx src/components/AppShell/__tests__/WorkspaceHeader.test.tsx`

Expected: FAIL，现有顶栏没有完整全局操作。

- [ ] **Step 3: 使用 Semi 组件实现应用壳**

顶栏用 `Input`、`Button`、`Dropdown`、`Badge`；内容区改为浅灰应用背景上的白色工作表面。导航保持 208px 紧凑宽度，响应式降为 64px 图标栏。

- [ ] **Step 4: 运行 GREEN**

Run: `cd frontend && pnpm test -- src/components/AppShell/__tests__/AppShell.test.tsx src/components/AppShell/__tests__/WorkspaceHeader.test.tsx && pnpm typecheck`

Expected: tests PASS，TypeScript exit 0。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/AppShell
git commit -m "feat: build feishu-style workspace shell"
```

### Task 4: 重构项目列表为真实工作入口

**Files:**
- Modify: `frontend/src/pages/ProjectsPage.tsx`
- Create: `frontend/src/pages/ProjectsPage.less`
- Modify: `frontend/src/pages/__tests__/ProjectsPage.test.tsx`

- [ ] **Step 1: 写失败页面测试**

测试项目页包含搜索、状态筛选、新建项目、最近访问/全部项目视图和可打开的项目卡片或紧凑表格；加载、错误、空状态均保留。

- [ ] **Step 2: 运行测试确认 RED**

Run: `cd frontend && pnpm test -- src/pages/__tests__/ProjectsPage.test.tsx`

Expected: FAIL，当前页面缺少视图切换和飞书式布局。

- [ ] **Step 3: 使用 Semi Design 实现**

用 `Button`、`Input`、`Select`、`Table`、`Modal`、`Empty`、`Skeleton` 重构；继续调用现有 `listProjects` 和 `ProjectForm`，项目名称链接进入 `/spaces/projects/:projectId/overview`。

- [ ] **Step 4: 运行 GREEN**

Run: `cd frontend && pnpm test -- src/pages/__tests__/ProjectsPage.test.tsx && pnpm typecheck`

Expected: tests PASS，TypeScript exit 0。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/pages/ProjectsPage.tsx frontend/src/pages/ProjectsPage.less frontend/src/pages/__tests__/ProjectsPage.test.tsx
git commit -m "feat: redesign project directory"
```

### Task 5: 交付真实项目详情空间

**Files:**
- Create: `frontend/src/pages/ProjectWorkspacePage.tsx`
- Create: `frontend/src/pages/ProjectWorkspacePage.less`
- Create: `frontend/src/pages/__tests__/ProjectWorkspacePage.test.tsx`
- Modify: `frontend/src/router/routes.ts`
- Modify: `frontend/src/modules/workbench/api/projects.ts`
- Modify: `frontend/src/modules/workbench/types.ts`

- [ ] **Step 1: 写失败页面测试**

用 API mock 渲染项目详情，断言固定上下文及 `概览、工作项、进展、风险与问题、会议、文档与资料` 六个页签；切换页签更新 URL；错误态可重试。

- [ ] **Step 2: 运行测试确认 RED**

Run: `cd frontend && pnpm test -- src/pages/__tests__/ProjectWorkspacePage.test.tsx`

Expected: FAIL，详情页面不存在且详情路由仍复用项目列表。

- [ ] **Step 3: 实现项目详情空间**

使用已有 `GET /projects/:id` 聚合数据渲染目标、状态、健康度、里程碑、临近任务、最近进展；六页签先接入已有真实项目数据和真实入口，未有数据模型的资料页显示明确的新建动作而不是假数据。

- [ ] **Step 4: 运行 GREEN**

Run: `cd frontend && pnpm test -- src/pages/__tests__/ProjectWorkspacePage.test.tsx src/router/__tests__/routes.test.ts && pnpm typecheck`

Expected: tests PASS，TypeScript exit 0。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/pages/ProjectWorkspacePage.tsx frontend/src/pages/ProjectWorkspacePage.less frontend/src/pages/__tests__/ProjectWorkspacePage.test.tsx frontend/src/router/routes.ts frontend/src/modules/workbench/api/projects.ts frontend/src/modules/workbench/types.ts
git commit -m "feat: add real project workspace"
```

### Task 6: 浏览器验收与全量质量门禁

**Files:**
- Modify only if verification exposes defects.

- [ ] **Step 1: 运行前端完整门禁**

Run: `cd frontend && pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Expected: 全部 exit 0。

- [ ] **Step 2: 启动真实页面并检查**

Run: `cd frontend && pnpm dev --host 127.0.0.1 --port 4312`

浏览器检查 `/`、`/spaces/projects` 和任意真实项目详情；确认没有水平溢出、遮挡、无对比文字或死按钮。

- [ ] **Step 3: 记录结果**

更新 `progress.md` 与 `task_plan.md`，列出通过的测试、可访问页面和下一批 P0-B 范围。

- [ ] **Step 4: 提交修复与记录**

```bash
git add frontend progress.md task_plan.md
git commit -m "chore: verify p0a workspace experience"
```
