# P0 Interaction Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一工作台 UI 组件、设计变量、弹层表单、页面骨架、保存反馈和 URL 状态，使后续业务页面可在稳定交互基础上迭代。

**Architecture:** 以 Semi Design 为唯一业务 UI 层，在 `components/workspace` 中提供小型适配组件；静态 AST 测试禁止原生控件和旧组件回流。页面状态由通用 URL 查询参数工具同步，业务草稿仍由页面本地状态管理。

**Tech Stack:** React 19、TypeScript、Semi Design、React Router、TanStack Query、Vitest、Testing Library、Playwright。

---

### Task 1: 固化 UI 约束与设计变量

**Status:** complete

**Files:**
- Modify: `frontend/src/__tests__/uiLibraryControls.test.ts`
- Modify: `frontend/src/styles/workspace-tokens.css`
- Test: `frontend/src/__tests__/uiLibraryControls.test.ts`

- [ ] 增加失败测试，扫描生产 TSX 中的原生 `select`、原生日期时间输入和 `@/components/ui` 导入。
- [ ] 运行 `pnpm test -- src/__tests__/uiLibraryControls.test.ts`，确认因现存违规项失败。
- [ ] 扩充工作台设计变量，覆盖控件高度、表单间距、弹层间距、焦点环、遮罩和状态色。
- [ ] 完成后再次运行静态约束测试。

### Task 2: 建立 Semi 公共交互组件并迁移原生控件

**Status:** complete

**Files:**
- Create: `frontend/src/components/workspace/WorkspaceSelect.tsx`
- Create: `frontend/src/components/workspace/WorkspaceDatePicker.tsx`
- Create: `frontend/src/components/workspace/WorkspaceModal.tsx`
- Create: `frontend/src/components/workspace/WorkspaceForm.tsx`
- Create: `frontend/src/components/workspace/__tests__/WorkspaceControls.test.tsx`
- Modify: `frontend/src/pages/*.tsx`
- Modify: `frontend/src/modules/base/components/*.tsx`
- Modify: `frontend/src/modules/workbench/components/*.tsx`

- [ ] 先为受控值、清空、表单字段名、错误和底部按钮布局编写失败测试。
- [ ] 运行公共组件测试并确认缺少组件而失败。
- [ ] 实现最小公共组件，保持 Semi 原生键盘和可访问行为。
- [ ] 分模块替换所有生产原生 `select` 和日期时间控件。
- [ ] 运行公共组件、日期静态测试和涉及页面的 focused tests。

### Task 3: 清除 Shadcn 业务组件混用

**Status:** complete

**Files:**
- Modify: `frontend/src/pages/WorkbenchHome.tsx`
- Modify: `frontend/src/pages/ApplicationCasesPage.tsx`
- Modify: `frontend/src/pages/RisksPage.tsx`
- Modify: `frontend/src/pages/IssuesPage.tsx`
- Modify: `frontend/src/pages/DecisionsPage.tsx`
- Modify: `frontend/src/modules/workbench/components/*.tsx`
- Modify: `frontend/src/main.tsx`
- Test: corresponding `frontend/src/pages/__tests__/*.test.tsx`

- [ ] 增加/更新页面测试，约束 Semi Dialog、Button、Card、Select 和 Skeleton 行为。
- [ ] 逐页迁移到 Semi，保持业务请求和数据契约不变。
- [ ] 静态测试确认生产页面无 `@/components/ui` 导入。

### Task 4: 页面骨架和可访问性治理

**Status:** complete

**Files:**
- Create: `frontend/src/components/workspace/WorkspacePage.tsx`
- Create: `frontend/src/components/workspace/WorkspaceState.tsx`
- Modify: `frontend/src/components/AppShell/__tests__/AppShellAccessibility.test.tsx`
- Modify: `frontend/src/pages/KnowledgeHomePage.tsx`
- Modify: `frontend/src/pages/LibraryHomePage.tsx`
- Modify: `frontend/src/pages/IntelligenceBriefsPage.tsx`
- Modify: matching Less/CSS files

- [ ] 扩展失败测试，覆盖知识库、多维表格和情报简报的单一 `main` 地标。
- [ ] 将页面内部 `main` 改为语义明确的 `section`，保留唯一应用主地标。
- [ ] 清除 `outline: none` 和 `transition: all`，补充 `focus-visible` 与 reduced-motion。
- [ ] 验证弹层遮罩、滚动和键盘关闭行为。

### Task 5: 保存反馈和 URL 状态

**Status:** complete

**Files:**
- Create: `frontend/src/components/workspace/SaveStatus.tsx`
- Create: `frontend/src/hooks/useWorkspaceSearchParams.ts`
- Create: associated tests
- Modify: `frontend/src/pages/ProjectsPage.tsx`
- Modify: `frontend/src/pages/TasksPage.tsx`
- Modify: `frontend/src/pages/CalendarPage.tsx`
- Modify: `frontend/src/pages/KnowledgeHomePage.tsx`
- Modify: `frontend/src/pages/LibraryHomePage.tsx`
- Modify: `frontend/src/pages/SearchPage.tsx`

- [ ] 为默认值、非法参数回退、保留未知参数和删除默认参数编写失败测试。
- [ ] 实现类型安全的查询参数读取和不可变更新。
- [ ] 将高频页面的视图、筛选、分页和选中对象迁移到 URL。
- [ ] 为文档自动保存和多维表格视图保存接入统一保存状态。
- [ ] 验证保存失败时草稿和页面上下文不丢失。

### Task 6: 完整验证

**Status:** complete — full Vitest, type/contracts/lint/build/diff and Chromium 12/12 passed.

**Files:**
- Modify: `frontend/e2e/smoke.spec.ts`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

- [x] 运行 focused tests 并修复回归。
- [x] 运行 `pnpm test`、`pnpm typecheck`、`pnpm typecheck:contracts`、`pnpm lint`、`pnpm build`。
- [x] 运行 `pnpm test:e2e`，真实检查日期、下拉、弹窗边距、URL 恢复和单一主地标。
- [x] 运行 `git diff --check` 并记录最终结果。
