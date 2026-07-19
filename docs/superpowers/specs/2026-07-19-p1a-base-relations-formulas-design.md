# P1-01A 多维表格关联与计算设计

**状态：** 已确认
**范围：** 关联记录、双向关联、查找引用、关联聚合、安全公式  
**前置版本：** P0-D 多维表格最小可用版

## 1. 目标

让本地单人工作台中的自定义数据表能够关联另一张自定义表或系统预置表，并基于关联数据生成只读的引用、聚合和公式结果。所有计算继续使用同一份原始记录，不建立业务对象镜像，也不执行 JavaScript。

验收示例：在“面试候选人”表关联“项目总表”或“岗位”自定义表后，可以显示项目名称、统计面试轮次数量、汇总评分并通过公式得到候选状态；修改源记录后，表格、看板、日历和表单重新读取时立即得到新结果。

## 2. 不在本批次实现

- 甘特、画册、保存筛选属于 P1-01B。
- CSV/Excel 导入导出属于 P1-01C。
- 合作方、申报、风险、面试和非项目研发模板属于 P1-01D。
- 不实现多人权限、实时协同、跨设备同步或外部数据库公式。
- 不允许在系统预置表上动态新增计算字段；系统预置表可以作为单向关联目标。

## 3. 方案选择

采用“字段配置驱动、读取时计算”。

- `DataRecord.values` 只保存用户输入值和关联记录 ID。
- `LOOKUP`、`ROLLUP`、`FORMULA` 不持久化结果，读取记录时由后端解析并计算。
- 计算字段依赖使用稳定的字段 ID；公式编辑文本使用 `{field_key}`，保存时解析为受控 AST 并记录依赖字段 ID。
- 不采用写入时物化结果，避免源记录变化后产生旧值。
- 不新增独立关系图/公式 AST 数据表，避免在本地单人第一版引入过度复杂的同步模型。

## 4. 数据模型与字段配置

### 4.1 字段类型

在 PostgreSQL/Prisma `DataFieldType` 和前端 `DataFieldType` 中新增：

- `LOOKUP`：通过一个关联字段读取目标记录的指定字段。
- `ROLLUP`：对关联目标记录做聚合。
- `FORMULA`：对当前记录的基础字段、引用字段或聚合字段做安全计算。

原有 `RELATION` 字段继续存储单个字符串 ID 或字符串 ID 数组。

### 4.2 RELATION 配置

```ts
interface RelationFieldConfig {
  targetTableId: string
  multiple: boolean
  relationMode: 'ONE_WAY' | 'TWO_WAY'
  inverseFieldId?: string
}

interface CreateRelationOptions {
  inverseFieldName?: string
  inverseMultiple?: boolean
}
```

- 单向关系可以从自定义表指向自定义表或系统预置表。
- 双向关系只允许自定义表互相关联，因为系统预置表不能动态增加字段。
- `CreateRelationOptions` 只用于创建请求，不持久化在字段配置中；创建双向关系必须提供 `inverseFieldName`，`inverseMultiple` 默认是 `true`。
- 创建双向关系时，后端在目标表创建配对 `RELATION` 字段，并将双方 `inverseFieldId` 写入配置；源字段和反向字段分别使用自己的 `multiple` 约束，可表达一对一、一对多和多对多。
- 一对一关系任一侧已关联其他记录时拒绝写入并返回 409，不隐式挤掉旧关系。
- 更新关系值时，后端在同一 Prisma 事务中计算增删差集，按记录 ID 排序锁定所有受影响的自定义表记录后更新反向记录；内部更新不再次触发递归同步。
- 删除一侧字段时，后端清理本表记录值，并解除另一侧配置；默认不自动删除用户可见的反向字段，反向字段转为单向关系，避免误删数据结构。

### 4.3 LOOKUP 配置

```ts
interface LookupFieldConfig {
  relationFieldId: string
  targetFieldId: string
}
```

- `relationFieldId` 必须属于当前表且类型为 `RELATION`。
- `targetFieldId` 必须属于该关联字段指向的目标表。
- P1-01A 的目标字段只允许基础字段或系统预置字段，不允许再次指向 `LOOKUP`、`ROLLUP`、`FORMULA`，避免形成跨表递归计算链。
- 单值关系返回单值；多值关系返回保持关联顺序的数组。
- 目标记录不存在或已归档时返回空值，并产生 `MISSING_TARGET` 计算提示。

### 4.4 ROLLUP 配置

```ts
interface RollupFieldConfig {
  relationFieldId: string
  targetFieldId?: string
  aggregation: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX'
}
```

- `COUNT` 不要求目标字段，统计有效关联记录数。
- `SUM/AVG/MIN/MAX` 要求基础数值型目标字段，不接受计算字段；空值不参与聚合。
- 没有有效数值时，`SUM` 返回 `0`，其余数值聚合返回空值。

### 4.5 FORMULA 配置

```ts
interface FormulaFieldConfig {
  expression: string
  astVersion: 1
  dependencies: string[]
  ast: FormulaAst
}
```

用户输入表达式，后端保存前完成词法分析、语法分析、字段解析和类型检查。`dependencies` 保存稳定字段 ID；`ast` 只允许后端生成，客户端提交的 AST 被忽略。

- 公式只能引用当前表字段，可以依赖基础字段、`LOOKUP`、`ROLLUP` 或同表其他 `FORMULA`。
- 字段 `key` 创建后不可修改；显示名称可以修改，不影响按字段 ID 保存的依赖和 AST。
- 保存或更新公式时，后端对当前表完整计算依赖图做循环检测，发现循环返回 400；读取阶段仍保留 `CYCLE` 防御，兼容异常或历史数据。

## 5. 安全公式语法

### 5.1 基础语法

- 字段引用：`{amount}`、`{status}`、`{due_at}`。
- 字面量：数字、双引号字符串、`TRUE`、`FALSE`、`NULL`。
- 运算符：`+ - * / %`、`= != > >= < <=`。
- 文本拼接使用 `CONCAT`，不让 `+` 同时承担数字和文本两套隐式规则。
- 括号控制优先级。

### 5.2 首批函数

- 条件与空值：`IF(condition, yes, no)`、`COALESCE(value, fallback)`。
- 数值：`ROUND(value, digits)`、`ABS(value)`、`SUM(...)`、`COUNT(...)`。
- 文本：`CONCAT(...)`、`LOWER(value)`、`UPPER(value)`、`LEN(value)`。
- 日期：`DATE_ADD(date, amount, unit)`、`DATE_DIFF(left, right, unit)`，`unit` 仅允许 `day/hour/minute`。

### 5.3 安全边界

- 禁止 `eval`、`Function`、属性访问、数组下标、循环、赋值、网络、文件和环境变量访问。
- 解析器限制表达式最大 2,000 字符、AST 最大 256 个节点、调用深度最大 32。
- 除零、类型错误和超限不会使整页失败；该字段返回空值并附带结构化错误。

## 6. 计算引擎

新增独立的 `FormulaParser`、`FormulaEvaluator` 和 `ComputedFieldResolver`：

1. 服务读取当前页原始记录和字段定义。
2. Resolver 建立当前表计算字段依赖图，使用 DFS + memo 计算字段，并检测循环。
3. 关联目标按 `targetTableId` 和记录 ID 批量加载，禁止逐单元格查询。
4. LOOKUP/ROLLUP 先计算，FORMULA 再按依赖顺序计算。
5. 同一请求内相同目标表和记录只加载一次。
6. 系统预置表通过现有 source adapter 读取；自定义表直接读取 `DataRecord`。

计算结果写入响应的 `values[field.key]`，错误放入可选字段：

```ts
interface ComputedFieldError {
  code: 'INVALID_FORMULA' | 'TYPE_ERROR' | 'DIV_ZERO' | 'CYCLE' | 'MISSING_TARGET'
  message: string
}

interface UnifiedDataRecord {
  // 现有字段省略
  computedErrors?: Record<string, ComputedFieldError>
}
```

前端将 `CYCLE` 显示为 `#CYCLE!`、除零显示为 `#DIV/0!`，其他错误显示错误图标和可读提示。

## 7. API 与校验

沿用字段 CRUD，不增加第二套模型 API：

- `POST /api/base/tables/:tableId/fields`：创建关系或计算字段；双向关系创建请求额外接受 `inverseFieldName` 和 `inverseMultiple`，后端根据类型校验配置。
- `PATCH /api/base/fields/:id`：字段 `key` 不可修改；修改显示名称或配置后重新校验依赖和循环；系统预置字段仍不可修改。
- `DELETE /api/base/fields/:id`：计算字段直接归档；关系字段执行关系清理规则。
- `GET /api/base/tables/:tableId/records`：返回解析后的计算值和 `computedErrors`。
- `PATCH /api/base/tables/:tableId/records/:recordId`：计算字段写入返回 400；双向关系在事务中同步。
- `POST /api/base/tables/:tableId/formula-preview`：接收表达式和可选 `recordId`，返回规范化依赖、预览结果或带字符位置的错误，不持久化配置。

字段配置错误统一返回 400；目标表/字段不存在返回 404；配对字段并发冲突返回 409。

## 8. 前端交互

### 8.1 字段管理

- `RELATION`：选择目标表、单值/多值、单向/双向；双向时填写反向字段名称。
- `LOOKUP`：先选择当前表的关联字段，再选择目标字段。
- `ROLLUP`：选择关联字段、聚合方式和适用的目标字段。
- `FORMULA`：多行公式编辑器、可插入字段列表、校验/预览结果和错误位置。

配置选择器只展示合法候选项，避免保存后才由后端拒绝。

### 8.2 记录与视图

- Grid 将 LOOKUP/ROLLUP/FORMULA 作为只读单元格。
- 表单不显示计算字段；关联字段使用可搜索的目标记录选择器，不再要求手工输入 ID。
- 看板禁止把计算字段作为可拖动分组字段。
- 日历只允许结果稳定且无错误的日期基础字段；本批次不允许公式日期作为日历字段。
- 关系或源字段更新成功后，失效当前表、目标表和所有 base workspace 查询。

## 9. 一致性与兼容性

- 新增一个后续 Prisma 迁移扩展 `DataFieldType`，不修改 P0-D 已应用迁移。
- 旧 RELATION 字段若没有 `targetTableId`，继续按原有字符串方式展示，但字段管理提示补全目标表后才能使用选择器、查找和聚合。
- 计算字段永远不可设为主字段或必填字段。
- 归档目标记录不会改写来源关系值；读取时忽略并提示缺失目标，便于目标恢复后关系自动恢复。
- 本批次不做后台物化和缓存；单页上限继续为 100 条，通过批量加载和请求级 memo 控制性能。

## 10. 测试与验收

### 后端

- 字段配置：合法/非法目标、类型约束、系统表限制、配对字段创建和删除。
- 双向关系：一对一、一对多、多对多、新增、移除、多值差集、事务回滚、稳定锁顺序和并发冲突。
- 公式解析：优先级、字段引用、函数、字符位置、节点/深度限制、禁止语法。
- 计算：LOOKUP、COUNT/SUM/AVG/MIN/MAX、同表跨计算字段依赖、缺失目标、循环、除零和类型错误。
- 查询数量：同一目标表批量加载，不产生按记录/字段增长的 N+1。

### 前端

- 字段管理的四类配置流程和候选项限制。
- 关联搜索选择器的单值/多值保存。
- 计算单元格只读、错误展示、表单排除计算字段。
- 公式预览成功/失败、pending 防重复和失败后保留草稿。

### 真实服务验收

1. 创建“岗位”和“候选人”两张自定义表。
2. 创建双向关系并确认双方记录同步。
3. 创建岗位名称 LOOKUP、面试轮次 COUNT 和平均评分 AVG。
4. 创建 `IF({avg_score} >= 80, "通过", "继续评估")` 公式。
5. 修改评分后确认表格公式立即变化；看板/表单仍使用同一记录。
6. 制造并修复循环引用，页面只显示字段错误，不出现整页错误。
7. 清理验收数据并复核数据库无镜像业务记录。
