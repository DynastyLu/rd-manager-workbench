# P0-D 多维表格实施计划

> **For Codex:** REQUIRED SUB-SKILL: Use subagent-driven-development to execute this plan task-by-task. All work is performed directly in the current `rd-manager-workbench` checkout; do not create a worktree.

**Goal:** 交付一个本地单人可用、交互组织接近飞书多维表格的工作区；同一条项目、任务、会议行动项、文档知识、风险决策数据可在表格/看板/日历中使用，编辑后立即回写原业务对象。

**Architecture:** 新增 `DataWorkspace/DataTable/DataField/DataRecord/DataView` 本地模型。自定义表的记录存储为 JSON；五张预置表只保存表结构与视图配置，记录由 source adapter 实时投影现有业务模型，更新也通过对应业务服务回写，因此不存在镜像副本。前端使用统一数据表 API、TanStack Table 网格层、dnd-kit 看板和现有 FullCalendar 日历能力。

**Tech Stack:** NestJS, Prisma/PostgreSQL, React, TypeScript, Semi Design, TanStack Table, dnd-kit, FullCalendar, Vitest, Jest/Supertest.

---

## Task 1：数据契约与持久化模型

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/*_add_data_tables/migration.sql`
- Create: `backend/src/modules/workbench/base/domain/base.types.ts`
- Create: `backend/src/modules/workbench/base/dto/*.ts`
- Test: `backend/src/modules/workbench/base/base.service.spec.ts`

1. 先写失败测试，覆盖默认工作区、五张预置表、自定义字段与自定义记录。
2. 添加工作区、表、字段、记录、视图模型，以及 source/field/view 枚举和必要索引。
3. 运行 Prisma generate 与迁移校验，禁止修改已有迁移历史。

## Task 2：多维表格 API 与真实对象适配器

**Files:**
- Create: `backend/src/modules/workbench/base/base.controller.ts`
- Create: `backend/src/modules/workbench/base/base.service.ts`
- Create: `backend/src/modules/workbench/base/base.module.ts`
- Create: `backend/src/modules/workbench/base/adapters/*.ts`
- Modify: `backend/src/modules/workbench/workbench.module.ts`
- Test: `backend/test/base.integration-spec.ts`

1. 先写 API 失败测试：工作区/表/字段/记录/视图 CRUD、删除约束、参数校验。
2. 默认打开时幂等创建“研发工作台”和五张预置表，不创建业务记录副本。
3. 为项目、任务、会议行动项、文档知识、风险决策实现读写适配器。
4. 任务状态与截止时间必须调用现有任务更新逻辑，以保持“我的工作”、日历和提醒同步。
5. 返回统一记录结构 `{ id, values, sourceType, sourceId, sourcePath, createdAt, updatedAt }`。

## Task 3：前端数据客户端与工作区骨架

**Files:**
- Create: `frontend/src/modules/base/types.ts`
- Create: `frontend/src/modules/base/api.ts`
- Create: `frontend/src/modules/base/hooks.ts`
- Create: `frontend/src/modules/base/components/BaseSidebar.tsx`
- Create: `frontend/src/modules/base/components/BaseToolbar.tsx`
- Modify: `frontend/src/pages/LibraryHomePage.tsx`
- Create: `frontend/src/pages/LibraryHomePage.less`
- Test: `frontend/src/modules/base/__tests__/*.test.tsx`

1. 先写失败测试，覆盖加载、空态、错误重试、切换表、创建自定义表和新增字段。
2. 实现左侧表空间/数据表树、顶部视图标签和工具栏、中央内容区、右侧记录详情抽屉。
3. 使用 Semi Design 视觉体系，信息密度、留白、选中态和交互层级参考飞书，不照搬品牌素材。

## Task 4：网格视图与行内编辑

**Files:**
- Create: `frontend/src/modules/base/components/GridView.tsx`
- Create: `frontend/src/modules/base/components/FieldEditor.tsx`
- Create: `frontend/src/modules/base/components/FieldManager.tsx`
- Test: `frontend/src/modules/base/__tests__/GridView.test.tsx`

1. 使用 TanStack Table 实现动态列、主字段冻结、显示/隐藏和列顺序。
2. 支持文本、数字、日期、单选、多选、复选、链接、附件、关联字段编辑。
3. 支持查询、字段筛选、排序和单字段分组；保存至视图配置。
4. 预置记录点击时使用 `sourcePath` 打开原对象详情。

## Task 5：看板、日历、表单视图

**Files:**
- Create: `frontend/src/modules/base/components/KanbanView.tsx`
- Create: `frontend/src/modules/base/components/CalendarView.tsx`
- Create: `frontend/src/modules/base/components/FormView.tsx`
- Create: `frontend/src/modules/base/components/ViewManager.tsx`
- Test: `frontend/src/modules/base/__tests__/AlternateViews.test.tsx`

1. 看板按单选/状态字段分组，使用 dnd-kit 拖动后更新同一记录。
2. 日历按用户选择的日期字段展示记录，并能打开详情。
3. 表单从字段定义生成录入表单；系统预置表禁止用表单制造镜像记录。
4. 视图新增、重命名、配置保存和删除均持久化。

## Task 6：联调与验收

**Files:**
- Modify: `frontend/src/pages/__tests__/WorkspaceDirectoryPages.test.tsx`
- Modify: `docs/product/2026-07-18-local-feishu-style-functional-backlog.md`
- Create: `docs/product/2026-07-19-p0d-multidimensional-base-delivery.md`

1. 运行后端 unit/integration/e2e、lint、build 和前端 test/typecheck/lint/build。
2. 在真实 PostgreSQL 应用迁移并启动 4311/4312 服务。
3. 浏览器完成：预置任务表编辑截止时间和状态、我的工作/日历核对、看板拖动、网格回看、自定义表单新增记录。
4. 进行代码审查，修复高/中风险问题后再更新交付文档；没有验证证据不得标记完成。
