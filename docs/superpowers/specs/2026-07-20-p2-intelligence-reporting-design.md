# P2-01 行业情报、资源负荷与统计报表设计

## 1. 目标

交付人工可维护、来源可追溯、计划可执行、卡片可转换的行业情报闭环，以及项目组合、资源负荷、任务完成和风险趋势报表。P2-01 不自行联网爬取；P2-02 的外部适配器启用后，采集计划可调用已授权 connector。

## 2. 方案选择

情报采用独立实体而不是 Base 自定义记录：来源、去重、运行日志、转换幂等和日报快照需要稳定约束；同时提供 Base 模板给用户扩展字段。报表由后端聚合真实业务表，不从前端分页列表拼接。

## 3. 情报模型

```text
IntelligenceTopic(name unique active, description?, keywords[], projectIds[], archivedAt?)
IntelligenceSource(name, kind WEBSITE|RSS|NEWSLETTER|DATABASE|MANUAL,
 url?, credibility 1..5, notes?, archivedAt?)
IntelligenceCollectionPlan(sourceId, name, frequency MANUAL|DAILY|WEEKLY,
 runAtLocalTime?, weekday?, enabled, connectorProfileId?, lastRunAt?, nextRunAt?, archivedAt?)
IntelligenceRun(planId, trigger MANUAL|SCHEDULED|CONNECTOR, status,
 startedAt, finishedAt?, itemCount, errorCode?, errorMessage?)
IntelligenceItem(title, summary, impact?, recommendation?, canonicalUrl?,
 publishedAt?, priority, status, contentHash, archivedAt?)
IntelligenceOccurrence(itemId, sourceId, sourceUrl?, capturedAt, rawTitle?, rawSummary?)
IntelligenceItemTopic(itemId, topicId)
IntelligenceItemProject(itemId, projectId)
IntelligenceConversion(itemId, kind TASK|RISK|MEETING|KNOWLEDGE,
 targetId, createdAt; unique(itemId,kind))
IntelligenceBrief(kind DAILY|WEEKLY, briefDate, title, introduction?, archivedAt?)
IntelligenceBriefItem(briefId, itemId, sequence, snapshot Json)
```

canonical URL 规范化后哈希；无 URL 时用 title+summary+published date 哈希。去重只合并 occurrence 和来源，不覆盖用户已编辑卡片正文。

## 4. 采集计划

- MANUAL 无时间；DAILY 必须 `HH:mm`；WEEKLY 还必须 weekday 1～7。
- P2-01 的“执行”支持手工粘贴/上传结构化条目，并记录 run；不会调用 fetch、浏览器或 AI。
- 配置 connectorProfileId 时，只有 P2-02 已启用且权限包含 `INTELLIGENCE_READ` 的 profile 可执行 SCHEDULED/CONNECTOR；失败只记录 run，不阻塞本地功能。
- 调度使用本地时区、每日幂等键和 advisory lock，最多重试 3 次。

## 5. 卡片转换

```text
POST /api/intelligence-items/:id/task
POST /api/intelligence-items/:id/risk
POST /api/intelligence-items/:id/meeting-agenda
POST /api/intelligence-items/:id/knowledge-page
```

分别复用 TasksService、RisksService、MeetingsService、DocumentsService 的事务内创建入口；IntelligenceConversion 唯一约束保证重复调用返回相同目标。生成内容含来源卡片 ID/URL，但不自动归档卡片。

## 6. 日报与周报

同一 kind/date 唯一。保存时按用户顺序创建 brief items，并快照 title/summary/priority/publishedAt/canonicalUrl/source names；卡片后续修改不改变历史日报。日报可编辑标题/导语/排序，不自动通知或 AI 生成。

API 分组：topics、sources、plans/runs、items/conversions、briefs；所有列表分页、搜索、过滤、软归档。

## 7. 资源负荷

恢复并使用现有 ResourceProfile/Skill/LoadEntry 表：资源档案是本机主管维护对象，不是账号。负荷条目按周一 UTC date、资源和引用类型记录 plannedHours；引用严格对应 NON_PROJECT_RD/PROJECT/TASK/OTHER。

`GET /api/resources/load-summary?weekStartAt=` 返回容量、计划小时、负荷百分比、按 kind 分组和超载标记。范围视图最多 13 周；负荷不从 assigneeName 自动推断，必须显式维护。

## 8. 统计报表

```text
GET /api/reports/portfolio?from=&to=
GET /api/reports/task-completion-trend?from=&to=&bucket=week|month
GET /api/reports/risk-trend?from=&to=&bucket=week|month
GET /api/reports/resource-load?fromWeek=&toWeek=
GET /api/reports/intelligence?from=&to=
GET /api/reports/export?kind=&from=&to=&format=csv|xlsx
```

- 日期范围最多 366 天；bucket 在服务端按 UTC 边界计算。
- 项目组合包含状态/健康度/阶段、里程碑达成、逾期任务、高风险。
- 任务趋势按完成时间与新建时间；风险趋势按创建/关闭和等级。
- 情报统计按主题、来源、优先级、转换种类。
- 导出复用 P1-01C 流式 exporter；每个导出写审计，图表不使用假数据。

## 9. 前端信息架构

- `/library/intelligence`：主题/来源/计划/卡片四栏工作区；卡片详情含来源出现、项目、转换和资料。
- `/library/intelligence/briefs`：日报/周报列表与编辑器。
- `/library/operations?tab=resources`：资源档案、技能和 13 周负荷矩阵。
- `/library/reports`：项目组合、任务趋势、风险趋势、资源负荷、情报五页签。
- 从工作台快捷卡、项目页和 Base 进入，不增加七入口主导航；所有图表同时提供表格和可访问摘要。

## 10. 验收

- 主题、来源、计划、运行、卡片、出现、项目关联和去重完整；计划状态与运行历史可追踪。
- 同一卡片四种转换幂等并能从目标对象返回来源。
- 日报/周报快照不被卡片后续编辑改变。
- 资源容量、计划小时、负荷百分比和超载值精确；项目/任务引用归档后不能新增负荷。
- 五类报表来源于真实数据，筛选、时间桶、空态和 CSV/XLSX 导出一致。

