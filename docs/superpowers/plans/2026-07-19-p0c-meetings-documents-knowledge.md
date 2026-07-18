# P0-C 会议、文档与知识库实施计划

## 交付目标

把现有“会议列表”和“知识库规划页”替换为可每天真实使用的本地功能：会议纪要可编辑并生成行动任务；文档/知识页可组织、自动保存、版本恢复；附件可上传下载并与对象关联。所有数据使用本机 PostgreSQL 与本地文件目录。

## 统一数据边界

- `ContentDocument` 是普通文档、知识页、会议纪要的唯一正文数据源，类型为 `DOCUMENT | KNOWLEDGE_PAGE | MEETING_MINUTES`。
- `KnowledgeSpace` 管理知识空间；`ContentDocument.parentId` 组成目录树，不复制正文。
- `DocumentVersion` 保存显式版本及恢复来源，恢复只创建新版本，不覆盖历史。
- `FileAsset` 是文件逻辑标识，`FileVersion` 保存物理版本、MIME、大小和 SHA-256；文件关联到文档、项目或会议。
- 会议保留现有 `Meeting`、`MeetingAgendaItem`、`MeetingAction`、`Decision`；会议纪要通过 `Meeting.minutesDocumentId` 关联 `ContentDocument`。
- 行动项转任务继续使用现有 `MeetingAction.taskId` 和 `sourceType=MEETING_ACTION`，重复转换返回现有任务而不创建副本。

## 后端 API 契约

### 内容与知识

- `GET /api/knowledge-spaces`
- `POST /api/knowledge-spaces`
- `PATCH /api/knowledge-spaces/:id`
- `GET /api/documents?type=&projectId=&meetingId=&spaceId=&parentId=&status=&query=`
- `POST /api/documents`
- `GET /api/documents/:id`
- `PATCH /api/documents/:id`：自动保存标题、JSON 正文、纯文本、标签、目录、关联对象
- `DELETE /api/documents/:id`：进入回收站
- `POST /api/documents/:id/restore`：从回收站恢复
- `GET /api/documents/:id/versions`
- `POST /api/documents/:id/versions`：显式保存版本
- `POST /api/documents/:id/versions/:versionId/restore`

### 文件

- `GET /api/files?documentId=&projectId=&meetingId=&status=`
- `POST /api/files`：multipart 上传首个版本
- `POST /api/files/:id/versions`：multipart 上传新版本
- `GET /api/files/:id/download?versionId=`
- `PATCH /api/files/:id`：重命名或调整关联
- `DELETE /api/files/:id`：进入回收站
- `POST /api/files/:id/restore`

### 会议增强

- `GET /api/meetings` 支持 `projectId`、状态与时间筛选。
- `POST /api/meetings/:id/minutes-document` 创建或返回唯一会议纪要文档。
- `POST /api/meeting-actions/:id/task` 重复调用返回已有任务并标明 `alreadyExists=true`。
- 会议详情继续返回议题、行动项、决策，并增加纪要文档与附件。

## 前端交付

### 会议

- 日历会议可打开同一会议详情；会议列表支持项目/状态过滤和新建。
- 会议详情抽屉：基本信息、议程、纪要、行动项、决策、附件六部分。
- 纪要用 Tiptap 编辑器，自动保存状态明确展示；提供会议纪要模板。
- 行动项可新增、编辑、完成、转任务；已转任务展示链接并禁止重复创建。
- 决策可创建并展示背景、结论、影响和日期。

### 文档与知识库

- `/docs` 使用飞书式三栏结构：空间/目录树、内容列表、编辑区。
- 普通文档与知识页均可新建；支持标题、正文、标签、收藏、项目/会议关联。
- Tiptap 工具栏至少支持标题、段落、粗体、列表、待办、引用、代码块、链接、图片/附件引用。
- 自动保存采用防抖；显式保存版本、版本浏览、恢复、归档和回收站均为真实操作。
- 文件上传、下载、新版本、删除与恢复在文档详情和会议详情中使用同一组件。
- 项目“会议”“文档与资料”页签直接显示该项目的真实记录，不再跳转规划页。

## 测试与验收

1. 先写后端单元/集成测试和前端交互测试，再实现。
2. Prisma 校验、迁移、lint、typecheck、build 全部通过。
3. 实际数据库创建会议 → 写纪要 → 行动项转任务，重复转换不产生第二条任务。
4. 实际创建知识页 → 自动保存 → 保存版本 → 修改 → 恢复，正文及关联均正确。
5. 实际上传附件 → 下载 hash 一致 → 上传新版本 → 回收站恢复。
6. 浏览器验证 `/docs`、会议详情和项目两个页签，无规划卡片、空按钮或假数据。

## 并行边界

- 会议线程只改会议后端增强、会议前端及相关测试，不修改内容模型迁移。
- 内容后端线程负责 Prisma 内容/文件模型、存储 API、测试和迁移。
- 内容前端线程按本文 API 契约实现 `/docs` 与共享附件组件，不修改 Prisma。
- 主线程负责路由/项目页签接入、冲突整合、真实数据库与浏览器验收。
