# 项目管理闭环修复设计

日期：2026-07-22

## 背景与目标

当前项目详情页已经能读取项目、工作项、进展和里程碑，但多数内容只有只读展示；已有进展后不再显示新增入口；任务和项目已有更新/归档 API，却没有在详情页接入。该批修复把项目详情从“展示页”补齐为可持续维护的本地项目工作区。

## 优先级

### P0：完整可维护闭环

1. 项目资料可编辑：名称、编号、目标、预期成果、研究方向、负责人、计划周期、状态、阶段和健康度。
2. 工作项可反复新增、编辑和归档；支持状态、优先级、截止日期和完成百分比。
3. 进展记录在已有记录时仍可继续新增，并支持编辑、删除。
4. 里程碑支持新增、编辑、删除，删除前二次确认。
5. 项目归档、任务归档以及进展/里程碑删除均提供明确的危险操作确认。

### P1：状态与进度可视化

1. 项目状态：进行中绿色、已完成蓝色、已暂停黄色、已终止红色；草稿保持中性灰。
2. 风险等级：低绿色、中黄色、高/严重红色，并保留文字，避免只依赖颜色。
3. 项目进度和每个工作项显示带数值的进度条。
4. 里程碑按待开始、进行中、已完成、已逾期显示时间轴节点和进度概览。

## 数据设计

- `Project.healthOverride`：可空。为空时使用自动健康快照；设置后人工值优先展示。选择“自动评估”会清空该字段。
- `WorkTask.completionPercent`：0–100 整数，默认 0。任务完成时自动归一为 100；未完成任务允许人工维护。
- 进展记录和里程碑沿用现有表。新增 PATCH/DELETE API，不复制新表。
- 删除项目和任务继续使用软归档；里程碑和进展使用受项目作用域约束的物理删除，因为它们是项目内部记录且现有模型没有归档字段。

## API 设计

- `PATCH /projects/:id`：扩展 `healthOverride`。
- `POST /projects/:projectId/milestones`
- `PATCH /projects/:projectId/milestones/:milestoneId`
- `DELETE /projects/:projectId/milestones/:milestoneId`
- `POST /projects/:projectId/progress-reports`
- `PATCH /projects/:projectId/progress-reports/:reportId`
- `DELETE /projects/:projectId/progress-reports/:reportId`
- `PATCH /tasks/:id`、`DELETE /tasks/:id`：复用现有接口，扩展 `completionPercent`。

## 前端交互

- 项目头部增加“编辑项目”和更多操作；概览目标卡片、健康度卡片和里程碑卡片均提供就近操作。
- 工作项、进展和里程碑列表每行提供编辑和删除；删除使用 Semi `Modal.confirm`。
- 所有弹窗继续使用 Semi Design 的 `Input`、`Select`、`DatePicker`、`TextArea`、`Progress`，底部动作区保持统一边距。
- mutation 成功后统一失效项目详情、项目列表、首页和我的工作缓存。

## 边界与错误处理

- 任何更新和删除都必须校验记录属于 URL 中的项目。
- 百分比只接受 0–100 整数。
- 删除关联了任务的里程碑时，由数据库把任务的 `milestoneId` 置空；不删除任务。
- 请求失败保留弹窗内容，并用 toast 显示后端错误。

## 验收标准

- 同一项目可连续新增两条以上进展。
- 目标、健康度、里程碑、工作项和进展均能编辑并刷新后保持。
- 项目内部新增对象均有删除/归档入口和确认。
- 状态、风险、进度条和里程碑状态符合指定视觉映射。
- focused tests、全量类型检查/构建和真实浏览器关键路径通过。
