# P2-02 短信、AI 与外部日历/云盘 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不削弱本地单人核心能力的前提下，交付默认关闭、显式授权、凭据不出 Electron 主进程的短信、AI、CalDAV 与 WebDAV 集成。

**Architecture:** 后端保存 public config、权限和运行状态机，Electron `safeStorage` 保存密钥并通过严格 preload allowlist 执行 provider adapter；所有外部调用先创建 ExtensionRun，再由带一次性 token 与 payload hash 的回调完成。AI/同步都采用 prepare→用户确认→execute/commit 两阶段流程。

**Tech Stack:** Electron safeStorage/IPC, NestJS, Prisma, Socket.IO, Zod/class-validator, provider official SDK/HTTP APIs, React 18, Semi Design, Jest, Vitest

---

## Task 1: 官方契约研究与版本锁定

**Files:**
- Create: `docs/research/2026-07-20-external-provider-contracts.md`
- Modify: `docs/superpowers/specs/2026-07-20-p2-external-services-design.md`

- [x] 只查阅 OpenAI、阿里云短信、CalDAV/WebDAV 标准或服务商官方文档，记录请求/响应、认证、限流、错误分类、隐私和 SDK/version。
- [x] 对 OpenAI 使用 `openai-docs` skill；技术检索只引用第一方来源。
- [x] 固定 provider contract 与超时/大小/重试策略；没有官方依据的字段不得进入生产 adapter。
- [ ] Commit: `docs: lock external provider contracts`

## Task 2: 外部能力数据目录与状态机

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260720040000_external_extensions/migration.sql`
- Create: `backend/test/integration/prisma/extensions-catalog.spec.ts`
- Create: `backend/src/modules/workbench/extensions/domain/extension-state-machine.ts`
- Create: `backend/test/unit/modules/workbench/extension-state-machine.spec.ts`

- [x] 先写 Profile/Run/Recipient/Delivery/ObjectLink catalog 和 PENDING→RUNNING→终态合法转换测试。
- [x] 运行测试确认 RED。
- [x] 实现 schema、迁移、索引、手机号 mask 约束和纯状态机；ExtensionRun 不保存正文。
- [x] 运行 prisma generate、目标测试和 build。
- [ ] Commit: `feat(extensions): add secure extension catalog`

## Task 3: Electron 凭据保险箱与受限桥

**Files:**
- Create: `desktop/src/credential-vault.ts`
- Create: `desktop/src/credential-vault.test.ts`
- Create: `desktop/src/extensions/contracts.ts`
- Create: `desktop/src/extensions/provider-registry.ts`
- Modify: `desktop/src/preload.ts`
- Modify: `desktop/src/main.ts`
- Modify: `frontend/src/types/env.d.ts`

- [x] 先写 safeStorage 不可用、0600/原子写、损坏 vault、renderer 无读取 secret/任意 IPC/fetch、provider/operation/payload allowlist 测试。
- [x] 运行 desktop tests 确认 RED。
- [x] 实现只允许 put/has/delete 的 vault 和 typed execute bridge；生产日志不得包含 secretObject。
- [x] 运行 desktop test/typecheck 和 preload API 快照测试。
- [ ] Commit: `feat(desktop): add encrypted extension credential broker`

## Task 4: Profile、Run 与本地安全 Provider

**Files:**
- Create: `backend/src/modules/workbench/extensions/extensions.module.ts`
- Create: `backend/src/modules/workbench/extensions/application/extensions.service.ts`
- Create: `backend/src/modules/workbench/extensions/interface/http/extensions.controller.ts`
- Create: `backend/test/integration/modules/workbench/extensions.controller.spec.ts`
- Create: `desktop/src/extensions/providers/local-preview-sms.ts`
- Create: `desktop/src/extensions/providers/local-manual-ai.ts`
- Modify: `backend/src/modules/workbench/workbench.module.ts`

- [x] 先写 publicConfig 递归 secret key 拒绝、禁用/无凭据拒绝、一次性 run token、payload hash 与重复 complete 幂等测试。
- [x] 运行测试确认 RED。
- [x] 实现 Profile CRUD/连接测试、Run prepare/complete 和 LOCAL_PREVIEW/LOCAL_MANUAL；预览必须标记 PREVIEW/REJECTED，不能伪造发送成功。
- [x] 运行 backend/desktop 目标门禁。
- [ ] Commit: `feat(extensions): add profiles runs and local providers`

## Task 5: 短信调度与真实 Provider

**Files:**
- Create: `backend/src/modules/workbench/extensions/application/sms-delivery.service.ts`
- Create: `backend/src/modules/workbench/extensions/application/extension-scheduler.service.ts`
- Modify: `backend/src/modules/workbench/notifications/application/reminder-scheduler.service.ts`
- Modify: `backend/src/modules/workbench/notifications/notifications.gateway.ts`
- Create: `desktop/src/extensions/providers/aliyun-sms.ts`
- Create: `backend/test/unit/modules/workbench/sms-delivery.service.spec.ts`
- Create: `desktop/src/extensions/providers/aliyun-sms.test.ts`

- [x] 先写 important+SMS+recipient+template 四条件、页面通知不被阻塞、离线重试、4xx 不重试、429/5xx 指数退避、日志 mask 测试。
- [x] 运行目标测试确认 RED。
- [x] 实现 delivery 状态机、`/extensions` socket request、Electron provider 和一次性完成回调；providerMessageId/成本元数据白名单入审计。
- [x] 运行目标测试、backend build、desktop typecheck。
- [ ] Commit: `feat(extensions): deliver important reminders by sms`

## Task 6: AI 摘要与知识问答

**Files:**
- Create: `backend/src/modules/workbench/extensions/application/ai-context.service.ts`
- Create: `backend/src/modules/workbench/extensions/application/ai-adoption.service.ts`
- Create: `desktop/src/extensions/providers/openai-responses.ts`
- Create: `backend/test/unit/modules/workbench/ai-context.service.spec.ts`
- Create: `desktop/src/extensions/providers/openai-responses.test.ts`

- [x] 先写 40k/50k 字符限制、最多 8 片段、citation allowlist、正文不入 Run、未确认不执行、未采纳不写业务对象测试。
- [x] 运行测试确认 RED。
- [x] 实现 prepare 返回数据离开本机摘要与 confirmation hash；执行 OpenAI Responses typed schema，拒绝未知 citation；采纳复用现有会议/文档/任务 API。
- [x] 运行 backend/desktop 目标测试和敏感信息扫描。
- [ ] Commit: `feat(extensions): add consented ai summaries and knowledge qa`

## Task 7: CalDAV/WebDAV 预检与冲突提交

**Files:**
- Create: `backend/src/modules/workbench/extensions/application/external-sync.service.ts`
- Create: `desktop/src/extensions/providers/caldav.ts`
- Create: `desktop/src/extensions/providers/webdav.ts`
- Create: `backend/test/unit/modules/workbench/external-sync.service.spec.ts`
- Create: `desktop/src/extensions/providers/caldav.test.ts`
- Create: `desktop/src/extensions/providers/webdav.test.ts`

- [x] 先写默认 pull-only、派生日程只读、remote root 路径逃逸、跨 host redirect、hash/version 冲突与三种冲突选择测试。
- [x] 运行目标测试确认 RED。
- [x] 实现 preflight 只返回 add/update/conflict；commit 校验 preflight hash 后写入，失败不修改本地对象。
- [x] 运行 backend/desktop 目标门禁。
- [ ] Commit: `feat(extensions): add calendar and drive sync preflight`

## Task 8: 外部能力设置与业务入口

**Files:**
- Create: `frontend/src/modules/workbench/api/extensions.ts`
- Create: `frontend/src/pages/ExtensionsSettingsPage.tsx`
- Create: `frontend/src/modules/workbench/components/extensions/AiConsentDialog.tsx`
- Create: `frontend/src/modules/workbench/components/extensions/SyncPreflightDialog.tsx`
- Create: `frontend/src/pages/__tests__/ExtensionsSettingsPage.test.tsx`
- Modify: `frontend/src/pages/WorkbenchSettings.tsx`
- Modify: `frontend/src/router/routes.ts`
- Modify: `frontend/src/pages/MeetingsPage.tsx`
- Modify: `frontend/src/pages/KnowledgeHomePage.tsx`

- [x] 先写四页签、凭据不可用、连接测试、数据离开本机确认、运行日志 mask、AI 采纳与同步冲突测试。
- [x] 运行目标 Vitest 确认 RED。
- [x] 用 Semi Design 实现 `/settings/extensions`；没有 Electron/凭据时清楚降级且不影响本地功能。
- [x] 运行 frontend typecheck/test/build 和浏览器 smoke。
- [ ] Commit: `feat(frontend): add external capability settings`

当前进度：`/settings/extensions` 四页签、专用配置表单、凭据可用性、连接测试二次确认、脱敏运行历史和短信收件人保险箱 CRUD 已落盘；会议纪要、文档摘要、知识问答使用 prepare→confirm→execute→complete→显式 adopt，CalDAV/WebDAV 使用服务端权威 session prepare→Electron provider→READY preflight→逐项冲突决策→commit。浏览器模式明确禁用真实凭据与外部执行。目标 API/组件/页面测试、typecheck、contracts、lint、build 与浏览器 smoke 已通过。

## Task 9: P2-02 安全与打包验收

- [ ] 搜索 PostgreSQL、备份、日志、renderer bundle，确认不存在测试凭据、完整手机号或正文。
- [ ] 运行 backend/frontend/desktop 全量门禁和 Electron 打包 smoke。
- [ ] 用 mock providers 完成 SMS 重试、AI 引用、CalDAV/WebDAV 冲突全链路；真实凭据只由用户在设置页执行连接测试。
- [ ] 请求安全/规格/质量复核，修复后提交。
- [ ] Commit: `test(extensions): verify secure external integrations`
