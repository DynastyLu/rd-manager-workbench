# 本地研发工作台外壳 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前后台式路由和菜单替换为工作空间优先的导航外壳，同时保持已有业务数据、旧链接和 API 可用。

**Architecture:** 用一个集中式 route registry 定义 canonical route、导航位置、旧链接重定向和模块状态。`AppShell` 只处理空间导航与页面容器；工作台、项目空间、业务库、会议资料、知识库和自动化数据由独立页面承接。现有 CRUD 页面复用其 API 和表单，先迁入新入口，不重写已有后端模型。

**Tech Stack:** React 19、React Router 7 HashRouter、TypeScript、TanStack Query、Vitest + Testing Library、Playwright、现有 shadcn/ui 与 Less 主题变量。

---

## 文件结构

| 文件 | 责任 |
| --- | --- |
| `frontend/src/constants/routes.ts` | canonical 与 legacy 路由常量 |
| `frontend/src/router/routes.ts` | 页面懒加载、路由元数据、legacy redirect |
| `frontend/src/router/__tests__/routes.test.ts` | navigation order、legacy redirect metadata、规划模块不挂 API 的回归测试 |
| `frontend/src/components/AppShell/AppShell.tsx` | 顶栏、工作空间导航、页面 `Outlet` 和 suspense 容器 |
| `frontend/src/components/AppShell/AppShell.less` | 桌面/窄窗口 shell 布局；复用主题变量，不复制飞书视觉资产 |
| `frontend/src/components/AppShell/WorkspaceNavigation.tsx` | 八个稳定入口与当前态；设置固定在底部 |
| `frontend/src/components/AppShell/WorkspaceHeader.tsx` | 页面标题、面包屑、全局搜索占位入口、快速新建入口 |
| `frontend/src/components/AppShell/PlannedModuleState.tsx` | 真实的“规划中”状态；禁止自动请求未实现 API |
| `frontend/src/components/AppShell/__tests__/*.test.tsx` | shell、导航、planned state 和窄窗口语义回归 |
| `frontend/src/pages/MyWorkPage.tsx` | 使用现有任务 API 的“我的工作”入口 |
| `frontend/src/pages/ProjectSpacesPage.tsx` | 使用现有项目 API 的项目空间列表，卡片优先并保留筛选/新建 |
| `frontend/src/pages/ProjectWorkspacePage.tsx` | 当前项目上下文、二级页签与已实现数据/规划状态 |
| `frontend/src/pages/LibraryHomePage.tsx` | 业务库总览及链接到真实对象库或规划中模块 |
| `frontend/src/pages/MeetingsAndMaterialsPage.tsx` | 会议资料入口并承接现有会议页面 |
| `frontend/src/pages/KnowledgeHomePage.tsx` | 知识库规划状态与明确实现边界；不生成知识页假数据 |
| `frontend/src/pages/AutomationDataPage.tsx` | 自动化与数据能力目录与真实规划状态 |
| `frontend/src/pages/__tests__/*.test.tsx` | 新页面的加载、失败、空状态、导航与无假数据测试 |
| `frontend/src/main.tsx` | 将旧 `Layout` 替换为 `AppShell`；保留 Query/Sentry/ErrorBoundary 配置 |
| `frontend/e2e/workspace-shell.spec.ts` | canonical route 和 legacy hash route 冒烟 |

### Task 1: 建立 canonical route registry 与 legacy redirect

**Files:**
- Modify: `frontend/src/constants/routes.ts`
- Modify: `frontend/src/router/routes.ts`
- Modify: `frontend/src/router/__tests__/routes.test.ts`

- [ ] **Step 1: 写出失败的路由元数据测试**

```ts
expect(primaryNavigation.map((item) => item.path)).toEqual([
  '/', '/my-work', '/spaces/projects', '/library', '/meetings',
  '/knowledge', '/automation-data',
])
expect(findRoute('/projects')?.redirectTo).toBe('/spaces/projects')
expect(findRoute('/risks')?.redirectTo).toBe('/library/governance/risks')
expect(findRoute('/knowledge')?.availability).toBe('PLANNED')
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/router/__tests__/routes.test.ts`

Expected: FAIL，因为 `primaryNavigation`、canonical paths 和 legacy redirect 还不存在。

- [ ] **Step 3: 定义路由常量与元数据类型**

在 `constants/routes.ts` 增加：

```ts
export const ROUTES = {
  HOME: '/', MY_WORK: '/my-work', PROJECT_SPACES: '/spaces/projects',
  projectWorkspace: (projectId: string, section = 'overview') =>
    `/spaces/projects/${encodeURIComponent(projectId)}/${section}`,
  LIBRARY: '/library', APPLICATIONS: '/library/applications',
  governance: (kind: GovernanceKind) => `/library/governance/${kind}`,
  MEETINGS: '/meetings', KNOWLEDGE: '/knowledge',
  AUTOMATION_DATA: '/automation-data', SETTINGS: '/settings',
} as const
```

在 `routes.ts` 增加 `NavigationItem`、`RouteDefinition` 和 `ModuleAvailability`；将八个顶层入口放进 `primaryNavigation`，将旧 `/projects`、`/tasks`、`/application-cases`、`/risks`、`/issues`、`/decisions`、`/partners` 设为没有导航项的 redirect route。用 `Navigate replace` 渲染 redirect route，`/meetings` 和 `/settings` 仅保留 canonical path。

- [ ] **Step 4: 运行路由测试**

Run: `pnpm vitest run src/router/__tests__/routes.test.ts`

Expected: PASS，且未实现模块只有 `availability: 'PLANNED'`，没有 API 函数引用。

- [ ] **Step 5: 提交路由层**

```bash
git add frontend/src/constants/routes.ts frontend/src/router/routes.ts frontend/src/router/__tests__/routes.test.ts
git commit -m "feat: add workspace route registry"
```

### Task 2: 用 AppShell 替换后台 Layout 与多标签栏

**Files:**
- Create: `frontend/src/components/AppShell/AppShell.tsx`
- Create: `frontend/src/components/AppShell/AppShell.less`
- Create: `frontend/src/components/AppShell/WorkspaceNavigation.tsx`
- Create: `frontend/src/components/AppShell/WorkspaceHeader.tsx`
- Create: `frontend/src/components/AppShell/__tests__/AppShell.test.tsx`
- Create: `frontend/src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/components/Layout/__tests__/Layout.test.tsx`

- [ ] **Step 1: 写出 shell 和导航失败测试**

```tsx
render(<MemoryRouter initialEntries={['/library']}><AppShell /></MemoryRouter>)
expect(screen.getByRole('navigation', { name: '主导航' })).toHaveTextContent('项目空间')
expect(screen.getByRole('link', { name: '业务库' })).toHaveAttribute('href', '/library')
expect(screen.queryByText('TabBar')).not.toBeInTheDocument()
```

另写键盘测试：聚焦“设置”链接后按 Enter，`useLocation().pathname` 为 `/settings`；给 `<nav>` `aria-label="主导航"`，不能用点击 `div` 模拟链接。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/components/AppShell/__tests__/AppShell.test.tsx src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx`

Expected: FAIL，因为 `AppShell` 组件不存在。

- [ ] **Step 3: 实现 AppShell 和稳定导航**

`AppShell` 使用 `useLocation()` 从 route registry 得出标题；结构必须为：

```tsx
<div className="app-shell">
  <WorkspaceNavigation items={primaryNavigation} />
  <div className="app-shell__main">
    <WorkspaceHeader route={activeRoute} />
    <main className="app-shell__content"><Suspense fallback={skeleton}><Outlet /></Suspense></main>
  </div>
</div>
```

`WorkspaceHeader` 保留主题切换能力但将原 Header 内部逻辑迁入；搜索按钮标注“全局搜索（规划中）”，点击显示 `PlannedModuleState`/toast，不执行 fetch。快速新建只链接到已有项目或任务创建能力；没有实现的对象不显示可提交按钮。

Less 使用现有 `--bg-*`、`--text-*`、`--accent-*` 变量，不能硬编码飞书蓝或复制飞书图标。`@media (max-width: 900px)` 将文字隐藏、保留带 `aria-label` 的图标链接，内容区仍可滚动。

- [ ] **Step 4: 将 `main.tsx` 接入新 shell**

把现有 `<Layout>` parent route 替换为 `<AppShell skeleton={...} />`，保留 `QueryClientProvider`、Sentry、错误边界、主题 store、`Toaster` 和 `HashRouter`。删除 `TabBar` 在运行树中的引用；不删除旧组件文件，避免本任务外的破坏性清理。

- [ ] **Step 5: 运行 shell 测试和类型检查**

Run: `pnpm vitest run src/components/AppShell/__tests__ src/components/Layout/__tests__/Layout.test.tsx && pnpm typecheck`

Expected: PASS。将旧 Layout 测试改为验证 `AppShell` 的 content outlet；不再断言 `.tab-bar`。

- [ ] **Step 6: 提交外壳**

```bash
git add frontend/src/components/AppShell frontend/src/main.tsx frontend/src/components/Layout/__tests__/Layout.test.tsx
git commit -m "feat: replace admin layout with workspace shell"
```

### Task 3: 建立所有顶层入口与无假数据的规划状态

**Files:**
- Create: `frontend/src/components/AppShell/PlannedModuleState.tsx`
- Create: `frontend/src/components/AppShell/__tests__/PlannedModuleState.test.tsx`
- Create: `frontend/src/pages/LibraryHomePage.tsx`
- Create: `frontend/src/pages/MeetingsAndMaterialsPage.tsx`
- Create: `frontend/src/pages/KnowledgeHomePage.tsx`
- Create: `frontend/src/pages/AutomationDataPage.tsx`
- Create: `frontend/src/pages/__tests__/WorkspaceDirectoryPages.test.tsx`
- Modify: `frontend/src/router/routes.ts`

- [ ] **Step 1: 写出“规划中不请求 API”的失败测试**

```tsx
const fetchSpy = vi.spyOn(globalThis, 'fetch')
render(<KnowledgeHomePage />)
expect(screen.getByRole('heading', { name: '知识库' })).toBeInTheDocument()
expect(screen.getByText('该能力正在规划中')).toBeInTheDocument()
expect(fetchSpy).not.toHaveBeenCalled()
```

同一测试文件断言业务库中的“申报认定”“风险与问题”“决策”“合作方”是链接，行业情报与非项目研发带规划标签；自动化与数据列出提醒、搜索、导入导出、备份恢复、审计、AI、外部集成和 LAN。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/pages/__tests__/WorkspaceDirectoryPages.test.tsx src/components/AppShell/__tests__/PlannedModuleState.test.tsx`

Expected: FAIL，因为目录页与 `PlannedModuleState` 不存在。

- [ ] **Step 3: 实现目录页与 planned state**

`PlannedModuleState` 接受 `{ title, description, nextStep, relatedRoute? }`；只渲染说明和可选链接。`LibraryHomePage` 的真实链接分别去 `/library/applications` 和 `ROUTES.governance('risks'|'issues'|'decisions'|'partners')`；规划项显示状态徽标。`MeetingsAndMaterialsPage` 以现有会议页为真实入口，并显示附件中心为规划中。知识库固定说明“本地知识页、目录、标签、项目/会议/情报/任务/附件关联和全文搜索”；自动化数据固定说明数据治理范围。

- [ ] **Step 4: 运行规划状态测试**

Run: `pnpm vitest run src/pages/__tests__/WorkspaceDirectoryPages.test.tsx src/components/AppShell/__tests__/PlannedModuleState.test.tsx`

Expected: PASS，所有 planned 页面零网络请求。

- [ ] **Step 5: 提交目录入口**

```bash
git add frontend/src/components/AppShell/PlannedModuleState.tsx frontend/src/components/AppShell/__tests__/PlannedModuleState.test.tsx frontend/src/pages/LibraryHomePage.tsx frontend/src/pages/MeetingsAndMaterialsPage.tsx frontend/src/pages/KnowledgeHomePage.tsx frontend/src/pages/AutomationDataPage.tsx frontend/src/pages/__tests__/WorkspaceDirectoryPages.test.tsx frontend/src/router/routes.ts
git commit -m "feat: add workspace module directories"
```

### Task 4: 迁入我的工作、项目空间和项目工作区

**Files:**
- Create: `frontend/src/pages/MyWorkPage.tsx`
- Create: `frontend/src/pages/ProjectSpacesPage.tsx`
- Create: `frontend/src/pages/ProjectWorkspacePage.tsx`
- Create: `frontend/src/pages/__tests__/ProjectWorkspacePage.test.tsx`
- Modify: `frontend/src/pages/TasksPage.tsx`
- Modify: `frontend/src/pages/ProjectsPage.tsx`
- Modify: `frontend/src/router/routes.ts`

- [ ] **Step 1: 写出项目工作区失败测试**

```tsx
getProject.mockResolvedValue(project)
listTasks.mockResolvedValue({ data: [task], meta: { page: 1, pageSize: 20, total: 1 } })
renderAt('/spaces/projects/project-1/tasks')
expect(await screen.findByRole('heading', { name: '新材料研发' })).toBeInTheDocument()
expect(screen.getByRole('tab', { name: '任务' })).toHaveAttribute('aria-selected', 'true')
expect(screen.getByText('完成实验记录')).toBeInTheDocument()
```

增加失败路径：`getProject` reject 时显示“无法读取该项目”及重试按钮；未实现的“资料”页签显示 planned state 且 `fetch` 未被额外调用。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/pages/__tests__/ProjectWorkspacePage.test.tsx`

Expected: FAIL，因为项目工作区页面不存在。

- [ ] **Step 3: 实现我的工作与项目空间列表**

`MyWorkPage` 包装现有 `TasksPage` 的真实任务查询，标题改为“我的工作”，不新增“个人”后端筛选假设。`ProjectSpacesPage` 复用项目查询、筛选和创建表单，使用可访问的项目卡片链接：

```tsx
<Link to={ROUTES.projectWorkspace(project.id)} aria-label={`打开项目空间：${project.name}`}>
  <ProjectSpaceCard project={project} />
</Link>
```

保留原 `ProjectsPage` 与 `TasksPage` 作为内部可复用内容组件或 compatibility export，legacy route 只重定向，不让两个页面分别维持第二套查询逻辑。

- [ ] **Step 4: 实现项目工作区**

从 `useParams()` 读取 `projectId` 和可选 `section`。允许 sections：`overview`、`tasks`、`progress`、`governance`、`meetings`、`materials`；无效 section 用 `<Navigate replace to={ROUTES.projectWorkspace(projectId)} />`。`overview` 使用 `getProject`；`tasks` 调用 `listTasks({ projectId })`；`progress`、`governance`、`meetings`、`materials` 首版使用 `PlannedModuleState` 或已有真实关联入口，不能拼凑不存在的项目关联 API。

- [ ] **Step 5: 运行页面测试与类型检查**

Run: `pnpm vitest run src/pages/__tests__/ProjectsPage.test.tsx src/pages/__tests__/TasksPage.test.tsx src/pages/__tests__/ProjectWorkspacePage.test.tsx && pnpm typecheck`

Expected: PASS。确认项目列表仍可新建、任务更新 mutation 仍刷新 dashboard cache。

- [ ] **Step 6: 提交项目空间**

```bash
git add frontend/src/pages/MyWorkPage.tsx frontend/src/pages/ProjectSpacesPage.tsx frontend/src/pages/ProjectWorkspacePage.tsx frontend/src/pages/__tests__/ProjectWorkspacePage.test.tsx frontend/src/pages/TasksPage.tsx frontend/src/pages/ProjectsPage.tsx frontend/src/router/routes.ts
git commit -m "feat: add project workspace navigation"
```

### Task 5: 迁入已有业务页面并形成统一上下文标题

**Files:**
- Create: `frontend/src/components/AppShell/PageContext.tsx`
- Create: `frontend/src/components/AppShell/__tests__/PageContext.test.tsx`
- Modify: `frontend/src/pages/ApplicationCasesPage.tsx`
- Modify: `frontend/src/pages/RisksPage.tsx`
- Modify: `frontend/src/pages/IssuesPage.tsx`
- Modify: `frontend/src/pages/DecisionsPage.tsx`
- Modify: `frontend/src/pages/PartnersPage.tsx`
- Modify: `frontend/src/pages/MeetingsPage.tsx`
- Modify: `frontend/src/router/routes.ts`

- [ ] **Step 1: 写出业务库入口和标题失败测试**

```tsx
renderAt('/library/governance/risks')
expect(await screen.findByRole('heading', { name: '风险对象库' })).toBeInTheDocument()
expect(screen.getByText('业务库 / 风险与问题')).toBeInTheDocument()
```

再断言旧 `/#/risks` 最终显示同一个标题，且“新建风险”仍打开现有表单。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/pages/__tests__/ManagementWorkspaceRoutes.test.tsx`

Expected: FAIL，因为新业务库上下文和 legacy redirect 尚未同时被覆盖。

- [ ] **Step 3: 实现 PageContext 并接入已有页面**

`PageContext` 只渲染 `{ eyebrow, title, description, actions }`，业务页面传入“业务库 / 申报认定”“业务库 / 风险与问题”“会议与资料 / 会议”等面包屑。现有 React Query 调用、表单、加载/失败/空状态和 mutation 不改语义；仅替换孤立的后台 hero 结构和 route 归属。

- [ ] **Step 4: 运行业务页面回归测试**

Run: `pnpm vitest run src/pages/__tests__/ApplicationCasesPage.test.tsx src/pages/__tests__/ManagementWorkspaceRoutes.test.tsx`

Expected: PASS，已有页面在新 canonical route 和 legacy route 下均可渲染。

- [ ] **Step 5: 提交业务迁入**

```bash
git add frontend/src/components/AppShell/PageContext.tsx frontend/src/components/AppShell/__tests__/PageContext.test.tsx frontend/src/pages/ApplicationCasesPage.tsx frontend/src/pages/RisksPage.tsx frontend/src/pages/IssuesPage.tsx frontend/src/pages/DecisionsPage.tsx frontend/src/pages/PartnersPage.tsx frontend/src/pages/MeetingsPage.tsx frontend/src/router/routes.ts frontend/src/pages/__tests__/ManagementWorkspaceRoutes.test.tsx
git commit -m "feat: move existing modules into workspace navigation"
```

### Task 6: 路由兼容、端到端冒烟和质量门禁

**Files:**
- Create: `frontend/e2e/workspace-shell.spec.ts`
- Modify: `frontend/e2e/smoke.spec.ts`
- Modify: `task_plan.md`

- [ ] **Step 1: 写出端到端 canonical/legacy 测试**

```ts
test('opens a project workspace from the project spaces entry', async ({ page }) => {
  await page.goto('/#/spaces/projects')
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '项目空间' })).toBeVisible()
})

test('redirects legacy project hash route', async ({ page }) => {
  await page.goto('/#/projects')
  await expect(page).toHaveURL(/#\/spaces\/projects$/)
})
```

为无后端数据场景 mock `/api/projects`、`/api/dashboard` 或验证真实失败态；不依赖开发机已有项目记录。

- [ ] **Step 2: 运行 e2e 测试确认失败**

Run: `pnpm test:e2e -- workspace-shell.spec.ts`

Expected: FAIL，直到 Vite web server、canonical 路由和 legacy redirect 完成。

- [ ] **Step 3: 配置测试所需的 Vite 服务并修正可见性断言**

沿用 `playwright.config.ts` 的 `webServer` 和 4312 端口；若没有全局 API mock，断言页面的“无法读取…”与重试按钮而非要求真实业务数据。

- [ ] **Step 4: 更新项目计划状态**

在 `task_plan.md` 标记“工作空间导航与应用外壳”完成，并把后续功能的实施顺序更新为：知识库、行业情报、数据治理、P1/P2。不要把未合并的分支功能标为已交付。

- [ ] **Step 5: 运行完整质量门禁**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`

Expected: 所有命令退出码为 0。若 Storybook 因现有环境失败，记录独立原因后单独运行 `pnpm build-storybook`，不得把失败掩盖为通过。

- [ ] **Step 6: 提交验证与状态更新**

```bash
git add frontend/e2e/workspace-shell.spec.ts frontend/e2e/smoke.spec.ts task_plan.md
git commit -m "test: verify workspace shell navigation"
```

## 计划自检

- **规格覆盖：** Task 1/2 覆盖 canonical route、legacy redirect 和 shell；Task 3 覆盖所有顶层功能入口、知识库和无假数据规则；Task 4 覆盖项目空间；Task 5 迁入已有业务模块；Task 6 覆盖兼容与质量门禁。
- **范围边界：** 本计划不实现知识库表结构、附件、情报、导入导出、备份、AI、外部系统或 LAN；它们已有或将拥有独立的后端/数据模型计划，且在本外壳中明确可见。
- **一致性：** 路径常量只由 `ROUTES` 产生；所有 planned route 均使用 `availability: 'PLANNED'` 和 `PlannedModuleState`；项目页签使用唯一的 `projectWorkspace(projectId, section)` 构造器。
