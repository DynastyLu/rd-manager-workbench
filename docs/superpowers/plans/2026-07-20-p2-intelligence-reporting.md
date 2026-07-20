# P2-01 行业情报、资源负荷与统计报表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可追溯的人工行业情报闭环、13 周资源负荷和基于真实业务数据的五类统计报表。

**Architecture:** Intelligence、Operations、Reporting 是三个独立 Nest 边界；情报用稳定实体承载来源/去重/转换/日报，资源负荷恢复已应用迁移中的模型，报表只读聚合真实业务表并复用流式导出器。前端全部进入业务库二级路由，不增加一级导航。

**Tech Stack:** NestJS, Prisma, PostgreSQL, React 18, TanStack Query, Semi Design, ECharts, CSV/XLSX exporter, Jest, Vitest

---

## Task 1: 修复 Operations schema 漂移

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/test/integration/prisma/operations-catalog.spec.ts`

- [ ] 先写真实 catalog 测试，对照 `20260718050000_operations_p1/migration.sql` 断言六张表、枚举、FK、唯一键与 check constraint。
- [ ] 运行测试确认 RED（Prisma Client 当前无 delegate）。
- [ ] 只把既有 SQL 对应 enum/model/反向关系补回 schema；不得重复创建表或修改已应用 migration。
- [ ] 运行 prisma format/generate、catalog test 和 build。
- [ ] Commit: `fix(prisma): reconcile operations catalog`

## Task 2: 情报目录与去重约束

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260720030000_intelligence_reporting/migration.sql`
- Create: `backend/test/integration/prisma/intelligence-catalog.spec.ts`

- [ ] 先写 topics/sources/plans/runs/items/occurrences/joins/conversions/briefs 的 catalog 测试，覆盖 content hash 和四类转换唯一约束。
- [ ] 运行目标测试确认 RED。
- [ ] 实现规格中的模型、枚举、软归档、索引和约束；不复制历史分支的旧路由/旧导航。
- [ ] 运行 prisma generate、目标测试和 build。
- [ ] Commit: `feat(intelligence): add intelligence and reporting catalog`

## Task 3: 主题、来源、计划与人工运行

**Files:**
- Create: `backend/src/modules/workbench/intelligence/intelligence.module.ts`
- Create: `backend/src/modules/workbench/intelligence/application/intelligence-catalog.service.ts`
- Create: `backend/src/modules/workbench/intelligence/application/intelligence-runs.service.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/intelligence.controller.ts`
- Create: `backend/src/modules/workbench/intelligence/interface/http/dto/intelligence.dto.ts`
- Modify: `backend/src/modules/workbench/workbench.module.ts`
- Create: `backend/test/integration/modules/workbench/intelligence.controller.spec.ts`

- [ ] 先写 CRUD/partial update/归档边界、MANUAL/DAILY/WEEKLY 参数校验、运行失败可追踪测试。
- [ ] 运行测试确认 RED。
- [ ] 实现分页、筛选、软归档和 P2-01 人工粘贴运行；不得在此任务联网 fetch。
- [ ] 运行目标测试、lint 和 build。
- [ ] Commit: `feat(intelligence): manage sources topics and collection runs`

## Task 4: 情报卡、去重、关联与四种转换

**Files:**
- Create: `backend/src/modules/workbench/intelligence/application/intelligence-items.service.ts`
- Create: `backend/src/modules/workbench/intelligence/application/intelligence-conversions.service.ts`
- Modify: `backend/src/modules/workbench/tasks/application/tasks.service.ts`
- Modify: `backend/src/modules/workbench/management/application/risks.service.ts`
- Modify: `backend/src/modules/workbench/management/application/meetings.service.ts`
- Modify: `backend/src/modules/workbench/content/application/documents.service.ts`
- Create: `backend/test/unit/modules/workbench/intelligence-conversions.service.spec.ts`

- [x] 先写 URL 规范化、无 URL hash、重复 occurrence 不覆盖编辑正文、项目/主题归属与四种转换重复调用返回同目标的测试。
- [x] 运行目标测试确认 RED。
- [x] 给四个目标领域暴露 transaction-aware 创建入口；IntelligenceConversion 与目标对象在同一事务中创建。
- [x] 运行目标单元/集成测试和 build。
- [ ] Commit: `feat(intelligence): add deduplicated cards and conversions`

## Task 5: 日报与周报快照

**Files:**
- Create: `backend/src/modules/workbench/intelligence/application/intelligence-briefs.service.ts`
- Create: `backend/test/unit/modules/workbench/intelligence-briefs.service.spec.ts`

- [x] 先写 kind/date 唯一、顺序、快照不随卡片变化、已归档卡片仍可读历史简报测试。
- [x] 运行测试确认 RED。
- [x] 实现 briefs CRUD、排序和 snapshot 白名单。
- [x] 运行目标测试、lint 和 build。
- [ ] Commit: `feat(intelligence): add immutable intelligence briefs`

## Task 6: 情报工作区前端

**Files:**
- Create: `frontend/src/modules/workbench/api/intelligence.ts`
- Create: `frontend/src/pages/IntelligencePage.tsx`
- Create: `frontend/src/pages/IntelligenceBriefsPage.tsx`
- Create: `frontend/src/pages/__tests__/IntelligencePage.test.tsx`
- Create: `frontend/src/pages/__tests__/IntelligenceBriefsPage.test.tsx`
- Modify: `frontend/src/pages/LibraryHomePage.tsx`
- Modify: `frontend/src/router/routes.ts`

- [x] 先写 `/library/intelligence` 与 briefs 二级入口、四栏 CRUD、运行历史、四种转换、来源链和完整空/错态测试。
- [x] 运行目标 Vitest 确认 RED。
- [x] 用 Semi Design 实现工作区、SideSheet 详情和日报编辑器，不增加一级导航。
- [x] 运行 typecheck、目标测试、build 和浏览器 smoke。
- [ ] Commit: `feat(frontend): add intelligence workspace`

## Task 7: 资源档案与 13 周负荷

**Files:**
- Create: `backend/src/modules/workbench/operations/operations.module.ts`
- Create: `backend/src/modules/workbench/operations/application/resources.service.ts`
- Create: `backend/src/modules/workbench/operations/interface/http/resources.controller.ts`
- Create: `backend/test/unit/modules/workbench/resources.service.spec.ts`
- Create: `frontend/src/modules/workbench/api/operations.ts`
- Create: `frontend/src/pages/OperationsPage.tsx`
- Create: `frontend/src/pages/__tests__/OperationsPage.test.tsx`

- [x] 先写容量、周一归一化、引用类型存在性、归档对象拒绝、13 周上限、超载百分比精度测试。
- [x] 运行后端和前端目标测试确认 RED。
- [x] 实现 profile/skill/load CRUD 与 summary API；前端在 `/library/operations?tab=resources` 展示可编辑矩阵和可访问表格。
- [x] 运行 backend/frontend 目标门禁。
- [ ] Commit: `feat(operations): add resource load workspace`

## Task 8: 五类真实报表与导出

**Files:**
- Create: `backend/src/modules/workbench/reporting/reporting.module.ts`
- Create: `backend/src/modules/workbench/reporting/application/reports.service.ts`
- Create: `backend/src/modules/workbench/reporting/interface/http/reports.controller.ts`
- Create: `backend/test/unit/modules/workbench/reports.service.spec.ts`
- Create: `frontend/src/modules/workbench/api/reports.ts`
- Create: `frontend/src/pages/ReportsPage.tsx`
- Create: `frontend/src/pages/__tests__/ReportsPage.test.tsx`

- [x] 先写 366 天上限、UTC week/month bucket、空数据、项目组合/任务/风险/资源/情报聚合和导出内容一致测试。
- [x] 运行目标测试确认 RED。
- [x] 实现五类只读聚合与同源 CSV/XLSX 导出；当前 P1-01C 尚无通用 exporter，使用共享安全行模型并补 CSV/XLSX 一致性与导出审计测试。
- [x] 前端 `/library/reports` 提供五页签、表格、可访问摘要、筛选与导出状态，不使用假数据。
- [x] 运行 backend/frontend 目标门禁和浏览器 smoke。
- [ ] Commit: `feat(reporting): add operational reports and exports`

## Task 9: P2-01 完整门禁

- [ ] 运行 Prisma catalog、intelligence/operations/reporting 全量单元和集成测试。
- [ ] 运行 `pnpm --dir backend lint && pnpm --dir backend build`、`pnpm --dir frontend check`、`git diff --check`。
- [ ] 用一组真实项目/任务/风险/卡片/资源数据验证转换幂等、日报快照、负荷和五类报表。
- [ ] 请求规格复核和质量复核，修复后提交。
- [ ] Commit: `test(workbench): verify intelligence and reporting acceptance`
