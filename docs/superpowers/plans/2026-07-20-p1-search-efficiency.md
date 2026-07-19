# P1-02 全局搜索与个人效率 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前 `/search` 规划页替换为覆盖主要业务对象的真实全局搜索，提供分类过滤、安全高亮、最近搜索和受控快捷操作。

**Architecture:** Nest SearchModule 维护领域 adapter registry，各 adapter 从业务真源读取有限候选，SearchService 统一打分、Unicode 高亮、分组和稳定分页；不存在第二份搜索数据。最近搜索只存在 renderer 版本化 localStorage，快捷操作复用现有领域服务。

**Tech Stack:** NestJS, Prisma, PostgreSQL, React 18, TanStack Query, Semi Design, Jest, Vitest

---

## Task 1: 搜索领域契约、打分与高亮

**Files:**
- Create: `backend/src/modules/workbench/search/domain/search.types.ts`
- Create: `backend/src/modules/workbench/search/domain/search-ranking.ts`
- Create: `backend/test/unit/modules/workbench/search-ranking.spec.ts`

- [ ] 先写 query 规范化、2～100 字符、精确/前缀/标题/摘要打分、中文/emoji 区间、HTML 纯文本和稳定 tie-break 测试。
- [ ] 运行 `pnpm --dir backend test:unit -- --runInBand search-ranking.spec.ts`，确认 RED。
- [ ] 实现纯函数与 adapter interface；高亮只返回 start/end，不返回 HTML。
- [ ] 运行目标测试、lint 和 build。
- [ ] Commit: `feat(search): add safe ranking contract`

## Task 2: 项目、任务、申请、文档与附件 adapters

**Files:**
- Create: `backend/src/modules/workbench/search/adapters/projects-search.adapter.ts`
- Create: `backend/src/modules/workbench/search/adapters/tasks-search.adapter.ts`
- Create: `backend/src/modules/workbench/search/adapters/applications-search.adapter.ts`
- Create: `backend/src/modules/workbench/search/adapters/content-search.adapter.ts`
- Create: `backend/test/unit/modules/workbench/search-core-adapters.spec.ts`

- [ ] 先写每类最多 100、排除 archived/trashed、摘要 240 字、真实深链、附件不返回 storage key 和参数化 contains 测试。
- [ ] 运行目标测试确认 RED。
- [ ] 用 Prisma 结构化 where 实现 adapters；附件 path 指向所属文档/会议/项目，不创建文件假详情页。
- [ ] 运行目标测试、lint 和 build。
- [ ] Commit: `feat(search): index core workspace objects`

## Task 3: 会议、风险、问题、决策、合作方与 Base adapters

**Files:**
- Create: `backend/src/modules/workbench/search/adapters/management-search.adapter.ts`
- Create: `backend/src/modules/workbench/search/adapters/base-search.adapter.ts`
- Create: `backend/test/unit/modules/workbench/search-domain-adapters.spec.ts`

- [ ] 先写复合类型、归档排除、联系信息不泄露、Base 只搜索 CUSTOM 表记录、系统预置记录不重复和真实 `recordId` 深链测试。
- [ ] 运行目标测试确认 RED。
- [ ] 实现管理闭环和自定义 Base adapter；后续 NON_PROJECT_RD/INTELLIGENCE 未注册时返回空组，不造假。
- [ ] 运行目标测试、lint 和 build。
- [ ] Commit: `feat(search): add governance and base adapters`

## Task 4: 聚合 API、部分失败与快捷操作

**Files:**
- Create: `backend/src/modules/workbench/search/application/search.service.ts`
- Create: `backend/src/modules/workbench/search/application/search-actions.service.ts`
- Create: `backend/src/modules/workbench/search/interface/http/dto/search.dto.ts`
- Create: `backend/src/modules/workbench/search/interface/http/search.controller.ts`
- Create: `backend/src/modules/workbench/search/search.module.ts`
- Modify: `backend/src/modules/workbench/workbench.module.ts`
- Modify: `backend/src/modules/workbench/management/management.module.ts`
- Modify: `backend/src/modules/workbench/content/content.module.ts`
- Modify: `backend/src/shared/errors/error-codes.ts`
- Create: `backend/test/integration/modules/workbench/search.controller.spec.ts`

- [ ] 先写 types allowlist、500 candidate cap、分页分组、单 adapter 失败仍返回 partialFailures、全部失败稳定错误和非法 action 测试。
- [ ] 先写 COMPLETE/REOPEN_TASK、TOGGLE_DOCUMENT_FAVORITE、CLOSE_RISK 必须复用真实领域规则且返回新 hit 的测试。
- [ ] 运行目标 integration test 确认 RED。
- [ ] 注册 adapter providers，实现 `GET /api/search` 与 `POST /api/search/actions/:type/:id`；风险关闭需要 confirm。
- [ ] 运行目标 integration、backend unit、lint 和 build。
- [ ] Commit: `feat(search): expose global search and safe actions`

## Task 5: 最近搜索与前端 API

**Files:**
- Create: `frontend/src/modules/workbench/api/search.ts`
- Create: `frontend/src/modules/workbench/search/recentSearches.ts`
- Create: `frontend/src/modules/workbench/api/__tests__/search.test.ts`
- Create: `frontend/src/modules/workbench/search/__tests__/recentSearches.test.ts`

- [ ] 先写查询编码/响应校验，以及坏 JSON 回退、query+types 去重、最多 20、单删/全清和只在显式成功后写入测试。
- [ ] 运行目标 Vitest 确认 RED。
- [ ] 实现 typed client 与 `rd-workbench:recent-searches:v1` helper。
- [ ] 运行目标测试、contracts 和 typecheck。
- [ ] Commit: `feat(frontend): add search client and recent history`

## Task 6: 飞书式搜索页面与快捷入口

**Files:**
- Create: `frontend/src/pages/SearchPage.tsx`
- Create: `frontend/src/modules/workbench/components/search/SearchHighlight.tsx`
- Create: `frontend/src/modules/workbench/components/search/SearchFilters.tsx`
- Create: `frontend/src/modules/workbench/components/search/SearchResultItem.tsx`
- Create: `frontend/src/pages/__tests__/SearchPage.test.tsx`
- Modify: `frontend/src/components/AppShell/WorkspaceHeader.tsx`
- Modify: `frontend/src/components/AppShell/__tests__/WorkspaceHeader.test.tsx`
- Modify: `frontend/src/router/routes.ts`

- [ ] 先写空输入/最近记录、分类 chips、loading/empty/partial/full error、纯文本 `<mark>`、确认操作、`⌘K/Ctrl+K` 聚焦和真实导航测试。
- [ ] 运行目标 Vitest 确认 RED。
- [ ] 用 Semi Design 实现主搜索框、结果列表、分类计数和右侧预览；替换 `AutomationDataPage`，不改变七入口。
- [ ] 运行 target tests、typecheck、lint 和 build。
- [ ] Commit: `feat(frontend): add global search workspace`

## Task 7: 深链补齐与验收

**Files:**
- Modify: `frontend/src/pages/CalendarPage.tsx`
- Modify: `frontend/src/pages/PartnersPage.tsx`
- Modify: `frontend/src/pages/IssuesPage.tsx`
- Modify: `frontend/src/modules/base/components/BaseWorkspace.tsx`
- Modify: `frontend/src/router/__tests__/routes.test.ts`

- [ ] 先写 `eventId/recordId/tableId` 查询参数聚焦或打开详情的页面测试。
- [ ] 实现缺失深链并保证未知 ID 安全空态。
- [ ] 运行 backend unit/integration/build、frontend check、`git diff --check`。
- [ ] 真实浏览器用同一关键词验证至少项目、任务、会议、文档、合作方和 Base 记录，测试最近搜索刷新与三项快捷操作。
- [ ] 请求规格复核和质量复核，修复后提交。
- [ ] Commit: `test(search): verify global search acceptance`

