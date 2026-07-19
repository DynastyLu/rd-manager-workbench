# P2-02 短信、AI 与外部日历/云盘集成设计

## 1. 目标

建立默认关闭、显式授权、可审计的外部能力框架，支持短信发送、AI 摘要/知识问答、CalDAV 日历和 WebDAV 云盘。没有凭据或不在 Electron 时，核心本地功能照常工作并明确显示外部能力不可用。

## 2. 安全架构选择

比较：

1. 密钥保存在 PostgreSQL/后端环境：实现简单，但备份和日志容易携带密钥。
2. renderer localStorage：不安全，XSS 可直接读取。
3. Electron `safeStorage` 凭据库 + provider broker：数据库只保存 public config/credentialRef，外部请求由主进程读取密钥执行。

采用方案 3。preload 只暴露严格方法，不暴露 ipcRenderer、文件系统、任意 URL fetch 或密钥读取；renderer 只能写入/删除凭据、检查是否存在、提交受控 operation。浏览器开发模式返回 `CREDENTIAL_STORE_UNAVAILABLE`。

## 3. 后端模型

```text
ExtensionProfile(id, kind SMS|AI|CALENDAR|CLOUD_DRIVE, provider,
 name, enabled, publicConfig Json, credentialRef?, permissions[], archivedAt?, createdAt, updatedAt)
ExtensionRun(id, profileId, operation, status PENDING|RUNNING|SUCCEEDED|FAILED|REJECTED,
 inputSha256, inputBytes, outputSha256?, outputBytes?, errorCode?, metadata Json,
 createdAt, startedAt?, finishedAt?)
SmsRecipient(id, label, maskedPhone, credentialRef, enabled, archivedAt?)
SmsDelivery(id, reminderRuleId?, notificationId?, recipientId, profileId,
 templateKey, status, attemptCount, nextAttemptAt?, providerMessageId?, errorCode?, createdAt, sentAt?)
ExternalObjectLink(id, profileId, localType, localId, remoteId, remoteVersion?,
 syncDirection, lastSyncedAt?, syncHash?, conflictState?)
```

publicConfig 用 provider-specific Zod schema 校验，递归拒绝 key/token/secret/password/phone 等密钥字段。手机号作为 safeStorage credential，只在 DB 保存 mask 和 ref。

## 4. Desktop 凭据与执行桥

`desktop/src/credential-vault.ts` 把 `{credentialRef: encryptedBase64}` 写入 userData 下原子 JSON 文件；使用 `safeStorage.encryptString/decryptString`，文件权限尽力设为 0600。API：

```ts
credentials.isAvailable(): Promise<boolean>
credentials.put(ref, secretObject): Promise<void>
credentials.has(ref): Promise<boolean>
credentials.delete(ref): Promise<void>
extensions.execute({ runId, profile, operation, payload }): Promise<sanitizedResult>
```

ref、provider、operation、payload schema 都是允许清单。renderer 永远不能读取 secretObject。主进程 provider adapter 只接收验证后的 public config + 解密凭据 + typed payload。

## 5. Provider 与能力

内置 provider：

- SMS：`ALIYUN_SMS` 与 `LOCAL_PREVIEW`。Aliyun 使用官方 HTTPS API/SDK，public config 只含 region/sign/template mapping，凭据含 access key；LOCAL_PREVIEW 只生成预览并标记 REJECTED/PREVIEW，不伪造已发送。
- AI：`OPENAI_RESPONSES` 与 `LOCAL_MANUAL`。AI 只支持用户主动触发的 `SUMMARIZE_MEETING`、`SUMMARIZE_DOCUMENT`、`KNOWLEDGE_QA`；发送前显示将离开本机的对象、字符数和 provider。结果先作为建议，用户确认后才写入纪要/文档。
- Calendar：`CALDAV`，支持选定时间范围的 pull/push、远端 calendar 选择和冲突预检；默认只拉取，开启双向需再次确认。
- Cloud drive：`WEBDAV`，支持将选定附件/导出/备份上传到固定 remote root 及显式下载；不做全盘自动镜像。

Provider 实现与当前官方接口文档锁定版本，网络请求设置 20 秒超时、大小上限和重试分类；4xx 配置错误不重试，429/5xx/超时指数退避最多 3 次。

## 6. 短信通知

ReminderRule 增加 `channels[]` 与 `important`；只有 important、SMS channel、活动 recipient/profile 和明确模板映射同时满足才创建 SmsDelivery。页面/桌面通知不等待短信。

后端调度器创建 PENDING delivery 和 ExtensionRun，通过本地 Socket namespace `/extensions` 发 `extension.run.requested`。Electron broker 执行后 POST `/api/extensions/runs/:id/complete`；回调需要一次性 run token 和 payload hash。离线时 delivery 保持 PENDING 并按 nextAttemptAt 重试。

发送日志显示 mask、模板、状态、费用提示/估算和 provider message ID，不显示完整手机号或短信正文。

## 7. AI 摘要与知识问答

- 会议/文档摘要输入在服务端按对象 ID组装，去除附件字节，限制 40,000 字符。
- 知识问答先用本地搜索选出最多 8 个文档片段，总计不超过 50,000 字符；请求携带稳定 citation IDs。
- AI 输出结构化 `{ answer, citations[], summary?, actionItems? }`；引用必须来自输入 citation IDs。
- 不自动创建任务、修改风险、覆盖纪要或保存知识页。用户点击“采纳”后调用现有领域 API并审计。
- input/output 正文不写 ExtensionRun，只保存 SHA-256、字节数、对象 IDs 和状态。

## 8. 外部日历与云盘

- CalDAV 映射只同步普通 CalendarEvent；任务/会议等派生事件默认只读导出，远端修改不能覆盖业务对象。
- 同步前返回新增/更新/冲突预检；冲突由用户选择保留本地、保留远端或创建副本。
- WebDAV 只允许 profile 固定 remote root 下的规范化路径，拒绝 `..`、绝对路径和跨 host redirect。
- 上传前/下载后计算 SHA-256；同 remoteId/version 哈希不一致进入 CONFLICT，不静默覆盖。

## 9. API 与 UI

```text
/api/extensions/profiles
/api/extensions/runs
/api/extensions/runs/:id/complete
/api/extensions/sms/recipients
/api/extensions/sms/deliveries
/api/extensions/ai/prepare
/api/extensions/sync/preflight
/api/extensions/sync/commit
```

设置页增加外部能力工作区：短信、AI、日历、云盘四页签。创建 profile 时先保存 public config，再由 desktop bridge 保存凭据，最后执行不含业务正文的连接测试。所有页面显示 enabled、credential available、最近运行、失败原因和数据离开本机提示。

## 10. 错误码

`EXTENSION_PROFILE_NOT_FOUND`、`EXTENSION_PROFILE_DISABLED`、`EXTENSION_CONFIG_INVALID`、`EXTENSION_SECRET_IN_CONFIG`、`CREDENTIAL_STORE_UNAVAILABLE`、`CREDENTIAL_NOT_FOUND`、`EXTENSION_CONFIRMATION_REQUIRED`、`EXTENSION_OPERATION_UNSUPPORTED`、`EXTENSION_RUN_NOT_FOUND`、`EXTENSION_RUN_TOKEN_INVALID`、`SMS_DELIVERY_FAILED`、`AI_OUTPUT_INVALID`、`EXTERNAL_SYNC_CONFLICT`、`EXTERNAL_PATH_INVALID`。

## 11. 验收

- PostgreSQL、备份、日志和 renderer 均找不到明文密钥/完整手机号；preload 无任意 IPC/fetch。
- 未配置/禁用 provider 时短信不发送且本地通知正常；LOCAL_PREVIEW 明确不是成功发送。
- 配置真实服务商后发送状态、重试、mask、成本提示和审计完整。
- AI 每次发送前明确确认数据范围，输出只能在用户采纳后写回并保留引用。
- CalDAV/WebDAV 预检、冲突和哈希校验完整；外部失败不修改本地对象。
- desktop/provider 单元测试使用 mock safeStorage/fetch，后端跑状态机集成测试，真实凭据验收由用户配置后执行连接测试。

