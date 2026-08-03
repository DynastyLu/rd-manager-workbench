# Workspace UI Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一全部工作区页面的布局、间距、表格、表单和弹窗表现，同时保持现有业务行为不变。

**Architecture:** 先用静态规则和浏览器断言锁定重复页头、错误 Less 作用域和组件混用，再建立共享页面/工具栏/表格布局类。随后按模块页、实体页、数据工作区迁移，最后在四种桌面宽度下做浏览器回归。

**Tech Stack:** React 18、TypeScript、Semi UI、Less/CSS、Vitest、Playwright。

---

### Task 1: 建立 UI 回归规则

**Files:**
- Create: `frontend/src/__tests__/workspaceLayoutRules.test.ts`
- Modify: `frontend/e2e/smoke.spec.ts`

- [ ] 编写失败测试：ProjectWorkspace Less 编译后计划样式必须是根选择器。
- [ ] 编写失败测试：模块页不得包含已确认的重复宣传式副标题。
- [ ] 编写失败测试：多维表格 FormView 不得使用原生按钮和布局内联样式。
- [ ] 运行定向测试并确认因现状问题失败。

### Task 2: 修复全局页面骨架和项目 Less 作用域

**Files:**
- Modify: `frontend/src/styles/workspace-tokens.css`
- Modify: `frontend/src/pages/ProjectWorkspacePage.less`
- Modify: `frontend/src/components/AppShell/WorkspaceHeader.tsx`
- Modify: `frontend/src/components/AppShell/AppShell.less`

- [ ] 补齐工作项工具栏嵌套块并验证计划基线选择器恢复。
- [ ] 新增 module/detail/data 三类页面宽度和共享工具栏/面板间距类。
- [ ] 将普通工作区背景改为中性画布并限制结构性卡片 hover。
- [ ] 让顶部路由标题能够承担模块页主标题语义。
- [ ] 运行定向测试并确认通过。

### Task 3: 迁移模块页重复页头和操作区

**Files:**
- Modify: `frontend/src/pages/TasksPage.tsx`
- Modify: `frontend/src/pages/EmployeesPage.tsx`
- Modify: `frontend/src/pages/ProjectsPage.tsx`
- Modify: `frontend/src/pages/CalendarPage.tsx`
- Modify: `frontend/src/pages/SearchPage.tsx`
- Modify: `frontend/src/pages/RisksPage.tsx`
- Modify: `frontend/src/pages/IssuesPage.tsx`
- Modify: `frontend/src/pages/DecisionsPage.tsx`
- Modify: `frontend/src/pages/PartnersPage.tsx`
- Modify: `frontend/src/pages/MeetingsPage.tsx`
- Modify: `frontend/src/pages/OperationsPage.tsx`
- Modify: `frontend/src/pages/ResourcesPage.tsx`
- Modify: `frontend/src/pages/ReportsPage.tsx`
- Modify: `frontend/src/pages/ApplicationCasesPage.tsx`
- Modify: `frontend/src/pages/IntelligencePage.tsx`
- Modify: `frontend/src/modules/admin/AdminLayout.tsx`

- [ ] 删除内容区重复模块标题和宣传式副标题。
- [ ] 将页面主要操作迁入对应工具栏或页签操作区。
- [ ] 保留项目、员工等实体详情的对象头部。
- [ ] 运行模块页面单元测试。

### Task 4: 统一系统管理、员工和普通数据表格

**Files:**
- Modify: `frontend/src/modules/admin/AdminPages.less`
- Modify: `frontend/src/modules/admin/UsersPage.tsx`
- Modify: `frontend/src/modules/admin/PermissionsPage.tsx`
- Modify: `frontend/src/pages/EmployeesPage.less`
- Modify: `frontend/src/lib/tableScrollWidth.ts`
- Modify: `frontend/src/lib/__tests__/tableScrollWidth.test.ts`

- [ ] 将管理工具栏拆为 filters/actions 两组，主按钮保持自动宽度。
- [ ] 权限表说明列改为弹性列，表格至少填满容器。
- [ ] 用户操作保留编辑并将低频操作收进更多菜单。
- [ ] 统一表格分页、空状态、固定操作列和窄屏滚动。
- [ ] 运行管理页、员工页和表格工具定向测试。

### Task 5: 统一表单和弹窗

**Files:**
- Modify: `frontend/src/modules/base/components/FormView.tsx`
- Modify: `frontend/src/modules/base/BaseWorkspace.less`
- Modify: `frontend/src/modules/employees/components/EmployeeImportWizard.tsx`
- Modify: `frontend/src/pages/EmployeesPage.less`
- Modify: `frontend/src/styles/workspace-tokens.css`

- [ ] 将 FormView 内联布局迁入共享样式并使用 Semi Button。
- [ ] 为字段数量较多的表单增加响应式双列布局和整行字段规则。
- [ ] 压缩导入弹窗初始状态留白，稳定 footer 和安全间距。
- [ ] 检查全部 Modal/SideSheet 的 footer、body overflow 和按钮边距。
- [ ] 运行表单、导入和 UI 组件规则测试。

### Task 6: 全页面静态审计和浏览器回归

**Files:**
- Modify: `frontend/e2e/smoke.spec.ts`
- Modify: `docs/superpowers/specs/2026-08-02-workspace-ui-unification-design.md`
- Modify: `findings.md`
- Modify: `progress.md`
- Modify: `task_plan.md`

- [ ] 扫描全部生产 TSX/Less，记录剩余内联布局、原生控件、重复页头和固定宽度。
- [ ] 在 1280、1440、1920、2048 宽度打开关键页面并检查横向溢出。
- [ ] 验证系统管理、员工、多维表格、项目详情、我的工作、日历和知识库。
- [ ] 运行前端测试、typecheck、lint、build 和 Chromium smoke。
- [ ] 将未纳入本轮的非视觉问题单独记录，不伪造成已修复。
