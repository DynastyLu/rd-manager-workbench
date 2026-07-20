# P1-03 数据安全、备份恢复与审计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在本地 PostgreSQL 与附件存储上交付可验证、可回滚的自动/手动备份，以及不可变审计和数据健康检查。

**Architecture:** Nest 新增独立 governance 边界；备份使用固定参数的 `pg_dump`、流式文件快照和版本化 manifest，恢复由 Electron 主进程持有维护令牌并在 API 停止后调用 maintenance CLI。数据库写入与审计同事务，文件与数据库恢复通过 staging、journal 和恢复前快照形成补偿事务。

**Tech Stack:** NestJS, Prisma, PostgreSQL 15+, Node.js streams/child_process, Electron IPC, React 18, Semi Design, Jest, Vitest

---

## Task 1: 治理数据目录与不可变约束

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260720020000_data_governance/migration.sql`
- Create: `backend/test/integration/prisma/data-governance-catalog.spec.ts`

- [x] 先写 catalog 测试，断言 `governance_settings`、`backup_records`、`restore_preflights`、`audit_logs` 的列、枚举、索引与 AuditLog UPDATE/DELETE 拒绝 trigger。
- [x] 运行 `pnpm --dir backend test:integration -- --runInBand data-governance-catalog.spec.ts`，确认 RED。
- [x] 在 Prisma schema 与前向 migration 中实现规格模型；自动备份日期建立幂等唯一约束，审计表 trigger 只允许 INSERT。
- [x] 运行 `pnpm --dir backend prisma:generate`、目标集成测试与 `pnpm --dir backend build`。
- [ ] Commit: `feat(governance): add backup and audit catalog`

## Task 2: 安全文件系统与进程执行器

**Files:**
- Modify: `backend/src/infrastructure/storage/storage.port.ts`
- Modify: `backend/src/infrastructure/storage/local-storage.adapter.ts`
- Create: `backend/src/modules/workbench/governance/infrastructure/backup-filesystem.ts`
- Create: `backend/src/modules/workbench/governance/infrastructure/process-runner.ts`
- Create: `backend/test/unit/modules/workbench/backup-filesystem.spec.ts`
- Create: `backend/test/unit/modules/workbench/process-runner.spec.ts`

- [x] 先覆盖 POSIX/Windows 路径逃逸、symlink、重复 manifest path、流式 hash/copy、原子 rename、超时和 `shell:false` 参数白名单的失败测试。
- [x] 运行目标测试，确认现有适配器无法通过。
- [x] 扩展 StoragePort 的 stream/stat/walk/statfs/rename 能力；以 `path.relative` 和 `lstat/realpath` 双重 containment 取代字符串前缀判断。
- [x] 实现只接受服务端构造 argv 的 ProcessRunner，截断并净化 stderr，不把 URL/secret 写入日志。
- [x] 运行目标测试、storage integration test、lint 和 build。
- [ ] Commit: `feat(governance): harden backup filesystem and process runner`

## Task 3: Manifest、手动备份与验证

**Files:**
- Create: `backend/src/modules/workbench/governance/application/backup-manifest.ts`
- Create: `backend/src/modules/workbench/governance/application/backups.service.ts`
- Create: `backend/src/modules/workbench/governance/interface/http/backups.controller.ts`
- Create: `backend/src/modules/workbench/governance/governance.module.ts`
- Modify: `backend/src/modules/workbench/workbench.module.ts`
- Modify: `backend/src/config/env.schema.ts`
- Create: `backend/test/unit/modules/workbench/backups.service.spec.ts`
- Create: `backend/test/integration/modules/workbench/backups.controller.spec.ts`

- [x] 先写 dump 失败、文件复制失败、manifest 篡改、并发锁、成功状态转换与敏感错误脱敏测试。
- [x] 运行目标测试，确认 RED。
- [x] 实现 `POST/GET/verify/DELETE /api/governance/backups`，固定使用 custom dump、临时目录、fsync/rename 和 SHA-256 manifest。
- [x] 使用 advisory lock + 进程 mutex；只有 dump、文件和 manifest 二次校验都成功才标记 CREATED/VERIFIED。
- [x] 运行单元/集成测试、build、`git diff --check`。
- [ ] Commit: `feat(governance): add verified manual backups`

## Task 4: 自动备份与保留策略

**Files:**
- Create: `backend/src/modules/workbench/governance/application/backup-scheduler.service.ts`
- Create: `backend/src/modules/workbench/governance/application/governance-settings.service.ts`
- Create: `backend/src/modules/workbench/governance/interface/http/governance-settings.controller.ts`
- Create: `backend/test/unit/modules/workbench/backup-scheduler.service.spec.ts`

- [x] 先用 fake timers 覆盖本地时区、重启幂等、同日三次上限、成功日期推进、保护快照不清理。
- [x] 运行测试，确认 RED。
- [x] 仿照 ReminderScheduler 实现 `setInterval().unref()`、advisory lock 与关闭清理；保留策略只删除允许删除的成功备份。
- [x] 运行目标测试及 `pnpm --dir backend test:unit -- --runInBand`。
- [ ] Commit: `feat(governance): schedule retained local backups`

## Task 5: 恢复预检、维护模式与回滚引擎

**Files:**
- Create: `backend/src/modules/workbench/governance/application/restore-preflight.service.ts`
- Create: `backend/src/modules/workbench/governance/infrastructure/restore-journal.ts`
- Create: `backend/src/modules/workbench/governance/infrastructure/restore-engine.ts`
- Create: `backend/src/modules/workbench/governance/interface/http/restore.controller.ts`
- Create: `backend/src/maintenance.ts`
- Modify: `backend/package.json`
- Create: `backend/test/unit/modules/workbench/restore-preflight.service.spec.ts`
- Create: `backend/test/integration/modules/workbench/restore-engine.spec.ts`

- [x] 先覆盖 token 过期/复用、TOCTOU manifest 变化、空间不足、工具版本不兼容、dump/文件交换失败和回滚再失败测试。
- [x] 运行目标测试，确认 RED。
- [x] 实现只读 preflight、10 分钟单次 confirmation token、PRE_RESTORE 快照、staging、journal 与固定 `pg_restore --single-transaction --exit-on-error --clean --if-exists --no-owner --no-privileges`。
- [x] 维护 CLI 在 Prisma 断开后运行；成功后执行 migration fingerprint、FK、核心计数和文件 hash 验证；失败按 journal 恢复 DB 和目录。
- [ ] 用临时 storage root 和独立测试数据库跑一次真实备份→修改→恢复演练。
- [ ] Commit: `feat(governance): add preflighted rollback-safe restore`

## Task 6: 审计与健康检查

**Files:**
- Create: `backend/src/modules/workbench/governance/application/audit-log.service.ts`
- Create: `backend/src/modules/workbench/governance/application/data-health.service.ts`
- Create: `backend/src/modules/workbench/governance/interface/http/audit-logs.controller.ts`
- Create: `backend/src/modules/workbench/governance/interface/http/data-health.controller.ts`
- Create: `backend/src/common/interceptors/audit.interceptor.ts`
- Modify: `backend/src/shared/errors/error-codes.ts`
- Create: `backend/test/unit/modules/workbench/audit-log.service.spec.ts`
- Create: `backend/test/unit/modules/workbench/data-health.service.spec.ts`

- [x] 先写字段值/正文/手机号/URL query/凭据永不入审计、写失败不伪装成功、健康检查识别 schema drift/缺失文件/最近备份的测试。
- [x] 运行测试，确认 RED。
- [x] 实现全局写请求字段名审计和领域精确审计；业务变更与审计必须接收同一个 Prisma transaction。
- [x] 实现快速 health 与显式深度文件扫描，检查只读，不自动修复。
- [x] 运行目标测试、integration suite、lint 和 build。
- [ ] Commit: `feat(governance): add immutable audit and data health`

## Task 7: Electron 恢复编排

**Files:**
- Create: `desktop/src/restore-orchestrator.ts`
- Create: `desktop/src/backup-settings.ts`
- Create: `desktop/src/restore-orchestrator.test.ts`
- Modify: `desktop/src/main.ts`
- Modify: `desktop/src/preload.ts`
- Modify: `frontend/src/types/env.d.ts`

- [x] 先写 IPC allowlist、renderer 看不到 maintenance token、停止后端→运行 CLI→重启、失败重启与错误净化测试。
- [x] 运行 `pnpm --dir desktop test`，确认 RED。
- [x] 主进程生成随机维护令牌，只暴露 `chooseBackupDirectory()` 与 `restoreBackup(id, expectedHash)`；禁止通用 shell/path/fetch IPC。
- [ ] 执行 desktop test/typecheck/build dry-run。（test/typecheck 已完成；统一打包 dry-run 待全仓并行代码收口）
- [ ] Commit: `feat(desktop): orchestrate safe local restore`

## Task 8: 数据安全设置页面

**Files:**
- Create: `frontend/src/modules/workbench/api/governance.ts`
- Create: `frontend/src/pages/DataGovernancePage.tsx`
- Create: `frontend/src/modules/workbench/components/governance/BackupPanel.tsx`
- Create: `frontend/src/modules/workbench/components/governance/RestorePreflightDialog.tsx`
- Create: `frontend/src/modules/workbench/components/governance/DataHealthPanel.tsx`
- Create: `frontend/src/modules/workbench/components/governance/AuditLogTable.tsx`
- Create: `frontend/src/pages/__tests__/DataGovernancePage.test.tsx`
- Modify: `frontend/src/router/routes.ts`
- Modify: `frontend/src/pages/WorkbenchSettings.tsx`

- [x] 先写设置入口、备份步骤、强确认、状态轮询、浏览器/Electron 分支、审计过滤和健康空/错态测试。
- [x] 运行目标 Vitest，确认 RED。
- [x] 用 Semi Design 实现 `/settings/data-governance` 四页签，不增加一级导航。
- [x] 运行 frontend typecheck、目标测试、build 与 Playwright 备份/预检 smoke。
- [ ] Commit: `feat(frontend): add data governance workspace`

## Task 9: 完整恢复验收

- [ ] 在临时数据库/目录运行成功恢复、数据库失败、文件交换失败、回滚失败四种演练并保存无敏感数据日志。
- [ ] 运行 `pnpm --dir backend lint && pnpm --dir backend test -- --runInBand && pnpm --dir backend build`。
- [ ] 运行 `pnpm --dir frontend check`、`pnpm --dir desktop test && pnpm --dir desktop typecheck`、`git diff --check`。
- [ ] 请求规格复核和质量复核；只修复本计划范围问题。
- [ ] Commit: `test(governance): verify backup restore acceptance`
