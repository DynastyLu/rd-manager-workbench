# UI Consistency Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复截图中全部主题、组件、弹窗、日期、下拉和页面布局不一致问题。

**Architecture:** 以 Semi Design 和工作台 CSS tokens 为唯一视觉基础。先通过主题解析和全局样式阻止旧主题污染，再迁移截图涉及的表单和弹窗，最后逐页调整布局并用组件测试和浏览器截图验收。

**Tech Stack:** React 19、TypeScript、Semi Design、FullCalendar、Less、Vitest、Playwright

---

### Task 1: 固定浅色主题并清理旧页面覆盖

**Files:**
- Modify: `frontend/src/stores/theme.ts`
- Modify: `frontend/src/stores/__tests__/theme.test.ts`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/styles/workspace-tokens.css`

- [ ] 写失败测试：旧 `worldcup` 持久化值应解析为 `classic`，默认主题应为 `classic`。
- [ ] 运行 `pnpm test src/stores/__tests__/theme.test.ts`，确认测试因旧默认值失败。
- [ ] 收敛主题解析并移除 `.app-page` 深色覆盖。
- [ ] 再次运行主题测试并确认通过。

### Task 2: 统一全局创建弹窗

**Files:**
- Modify: `frontend/src/components/AppShell/WorkspaceHeader.tsx`
- Modify: `frontend/src/components/AppShell/__tests__/WorkspaceHeader.test.tsx`
- Modify: `frontend/src/modules/workbench/components/ProjectForm.tsx`
- Modify: `frontend/src/modules/workbench/components/TaskForm.tsx`
- Modify: corresponding form tests

- [ ] 写失败测试：创建弹窗存在取消和确认按钮，任务使用可访问的日期与下拉控件。
- [ ] 运行相关测试并确认失败。
- [ ] 将表单迁移为 Semi Form 控件并由 Modal footer 提交。
- [ ] 运行相关测试并确认通过。

### Task 3: 统一知识库、AI 与模板弹窗

**Files:**
- Modify: `frontend/src/pages/KnowledgeHomePage.tsx`
- Modify: `frontend/src/pages/KnowledgeHomePage.less`
- Modify: `frontend/src/modules/base/components/TemplateCenter.tsx`
- Modify: `frontend/src/pages/LibraryHomePage.less`
- Modify: relevant tests

- [ ] 写失败测试：知识空间和模板弹窗含标准取消/确认操作区。
- [ ] 运行测试并确认失败。
- [ ] 移动操作到 Modal footer，整理禁用说明和内容滚动。
- [ ] 运行测试并确认通过。

### Task 4: 修复页面布局和日历本地化

**Files:**
- Modify: `frontend/src/pages/ProjectsPage.less`
- Modify: `frontend/src/pages/CalendarPage.tsx`
- Modify: `frontend/src/pages/CalendarPage.less`
- Modify: `frontend/src/pages/WorkbenchHome.tsx`
- Modify: `frontend/src/pages/WorkbenchSettings.tsx`
- Modify: `frontend/src/pages/SearchPage.tsx`
- Modify: relevant tests

- [ ] 写失败测试：FullCalendar 接收中文 locale，项目表面不依赖固定空白高度。
- [ ] 运行测试并确认失败。
- [ ] 接入 `zh-cn`、迁移原生项目下拉和日期控件、统一页面表面与响应式布局。
- [ ] 运行测试并确认通过。

### Task 5: 验证

- [ ] 运行受影响测试。
- [ ] 运行 `pnpm typecheck`。
- [ ] 运行 `pnpm build`。
- [ ] 启动前端并使用浏览器检查工作台、项目、日历、搜索及各类弹窗。
- [ ] 对照 11 张原始截图逐项确认问题消失。
