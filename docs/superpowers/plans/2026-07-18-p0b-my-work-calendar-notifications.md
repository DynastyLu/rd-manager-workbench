# P0-B 我的工作、日历与提醒通知 Implementation Plan

**Goal:** 让本地单人用户可以整理收件箱/今日/本周/逾期/稍后/已完成任务，创建面试或会议日程，并在到点时收到可追溯且不重复的页面通知。

**Architecture:** 继续使用现有 `WorkTask`、`TaskReminder`、`TaskLater` 与 `Meeting`；新增统一 `CalendarEvent`、`ReminderRule`、`Notification` 数据模型。NestJS 提供视图查询、日程 CRUD、提醒调度与 WebSocket；React 使用 Semi Design 和 FullCalendar；Electron 原生通知通过后续桌面桥接消费同一通知事件，不复制提醒数据。

**Contract decisions:**

- `GET /tasks/my-work?view=INBOX|TODAY|WEEK|OVERDUE|LATER|COMPLETED` 返回任务、依赖、`reminder`、`later`。
- `PUT /tasks/:id/later` / `DELETE /tasks/:id/later` 管理稍后处理；`PUT /tasks/:id/reminder` / `DELETE /tasks/:id/reminder` 管理任务提醒。
- `CalendarEvent` 存普通日程/面试/评审；会议继续以 `Meeting` 为真实来源，由日历聚合 API 投影，不建立镜像记录。
- `GET /calendar/entries?from=&to=` 聚合普通日程、会议和任务截止时间；普通日程使用 `/calendar/events` CRUD。
- `ReminderRule` 可关联 `TASK`、`CALENDAR_EVENT`、`MEETING`，一个对象允许多个提醒点；唯一键保证同一对象/提醒时刻不重复。
- 调度器把到点规则幂等写入 `Notification`；通知中心以数据库为准，WebSocket 只做即时加速，断线后通过 REST 补偿。

## Task 1：我的工作后端闭环

- [ ] 先写视图边界、稍后处理、提醒 upsert/delete 的失败测试。
- [ ] 实现六个固定任务视图，明确上海本地日界线与周界线；稍后未到期不得进入今日/本周。
- [ ] 任务响应返回 reminder/later，更新后保持项目健康度逻辑不变。
- [ ] 运行 focused unit/integration、build、lint 并提交。

## Task 2：我的工作 Semi 页面

- [ ] 先写六视图、空/错/加载、稍后与提醒交互测试。
- [ ] 将旧任务看板重构为“我的工作”左侧固定视图 + 紧凑任务列表/看板；所有计数来自 API。
- [ ] 新建、完成、取消、延期、稍后、恢复、设置提醒均调用真实 API 并即时刷新。
- [ ] 运行 focused tests、typecheck、lint、build 并提交。

## Task 3：统一日历模型与 API

- [ ] 新增 CalendarEvent/CalendarEventType 与迁移，字段包含主题、起止、全天、地点/链接、备注、类型、项目。
- [ ] 实现普通日程 CRUD 和聚合 entries；投影会议与任务截止日并保留 `sourceType/sourceId`。
- [ ] 校验结束时间晚于开始时间、范围上限、项目引用和归档语义。
- [ ] 运行 Prisma validate/generate、unit/integration、build、lint 并提交。

## Task 4：飞书式日历页面

- [ ] 安装 FullCalendar React/daygrid/timegrid/interaction。
- [ ] 实现月/周/日切换、今天、范围查询、普通日程/会议/任务三类视觉、日程新建编辑取消。
- [ ] 拖动普通日程和任务日期调用真实更新 API；会议仅允许打开详情，不从日历静默改期。
- [ ] 面试日程支持项目、地点/链接、备注和多个提醒点。
- [ ] 运行交互测试、typecheck、lint、build 并提交。

## Task 5：提醒调度、通知中心与 WebSocket

- [ ] 新增 ReminderRule/Notification 模型与幂等唯一索引、迁移和 DTO。
- [ ] 实现到点扫描器、测试触发接口（仅本地开发）、未读列表、已读、关闭、稍后提醒。
- [ ] 接入 Socket.IO 网关；客户端断线重连后重新拉取 REST 未读通知。
- [ ] 顶栏通知中心展示真实未读数和关联对象入口；删除 P0-B 占位文案。
- [ ] 覆盖重复扫描、时区、系统时钟回拨、稍后提醒测试并提交。

## Task 6：Electron 原生通知与批次验收

- [ ] 在安全 preload 白名单中暴露通知事件，不向 renderer 暴露 Node。
- [ ] 主进程使用 Electron `Notification`，以 notificationId 做单进程去重；点击打开关联对象。
- [ ] 应用托盘运行时保持后端/Socket 可用；完全退出不承诺提醒，设置页明确说明。
- [ ] 前后端完整门禁、真实一分钟提醒验收、Electron smoke 后更新进度记录。

