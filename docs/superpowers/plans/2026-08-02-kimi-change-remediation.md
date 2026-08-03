# Kimi Large Change Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 关闭 `docs/product/2026-08-02-kimi-change-review-issues.md` 中全部可复现问题，同时保留产品负责人确认的默认管理员、Dock 和 Aurora 视觉方案。

**Architecture:** 先把权限校验下沉到控制器权限声明和服务数据库条件，确保功能权限与对象数据范围同时成立；再统一 Socket/SSE/文件夹和 Electron 的短期凭证链路；随后补齐 IAM 管理、归属迁移和删除安全；最后修复前端认证客户端、合约、交互与性能。每项使用管理员、员工 A、员工 B 的失败测试锁定越权边界。

**Tech Stack:** NestJS、Prisma/PostgreSQL、Socket.IO、React、TanStack Query、Semi UI、Vitest、Jest、Electron。

---

## 批次 A：权限和对象级数据隔离

### Task 1：员工导入和 Dashboard 权限隔离

**Files:**
- Modify: `backend/src/modules/workbench/employees/interface/http/employee-imports.controller.ts`
- Modify: `backend/src/modules/workbench/employees/application/employee-imports.service.ts`
- Modify: `backend/src/modules/workbench/employees/application/employee-progress-query.service.ts`
- Modify: `backend/src/modules/workbench/dashboard/interface/http/dashboard.controller.ts`
- Modify: `backend/src/modules/workbench/dashboard/application/dashboard.service.ts`
- Test: `backend/test/integration/modules/iam/employee-imports-authorization.spec.ts`
- Test: `backend/test/integration/modules/iam/dashboard-authorization.spec.ts`

- [ ] 新增三用户测试，证明普通员工不能上传、提交、恢复、下载或删除全员导入批次，且 Dashboard 不返回员工 B 的项目和任务。
- [ ] 运行测试并确认因越权成功或数据泄露而 RED，而不是测试配置错误。
- [ ] 为导入读写入口声明准确权限，并把 principal 传入导入查询和写服务。
- [ ] Dashboard 聚合查询组合 `DataScopeService` 的项目、任务和员工过滤条件；超级管理员保持全量。
- [ ] 运行 focused integration、后端 lint 和 build。

### Task 2：操作级 DataScope

**Files:**
- Modify: `backend/src/modules/iam/application/data-scope.service.ts`
- Modify: `backend/src/modules/workbench/projects/application/projects.service.ts`
- Modify: `backend/src/modules/workbench/tasks/application/tasks.service.ts`
- Modify: relevant meeting/document/employee callers discovered by `rg "dataScope\." backend/src`
- Test: `backend/test/unit/modules/iam/data-scope.service.spec.ts`
- Test: `backend/test/integration/modules/iam/business-authorization.spec.ts`

- [ ] 新增 `read=ALL/update=SELF/delete=SELF` 的失败测试，证明员工不能修改或删除他人对象。
- [ ] 将 DataScope 方法改为显式接收 `PermissionCode`，例如 `projects(principal, 'project.update')`。
- [ ] 所有读取、修改、删除、归档调用传递当前操作的权限码，不允许写操作回退到 `*.read`。
- [ ] 运行 DataScope 单元测试和业务授权集成测试。

### Task 3：日历、提醒、附件和文档版本隔离

**Files:**
- Modify: `backend/src/modules/workbench/calendar/interface/http/calendar.controller.ts`
- Modify: `backend/src/modules/workbench/calendar/application/calendar.service.ts`
- Modify: `backend/src/modules/workbench/notifications/application/reminders.service.ts`
- Modify: `backend/src/modules/workbench/content/application/files.service.ts`
- Modify: `backend/src/modules/workbench/content/application/documents.service.ts`
- Test: existing calendar/content/notification authorization integration suites

- [ ] 为员工 A 访问员工 B 的对象新增详情、更新、归档、恢复、版本读取和永久删除失败测试。
- [ ] 在控制器补功能权限，在服务 `where` 条件补 owner/share/project 范围。
- [ ] 附件永久删除改为持久化暂存、数据库提交、提交后清理的可恢复顺序，复用现有回收站删除日志。
- [ ] 运行 focused unit、integration、lint 和 build。

### Task 4：项目进展草稿隔离

**Files:**
- Modify: `backend/src/modules/workbench/employees/interface/http/employees.controller.ts`
- Modify: `backend/src/modules/workbench/employees/application/project-progress-draft.service.ts`
- Test: `backend/test/unit/modules/workbench/project-progress-draft.service.spec.ts`
- Test: related IAM integration suite

- [ ] 新增员工 A 无法列出、生成、采纳或忽略员工 B 草稿的失败测试。
- [ ] 列表和生成使用项目/员工数据范围，采纳和忽略要求项目更新权限。
- [ ] 运行 focused 测试和后端门禁。

## 批次 B：实时连接、文件扫描和 Electron

### Task 5：用户定向 Socket

**Files:**
- Modify: `backend/src/modules/workbench/notifications/notifications.gateway.ts`
- Modify: `backend/src/modules/workbench/knowledge/knowledge.gateway.ts`
- Modify: `backend/src/modules/workbench/extensions/extensions.gateway.ts`
- Test: gateway unit/integration suites

- [ ] 新增两个 Socket 客户端测试，证明员工 A 的通知、NOVA 回答和扩展 payload 不会到员工 B。
- [ ] 所有 gateway 在握手时认证并加入用户或运行房间，publish 只向目标房间发送。
- [ ] 运行 gateway focused 测试。

### Task 6：文件夹扫描权限与 SSE ticket

**Files:**
- Modify: `backend/src/modules/workbench/knowledge/interface/http/knowledge.controller.ts`
- Modify: `backend/src/modules/workbench/knowledge/application/folder-watch.service.ts`
- Modify: `backend/src/modules/iam/interface/http/authentication.guard.ts` or add a dedicated connection-ticket guard
- Modify: `frontend/src/modules/knowledge/api.ts`
- Test: folder watch and knowledge SSE tests

- [ ] 新增任意路径、他人空间、他人 watch 和无效 ticket 的失败测试。
- [ ] 限制扫描到受控根目录，创建、停止、重扫和重试要求文档写权限与空间归属。
- [ ] SSE 在全局 Bearer Guard 前使用一次性 audience ticket，并在消费后绑定用户与 watch。
- [ ] 运行后端 SSE、文件夹测试和前端 API 测试。

### Task 7：Electron 认证链路

**Files:**
- Modify: `desktop/src/main.ts`
- Modify: `desktop/src/knowledge-open.ts`
- Modify: relevant desktop runtime token helpers
- Test: `desktop/src/runtime.test.ts`
- Test: extension/knowledge desktop tests

- [ ] 新增通知、扩展、完成回调和本地原文件请求携带短期 Token 的失败测试。
- [ ] 从受控运行时会话获取 Token，不把长期凭据暴露给 renderer。
- [ ] 运行 Desktop 全量 typecheck 和 test。

## 批次 C：IAM 管理、归属迁移和审计

### Task 8：员工绑定接口和默认员工范围

**Files:**
- Modify: `backend/src/modules/iam/interface/http/admin-users.controller.ts`
- Modify: `backend/src/modules/iam/application/users.service.ts`
- Modify: `backend/src/modules/iam/application/data-scope.service.ts`
- Test: admin users integration and employee progress tests

- [ ] 新增 `/admin/users/assignable-employees` 先于 `:id` 匹配并过滤已绑定、已归档员工的失败测试。
- [ ] 实现静态接口并保护 `user.read` 和 `user.create`。
- [ ] `INVOLVED` 员工范围至少包含本人工作、周计划和参与项目数据。
- [ ] 运行相关后端和前端管理页测试。

### Task 9：删除、归属迁移和审计

**Files:**
- Modify: `backend/src/modules/iam/application/users.service.ts`
- Modify: `backend/src/modules/iam/application/ownership-migration.service.ts`
- Modify: `backend/src/modules/iam/application/roles.service.ts`
- Create: forward Prisma migration adding missing knowledge session owner FK/indexes if schema requires
- Test: ownership migration/users/roles integration suites

- [ ] 新增存在业务引用时即使前端确认也拒绝永久删除的失败测试。
- [ ] 在事务内重新统计归属引用；完成 ownership migration 前普通用户不能进入业务区。
- [ ] 归属应用、幂等记录和审计在同一事务与 advisory lock 中完成，完成前重新扫描全部目标。
- [ ] 安全审计记录 actor、target、before/after、IP、UA、session；角色管理全覆盖。
- [ ] 为 `knowledge_sessions.owner_user_id` 增加用户外键并验证历史数据升级。

## 批次 D：前端认证、合约、交互和性能

### Task 10：统一认证 Fetch 和系统管理路由

**Files:**
- Modify: `frontend/src/lib/http.ts`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/modules/admin/AdminLayout.tsx`
- Test: `frontend/src/lib/__tests__/http-auth.test.ts`
- Test: `frontend/src/router/__tests__/auth-routes.test.tsx`

- [ ] 新增文件或流请求 401 单飞刷新、外部 origin 拒绝和无权限直达 `/admin/*` 的失败测试。
- [ ] 让 raw response/stream fetch 复用刷新协调器，只接受 API 相对路径或受信任 API origin。
- [ ] 系统管理父路由和子页签按权限保护。

### Task 11：合约、主题和客观交互缺陷

**Files:**
- Modify: `frontend/src/modules/workbench/api/__tests__/contracts.test.ts`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/components/dashboard/ReactECharts.tsx`
- Modify: `frontend/src/pages/WorkbenchHome.tsx`
- Modify: `frontend/src/modules/auth/pages/LoginPage.tsx`
- Test: corresponding frontend tests

- [ ] 先保留并复现 `ownerUserId` 合约失败，再同步测试数据和消费者。
- [ ] 新增护眼主题刷新恢复、ECharts handler 更新、Dashboard 跳转/清除筛选和密码按钮键盘聚焦测试。
- [ ] 修复 Zustand persist 解析、事件解绑重绑和交互闭环，不改变已确认视觉方案。

### Task 12：首页图表拆包和最终质量门禁

**Files:**
- Modify: `frontend/src/pages/WorkbenchHome.tsx`
- Modify: dashboard chart imports/components
- Modify: whitespace-only files reported by `git diff --check`

- [ ] 图表使用动态加载并保留固定高度 skeleton，KPI 和快捷入口先渲染。
- [ ] 运行 `pnpm typecheck:contracts` 并确认通过。
- [ ] 运行 backend Prisma validate、lint、build、unit 和 integration。
- [ ] 运行 frontend lint、typecheck、contracts、test 和 build。
- [ ] 运行 desktop typecheck、test 和 Windows smoke 配置测试。
- [ ] 运行 `git diff --check`，确认无格式错误。
