# 项目管理闭环修复实施计划

## 任务 1：建立失败测试

- 扩展后端 Projects/Tasks 单元与集成测试，覆盖人工健康度、任务完成百分比、进展更新/删除、里程碑删除。
- 扩展前端 API 契约和 `ProjectWorkspacePage` 测试，覆盖编辑、重复新增、删除确认、状态颜色与进度条。
- 先运行 focused tests，确认新用例因生产能力缺失而失败。

## 任务 2：数据模型与后端闭环

- Prisma 增加 `Project.healthOverride`、`WorkTask.completionPercent` 和迁移。
- 扩展 DTO、service、controller，加入范围校验、更新/删除和百分比规则。
- 生成 Prisma Client，运行 focused unit/integration tests。

## 任务 3：前端 API 与复用表单

- 扩展 projects/tasks API 和类型。
- 将 ProjectForm、TaskForm、ProgressReportForm 扩展为新增/编辑双模式。
- 新增 MilestoneForm，并统一 query invalidation 和错误反馈。

## 任务 4：项目详情交互

- 项目头、概览、工作项、进展、里程碑加入操作入口。
- 已有进展时始终保留“提交进展”。
- 增加删除/归档确认和项目归档后返回列表。

## 任务 5：视觉语义

- 增加项目状态、风险等级和里程碑状态的语义 class/token。
- 增加项目/任务进度条与里程碑完成概览。
- 风险页签直接读取当前项目风险并展示，不再只有跳转空状态。

## 任务 6：验证

- Prisma validate/generate/migrate、backend focused + full gates。
- frontend focused + lint/typecheck/contracts/build。
- Playwright 验收编辑项目、追加进展、编辑任务、删除确认、颜色和进度条。
- `git diff --check` 和工作区状态复核。
