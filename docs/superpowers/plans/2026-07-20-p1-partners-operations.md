# P1-04 合作方、沟通与非项目研发 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐合作方、联系人、协议、沟通记录的完整工作流，并恢复数据库中已经建表但无法使用的非项目研发对象，接入项目、任务、日历和我的工作。

**Architecture:** 先用真实 catalog 测试修复 operations 迁移与 Prisma schema 漂移，再对现有 ManagementModule 做增量增强；PartnerProject 和 Communication.taskId 使用前向迁移，沟通/非项目事项转任务以唯一约束和 advisory lock 保证幂等。前端进入业务库二级工作区和项目上下文，不增加一级导航或第二套日历。

**Tech Stack:** NestJS, Prisma, PostgreSQL, React 18, TanStack Query, Semi Design, Jest, Vitest

---

## Task 1: 恢复已应用 Operations schema 声明

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/test/integration/prisma/operations-catalog.spec.ts`

- [x] 先写真实 PostgreSQL catalog 测试，对照 `20260718050000_operations_p1/migration.sql` 断言六张表、枚举、FK、唯一键和 check constraint。
- [x] 运行 `pnpm --dir backend test:integration -- --runInBand operations-catalog.spec.ts`，确认 Prisma Client 当前无对应 delegate。
- [x] 只恢复既有 SQL 对应模型、enum 和反向关系；禁止新建同名迁移、表或清理已有数据。
- [x] 运行 prisma format/generate、catalog test、migrate status 和 build。
- [x] Commit checkpoint: `fix(prisma): restore operations schema declarations`

## Task 2: 合作方关联与沟通转任务幂等目录

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260720010000_partner_operations_extensions/migration.sql`
- Create: `backend/test/integration/prisma/partner-extensions-catalog.spec.ts`

- [x] 先写 PartnerProject 复合唯一/FK、CommunicationRecord.taskId 唯一和 NonProjectRdItem.taskId 唯一测试。
- [x] 运行目标测试确认 RED。
- [x] 用前向 migration 添加三项，不改历史 migration；补 Prisma 关系。
- [x] 运行 prisma generate、catalog test 和 build。
- [x] Commit checkpoint: `feat(management): add partner and operations links`

## Task 3: 合作方后端完整性

**Files:**
- Modify: `backend/src/modules/workbench/management/interface/http/dto/partners.dto.ts`
- Modify: `backend/src/modules/workbench/management/application/partners.service.ts`
- Modify: `backend/src/modules/workbench/management/interface/http/partners.controller.ts`
- Create: `backend/test/unit/modules/workbench/partners.service.spec.ts`
- Modify: `backend/test/integration/modules/workbench/management.controller.spec.ts`

- [x] 先写真正 partial PATCH、nullable 清空、联系人必须属于 Partner、项目必须 active、按 q/project/followUp 过滤、聚合计数和归档边界测试。
- [x] 先写重复沟通转任务返回 `{task, alreadyExists:true}`、并发只创建一条来源任务测试。
- [x] 运行目标测试确认 RED。
- [x] 拆开当前压缩单行/`any` helper，使用类型安全方法；Partner create/update 原子维护 projectIds，communication update 复用 create 的引用校验。
- [x] 实现 advisory lock + taskId 唯一幂等转换，复用 `TasksService.createTaskInTransaction`。
- [x] 运行目标测试、lint 和 build。
- [ ] Commit: `feat(management): complete partner lifecycle`

## Task 4: 飞书式合作方详情工作区

**Files:**
- Modify: `frontend/src/modules/workbench/api/management.ts`
- Create: `frontend/src/modules/workbench/api/__tests__/management-partners.test.ts`
- Rewrite: `frontend/src/pages/PartnersPage.tsx`
- Create: `frontend/src/pages/__tests__/PartnersPage.test.tsx`
- Modify: `frontend/src/pages/ProjectWorkspacePage.tsx`
- Modify: `frontend/src/pages/__tests__/ProjectWorkspacePage.test.tsx`

- [x] 先写搜索/筛选、SideSheet 深链、编辑/归档、联系人/协议/沟通 CRUD、跟进、转任务幂等反馈与项目关联测试。
- [x] 运行目标 Vitest 确认 RED。
- [x] 用 Semi Design 重做 `/library/governance/partners?recordId=&projectId=`，补齐 child update/archive clients；项目页增加关联合作方区。
- [x] 运行 target tests、typecheck、contracts、lint 和 build。
- [ ] Commit: `feat(frontend): add partner relationship workspace`

## Task 5: 非项目研发领域服务

**Files:**
- Create: `backend/src/modules/workbench/operations/operations.module.ts`
- Create: `backend/src/modules/workbench/operations/application/non-project-rd.service.ts`
- Create: `backend/src/modules/workbench/operations/interface/http/non-project-rd.controller.ts`
- Create: `backend/src/modules/workbench/operations/interface/http/dto/non-project-rd.dto.ts`
- Modify: `backend/src/modules/workbench/workbench.module.ts`
- Create: `backend/test/unit/modules/workbench/non-project-rd.service.spec.ts`
- Create: `backend/test/integration/modules/workbench/operations.controller.spec.ts`

- [x] 先写 TECH_EXPLORATION/NEW_DIRECTION/PLATFORM_TOOL/TECH_DEBT/PATENT/STANDARD_METHOD/TRAINING/TEMPORARY_SUPPORT 固定类型、时间边界、outcome CRUD、项目建议和软归档约束测试。
- [x] 先写“加入我的工作”重复/并发幂等、来源 task 可回到原对象测试。
- [x] 运行目标测试确认 RED。
- [x] 实现 `/api/non-project-rd` 生命周期、outcomes、project-suggestion 与 task 转换；不引入第二个 Calendar service。
- [x] 运行目标测试、lint 和 build。
- [ ] Commit: `feat(operations): add non-project rd lifecycle`

## Task 6: 接入统一日历、我的工作与搜索

**Files:**
- Modify: `backend/src/modules/workbench/calendar/application/calendar.service.ts`
- Modify: `backend/test/unit/modules/workbench/calendar.service.spec.ts`
- Modify: `backend/src/modules/workbench/search/search.module.ts`
- Create: `backend/src/modules/workbench/search/adapters/operations-search.adapter.ts`
- Modify: `backend/test/integration/modules/workbench/search.controller.spec.ts`

- [ ] 先写非项目事项计划起止/截止投影、已归档排除、统一 `NON_PROJECT_RD` source path 和搜索分类测试。
- [ ] 运行目标测试确认 RED。
- [ ] 扩展现有 `/api/calendar/entries` 与 Search adapter registry；“我的工作”通过幂等来源 task 展示，不复制事项。
- [ ] 运行 calendar/search/backend 门禁。
- [ ] Commit: `feat(operations): connect rd work to calendar and search`

## Task 7: 非项目研发前端与业务模板入口

**Files:**
- Create: `frontend/src/modules/workbench/api/operations.ts`
- Create: `frontend/src/modules/workbench/api/__tests__/operations.test.ts`
- Create: `frontend/src/pages/OperationsPage.tsx`
- Create: `frontend/src/pages/__tests__/OperationsPage.test.tsx`
- Modify: `frontend/src/pages/LibraryHomePage.tsx`
- Modify: `frontend/src/router/routes.ts`

- [ ] 先写 `/library/operations?tab=non-project-rd&recordId=`、类型筛选、详情编辑、outcomes、项目建议、加入我的工作和日历深链测试。
- [ ] 运行目标 Vitest 确认 RED。
- [ ] 用 Semi Design 实现列表 + SideSheet 详情；从业务库与项目页进入，不增加一级导航。
- [ ] 若 P1-01D template catalog 已落地，注册合作方、研发申报、风险、面试、非项目研发模板；否则保持显式依赖并先完成对象页，不能造假模板实例。
- [ ] 运行 frontend target tests、typecheck、lint 和 build。
- [ ] Commit: `feat(frontend): add non-project rd workspace`

## Task 8: P1-04 完整验收

- [ ] 运行 Prisma catalog、partners/operations/calendar/search 单元与集成测试。
- [ ] 运行 backend lint/build、frontend check、`git diff --check`。
- [ ] 真实浏览器完成合作方→联系人/协议/沟通→任务与非项目事项→成果→任务→日历全链路，并刷新验证深链。
- [ ] 请求规格复核和质量复核，修复后提交。
- [ ] Commit: `test(operations): verify partner and rd acceptance`
