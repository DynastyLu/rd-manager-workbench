# P1-03 数据安全、备份恢复与审计设计

## 1. 目标

交付本机 PostgreSQL 与文件目录的自动/手动备份、恢复前预检、失败回滚、不可变审计日志和数据健康检查。任何恢复失败都必须尽最大可能回到操作前状态，并保留可诊断证据。

## 2. 方案选择

1. 应用层逐表 JSON 导出：跨版本可读但难以保持关系、序列、枚举和大文件一致性。
2. 直接复制 PostgreSQL 数据目录：要求停库并绑定 PostgreSQL 安装布局，风险过高。
3. `pg_dump` custom format + 文件 manifest + `pg_restore`：由 PostgreSQL 官方工具维护关系一致性，文件用 SHA-256 清单验证。

采用方案 3。所有进程参数由服务端固定构造，`spawn(..., { shell: false })`；HTTP 不能提供 executable、数据库 URL 或任意目录。

## 3. 数据模型

```text
GovernanceSetting(
  id singleton, autoBackupEnabled, autoBackupTimeLocal HH:mm,
  retentionDays 1..365, lastAutoBackupLocalDate?, updatedAt
)
BackupRecord(
  id, kind MANUAL|SCHEDULED|PRE_RESTORE, status CREATING|CREATED|VERIFIED|RESTORING|RESTORED|FAILED,
  relativeDirectory, schemaVersion, manifestSha256?, databaseSha256?, fileCount, byteSize,
  failureCode?, failureMessage?, createdAt, verifiedAt?, restoredAt?
)
RestorePreflight(
  id, backupId, manifestSha256, status READY|INVALID|EXPIRED|CONSUMED,
  warnings Json, summary Json, confirmationHash, expiresAt, createdAt
)
AuditLog(
  id, action, entityType, entityId?, outcome SUCCEEDED|FAILED,
  changedFields String[], metadata Json, traceId?, occurredAt
)
```

AuditLog 不允许 PATCH/DELETE。metadata 使用字段白名单，只允许计数、状态、对象类型、provider ID、文件大小、错误码和哈希；禁止请求正文、文档正文、手机号、URL query、数据库 URL、令牌和密钥。

## 4. 备份目录与 manifest

固定根：`${LOCAL_STORAGE_ROOT}/backups/<UTC timestamp>-<backupId>/`。

```text
database.dump
files/                 # files/ 下真实版本文件的快照
manifest.json
```

manifest 包含 `formatVersion=1`、应用版本、Prisma migration head、创建时间、数据库 dump 和每个文件的 POSIX 相对路径/大小/SHA-256。拒绝绝对路径、`..`、重复路径、symlink 和逃逸 root 的解析结果。manifest 写入临时文件后 fsync/rename；BackupRecord 只有在 dump、文件复制、manifest 与最终校验全部成功后进入 CREATED。

## 5. 手动与自动备份

- `POST /api/governance/backups` 创建手动备份；同一时刻只允许一个备份/恢复作业，使用 PostgreSQL advisory lock 和进程内 mutex。
- 自动调度器每分钟检查本地时区时间；当 enabled、到达 `HH:mm` 且 `lastAutoBackupLocalDate` 不是今天时创建 SCHEDULED 备份。
- 成功后在事务内更新日期；失败不更新，下一分钟允许重试但同一天最多 3 次。
- 保留策略只清理 VERIFIED/CREATED 且不是最近一次成功、不是 PRE_RESTORE 保护证据的旧目录；先记录审计再删除。
- `GET /api/governance/backups`、`GET /:id`、`POST /:id/verify`、`DELETE /:id`。RESTORED/PRE_RESTORE/RESTORING 记录不可删除。

## 6. 恢复预检与确认

`POST /api/governance/backups/:id/preflight` 只读执行：

1. 验证记录状态、manifest schema、migration head、路径、大小和全部 SHA-256。
2. 检查数据库 dump 可读，并运行 `pg_restore --list`，不连接目标数据库。
3. 统计数据库/文件大小、文件数量、当前数据健康状态和覆盖警告。
4. 生成 10 分钟有效的一次性 `RestorePreflight` 与明文 confirmationToken；数据库只保存 token SHA-256。

`POST /api/governance/backups/:id/restore` 需要 `{ preflightId, confirmationToken, confirmationText: '恢复本地工作台' }`。任何 manifest 变化、过期或重复使用都拒绝。

## 7. 恢复与失败回滚

1. 获取全局维护锁，暂停 reminder/自动备份调度并拒绝新的写请求。
2. 创建 PRE_RESTORE 完整备份；失败则原恢复不开始。
3. 把目标备份文件复制到 `restore-staging/<jobId>` 并再次验证。
4. 执行固定 `pg_restore --clean --if-exists --no-owner --dbname=<approved URL> database.dump`。
5. 用同 root 的 rename 交换文件目录，运行 Prisma `SELECT 1`、migration head、核心表计数和文件抽样健康检查。
6. 成功后标记 RESTORED、消费 preflight、恢复调度并通知前端刷新/重启。

失败时立即用 PRE_RESTORE dump 回灌数据库并把原文件目录 rename 回来；回滚也失败时记录 `ROLLBACK_FAILED`，保留两个备份目录、staging 和日志，不做清理。API 返回稳定错误，不回显命令、路径或数据库 URL。

## 8. 审计

全局 `AuditInterceptor` 对 POST/PATCH/PUT/DELETE 记录 method 对应的动作、路由模板、实体类型/ID、请求字段名、结果和 traceId，不保存字段值。领域服务对导入/导出、通知/SMS、备份、预检、恢复、版本恢复和快捷动作补充精确业务审计。

`GET /api/governance/audit-logs` 支持 action/entityType/outcome/from/to/page/pageSize；最多查询 366 天。只读查询本身不写审计，避免递归。

## 9. 数据健康检查

`GET /api/governance/health` 返回独立 checks：

- PostgreSQL 连通与 `app` schema/migration head。
- storage root 读写与自由空间（能获取时）。
- FileAsset/FileVersion 存储键是否缺失、大小/SHA 是否匹配（快速模式抽样，深度模式全量）。
- 孤立/异常的内容关联、待处理附件状态、过期 preflight、失败作业。
- 最近成功备份时间与自动备份配置。
- reminder scheduler 与 notification 未处理数量。

检查只读，不自动修数据；安全可修项目通过独立显式 `POST /health/repair` 白名单操作执行并审计。

## 10. 前端体验

设置页新增“数据安全”工作区，页签为概览、备份恢复、审计、健康检查。创建备份、验证、预检均显示步骤；恢复按钮必须在预检完成后输入确认文字。作业状态轮询并可从错误态重试。恢复成功提示重载应用；Electron 模式可调用受限 reload，浏览器模式提示手动刷新。

## 11. 错误码

`BACKUP_BUSY`、`BACKUP_NOT_FOUND`、`BACKUP_CREATE_FAILED`、`BACKUP_MANIFEST_INVALID`、`BACKUP_VERIFICATION_FAILED`、`BACKUP_DELETE_FORBIDDEN`、`RESTORE_PREFLIGHT_INVALID`、`RESTORE_CONFIRMATION_INVALID`、`RESTORE_FAILED`、`RESTORE_ROLLBACK_FAILED`、`DATA_HEALTH_CHECK_FAILED`、`GOVERNANCE_SETTING_INVALID`。

## 12. 验收

- 手动和定时备份生成可验证 dump/manifest；同日自动备份幂等，保留策略不删保护证据。
- 篡改任一文件、manifest、路径或大小后预检失败且不调用 pg_restore。
- 恢复前一定创建 PRE_RESTORE；注入数据库/文件交换失败时自动回滚，原数据和文件哈希恢复。
- 审计可过滤、不可修改、无敏感正文；健康检查能识别缺失文件、迁移漂移和过期备份。
- 所有危险路径由单元/集成测试覆盖，并在独立测试库与临时 storage root 做恢复演练。

