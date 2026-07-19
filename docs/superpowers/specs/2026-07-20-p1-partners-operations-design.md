# P1-04 合作方与非项目研发设计

## 1. 目标

把现有合作方后端基础升级为可用的飞书式对象工作区，并恢复已经建表但从 Prisma/Nest/React 丢失的非项目研发能力。合作方和非项目研发均作为项目关联对象、业务库对象和多维表格模板，不新增顶级导航。

## 2. 现状与迁移原则

- Partner/Contact/Agreement/Communication 四个模型和基础 API 已存在，但前端只有名称创建/只读卡片。
- `20260718050000_operations_p1` 已在生产库创建 NonProject/Resource/WeeklyReport 表，当前 `schema.prisma` 丢失声明。
- 先恢复与既有 SQL 完全一致的 Prisma enums/models 和真实 catalog 测试；不重建、DROP、rename 或清空表。
- 历史 feature 分支只作为算法/测试来源，不能整体合并旧路由、旧 Calendar 或旧 UI。

## 3. 合作方完整性

新增 `PartnerProject(partnerId, projectId, role?, notes?, createdAt)`，唯一 `(partnerId, projectId)`；Partner/Project 均可直接列出关联关系。

为 `CommunicationRecord` 增加 `taskId String? @unique`，沟通转任务使用事务 advisory lock：已有 taskId 返回 `{ task, alreadyExists: true }`，否则调用 `TasksService.createTaskInTransaction` 并回写 taskId。重复请求不得创建第二条任务。

Update DTO 是真正 partial：字段缺省表示不修改，允许清空的可选字段显式接受 `null` 并转换为数据库 null。更新沟通时重新验证 contact 属于同一 Partner、project 活动且 partner-project 关系合法；跨 Partner child ID 一律 404。

## 4. 合作方 API

```text
GET /api/partners?q=&projectId=&nextFollowUpBefore=&page=&pageSize=
POST /api/partners
GET/PATCH/DELETE /api/partners/:id
POST/DELETE /api/partners/:id/projects/:projectId
POST/PATCH/DELETE /api/partners/:id/contacts/:childId?
POST/PATCH/DELETE /api/partners/:id/agreements/:childId?
GET/POST/PATCH/DELETE /api/partners/:id/communications/:childId?
POST /api/communications/:id/task
```

列表包含 `contactCount`、`activeAgreementCount`、`projectCount`、`lastCommunicationAt`、`nextFollowUpAt`；搜索 name/shortName/category。软归档 Partner 前仍要求所有 child 与 project links 已归档/删除，UI 明确列出阻塞项。

## 5. 非项目研发模型

恢复既有表声明：

```text
NonProjectRdItem(code unique, kind, title, objective?, expectedOutcome?, ownerName?,
 plannedStartAt?, plannedEndAt?, actualStartAt?, actualEndAt?, plannedPersonHours,
 status, impactScope?, severity?, suggestedProjectName?, projectId?, taskId? unique, archivedAt?)
NonProjectRdOutcome(itemId, title, summary?, status, verifiedAt?, evidenceNote?)
ResourceProfile / ResourceSkill / ResourceLoadEntry / WeeklyReportDraft
```

本批新增 `taskId` 以支持幂等加入“我的工作”；其余 Resource/WeeklyReport 在 P2-01 产品化。分类固定：技术预研、新方向、平台工具、技术债、专利、标准/方法、培训学习、临时支持。技术债才允许 severity/impactScope；完成状态要求至少一个 VERIFIED outcome 或明确 `outcomeWaivedReason`。

## 6. 非项目研发 API

```text
GET/POST /api/non-project-rd
GET/PATCH/DELETE /api/non-project-rd/:id
GET/POST /api/non-project-rd/:id/outcomes
PATCH/DELETE /api/non-project-rd/:id/outcomes/:outcomeId
POST /api/non-project-rd/:id/project-suggestion
POST /api/non-project-rd/:id/task
```

- 活动 code 唯一，所有写入 trim 且拒绝空字符串。
- project-suggestion 只返回预填 Project payload 与不冲突 code，不自动创建项目。
- task 转换幂等，sourceType=`NON_PROJECT_RD`，sourceId=item.id。
- 计划日期投影到现有 `/calendar/entries`；任务转换后出现在现有“我的工作”，不创建第二套日历或待办。

## 7. 多维表格与对象关联

P1-01D 模板目录增加“合作方台账”和“非项目研发记录”，只创建自定义表结构，不复制业务记录。系统业务库通过已有实时预置/对象深链访问真实 Partner/NonProject 对象；模板记录属于用户自定义数据，二者必须显式标记来源。

文档/附件用现有 Content/File 关联类型扩展 `PARTNER`、`COMMUNICATION`、`NON_PROJECT_RD`、`NON_PROJECT_OUTCOME`。项目详情增加“合作方”和“非项目研发”关联区，但仍在项目六页签内。

## 8. 前端体验

- `/library/governance/partners?recordId=&projectId=`：Semi 列表 + 详情 SideSheet，页签概览、项目、联系人、协议、沟通、资料；支持完整 CRUD、跟进筛选和沟通转任务。
- `/library/operations?tab=non-project-rd&recordId=`：列表/看板筛选与详情 SideSheet，页签概览、成果、任务、资料；可生成项目建议、加入我的工作。
- 从 Base、项目详情、搜索和最近访问打开同一个对象深链。
- 删除/归档、沟通转任务、完成非项目事项均有确认和真实错误回滚。

## 9. 错误码

补充：`PARTNER_PROJECT_EXISTS`、`PARTNER_PROJECT_NOT_FOUND`、`COMMUNICATION_TASK_EXISTS`、`NON_PROJECT_RD_NOT_FOUND`、`NON_PROJECT_RD_CODE_EXISTS`、`NON_PROJECT_RD_REFERENCE_INVALID`、`NON_PROJECT_RD_COMPLETION_BLOCKED`、`NON_PROJECT_OUTCOME_NOT_FOUND`、`NON_PROJECT_TASK_EXISTS`。

## 10. 验收

- Partner 可搜索、关联项目、维护联系人/协议/沟通、按跟进日期筛选；刷新与深链保持选择。
- 更新沟通不能引用其他 Partner 的联系人或归档项目；重复转任务只得到同一 task。
- 已有 operations 表通过 Prisma Client 可访问且无破坏迁移；非项目事项/成果 CRUD、项目建议、任务转换、日历和我的工作联动完整。
- 两类对象均可关联文档/附件并出现在搜索；项目空间能看到关联对象。
- 后端真实 PostgreSQL、前端页面、深链和浏览器 CRUD 有自动化与验收覆盖。

