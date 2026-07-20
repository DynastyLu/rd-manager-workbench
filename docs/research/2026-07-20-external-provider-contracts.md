# 外部服务 Provider 契约锁定（2026-07-20）

本文件只记录生产适配器可以依赖的一手契约。后端仅保存公开配置、哈希和状态；认证材料由 Electron `safeStorage` 持有。真实网络操作必须由用户显式执行 `test` 或 `run`，默认 provider 只做本地预览/手工结果。

## OpenAI Responses

- Provider id：`OPENAI_RESPONSES`；接口固定为 `POST https://api.openai.com/v1/responses`，认证使用服务端 `Authorization: Bearer <API key>`，禁止从 renderer 或数据库读取 API key。
- 模型不在代码中静默升级。profile 的公开配置必须显式保存 `model`；2026-07-20 的最新旗舰解析结果是 `gpt-5.6-sol`，但创建 profile 时仍由用户选择可用模型。
- 结构化结果采用 Responses API 的 `text.format` JSON Schema；schema 为 strict object，AI 结果仍需本地 Zod 校验，拒绝未知 citation id。官方说明 Structured Outputs 保证输出符合给定 JSON Schema，并可程序化识别 refusal。
- 只发送服务端 prepare 产生并经用户确认的 payload。摘要最多 40,000 字符；知识问答最多 8 个片段、合计 50,000 字符。请求正文、输出正文、API key 都不得写入 `ExtensionRun`。
- 超时 20 秒；429、5xx、连接/超时可指数退避，最多三次；400/401/403/404 等配置或权限错误不自动重试。客户端应遵循返回的限流信息，不用并发重试放大流量。

官方依据：

- [OpenAI Structured model outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI Responses API guide](https://developers.openai.com/api/docs/guides/responses-vs-chat-completions)
- [OpenAI Error codes](https://developers.openai.com/api/docs/guides/error-codes)
- [OpenAI Rate limits](https://developers.openai.com/api/docs/guides/rate-limits)
- [OpenAI model catalog](https://developers.openai.com/api/docs/models)

## 阿里云短信

- Provider id：`ALIYUN_SMS`；国内短信接口固定为 `Dysmsapi/2017-05-25` 的 `SendSms`，endpoint 为 `dysmsapi.aliyuncs.com`。国际/港澳台是另一接口，本版本不混用。
- 请求公开配置只保存 `regionId`、`signName` 和 `templateMapping`；`AccessKeyId`/`AccessKeySecret` 及完整手机号只存在凭据保险箱。
- 生产请求参数为 `PhoneNumbers`、`SignName`、`TemplateCode`、可选 `TemplateParam`。成功响应 `Code=OK`，保存 `BizId` 为 provider message id；不记录完整正文或号码。
- SendSms 官方明确不提供幂等性。系统使用本地 `SmsDelivery` 唯一键与单次 run token 防重复；发生请求超时时不盲目立即重发，先保留待核查状态。
- 参数、签名、模板、权限类错误不重试；`isp.SYSTEM_ERROR`、HTTP 429/5xx、网络超时可退避重试，最多三次。手机号日志只显示 mask。

官方依据：

- [SendSms API](https://help.aliyun.com/zh/sms/developer-reference/api-dysmsapi-2017-05-25-sendsms)
- [短信 API 接入说明](https://help.aliyun.com/zh/sms/getting-started/use-sms-api/)
- [国内消息 API 错误码](https://help.aliyun.com/zh/sms/developer-reference/api-error-codes)

## CalDAV

- Provider id：`CALDAV`；基线协议锁定 RFC 4791。时间范围拉取使用 `CALDAV:calendar-query` REPORT，成功响应是 `DAV:multistatus`；资源版本使用 HTTP ETag。
- 默认 `PULL_ONLY`。只有普通 `CalendarEvent` 可双向更新；任务、会议等派生日程只允许导出，远端变化不得覆盖业务对象。
- 同步分为 preflight/commit：preflight 返回新增、更新和冲突；commit 必须携带相同的 payload hash，并要求冲突选择 `KEEP_LOCAL`、`KEEP_REMOTE` 或 `CREATE_COPY`。
- 20 秒超时；认证/权限/校验 4xx 不重试；429/5xx/连接超时最多三次。

官方依据：

- [RFC 4791: Calendaring Extensions to WebDAV](https://www.rfc-editor.org/rfc/rfc4791.html)
- [RFC 6578: Collection Synchronization for WebDAV](https://www.rfc-editor.org/rfc/rfc6578.html)

## WebDAV

- Provider id：`WEBDAV`；基线协议锁定 RFC 4918。只允许在 profile 的固定 `remoteRoot` 下对显式选择的附件、导出和备份执行 PUT/GET/PROPFIND。
- 路径必须是相对、规范化的 POSIX 路径；拒绝绝对路径、`..`、NUL、反斜杠和跨 host redirect。下载后、上传前计算 SHA-256。
- ETag/remoteVersion 或 hash 与已同步状态不一致时进入 `CONFLICT`，不静默覆盖。207 Multi-Status 必须逐资源检查，不能把整个响应一概当成功。
- 20 秒超时；认证/权限/路径/配额类 4xx 不重试；429/5xx/连接超时最多三次。

官方依据：

- [RFC 4918: WebDAV](https://www.rfc-editor.org/rfc/rfc4918.html)
- [RFC 6578: Collection Synchronization for WebDAV](https://www.rfc-editor.org/rfc/rfc6578.html)

## 统一边界

- 单次输入上限：SMS template variables 8 KiB；AI 50,000 UTF-16 字符且请求体 1 MiB；CalDAV 响应 8 MiB；WebDAV 单文件沿用本地附件上限并流式传输。
- provider adapter 不跟随跨 host redirect；所有 HTTP 调用 20 秒超时；最多 3 次总尝试，指数退避由 broker 执行。
- `LOCAL_PREVIEW`/`LOCAL_MANUAL` 永不制造外部成功：短信预览终态为 `REJECTED` 且 errorCode=`PREVIEW_ONLY`；AI 手工模式只有用户粘贴并确认结构化结果后才可成功。
