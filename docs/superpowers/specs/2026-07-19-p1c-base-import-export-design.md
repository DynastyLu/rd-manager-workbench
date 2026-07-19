# P1-01C 多维表格导入导出设计

**状态：** 已确认
**范围：** CSV/Excel 导入预检、字段映射、错误行下载、当前视图与完整表导出  
**前置版本：** P0-D 多维表格最小可用版、P1-01A/B

## 1. 目标

让用户在选中的自定义数据表中安全导入 CSV 或 Excel，并在真正写库前确认工作表、字段映射、类型识别和错误；同时将当前视图或完整表导出为 CSV/Excel。解析、校验和批量写入由本地后端完成，浏览器只负责选择文件和展示进度。

## 2. 范围边界

- 导入目标只允许自定义表；系统预置表只支持导出，避免绕过原业务对象规则批量写入。
- 支持 `.csv` 和 `.xlsx`，不支持旧 `.xls`、宏、公式执行、嵌入对象或压缩包。
- Excel 公式单元格只读取已缓存的结果；不存在缓存结果时作为空值并产生行错误，不在本机计算公式。
- 本批次只做追加导入，不按主字段更新、覆盖或删除已有记录。
- 附件字段不能从单元格路径自动上传；关联字段按目标表主字段文本匹配，零个或多个匹配都作为行错误。

## 3. 安全限制

- 单文件最大 20 MiB、50,000 个数据行、200 列。
- 单元格转换为文本后最大 10,000 字符，超限记录为错误。
- 只接受 CSV 与 XLSX 的 MIME、扩展名和文件签名组合；文件名只保留安全显示名称。
- CSV 自动检测 UTF-8/UTF-8 BOM；无法解码时拒绝，不猜测系统编码。
- 导入临时文件放入应用数据目录的隔离 `imports/<sessionId>`，不采用用户传入路径；24 小时后清理。

## 4. 导入会话

新增 `DataImportSession`：

```ts
type DataImportStatus = 'UPLOADED' | 'PREVIEWED' | 'IMPORTING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'EXPIRED'

interface DataImportSession {
  id: string
  tableId: string
  originalName: string
  format: 'CSV' | 'XLSX'
  selectedSheet: string | null
  status: DataImportStatus
  mapping: Json
  totalRows: number
  validRows: number
  errorRows: number
  sourceStorageKey: string
  errorStorageKey: string | null
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}
```

- 数据库只保存元数据和受控 storage key，不保存任意绝对路径。
- 源文件与错误 CSV 由本地存储适配器保存；成功或失败都保留到过期时间，便于下载结果。
- 同一会话只能提交一次；重复提交已完成会话返回原结果，正在导入返回 409。

## 5. 字段映射与转换

```ts
interface ImportColumnMapping {
  sourceColumn: string
  targetFieldId?: string
  newField?: { name: string; key: string; type: 'TEXT' | 'LONG_TEXT' | 'NUMBER' | 'DATETIME' | 'SINGLE_SELECT' | 'MULTI_SELECT' | 'CHECKBOX' | 'LINK' }
  ignored?: boolean
}
```

- 每个源列只能映射一个目标；每个目标字段最多被一个源列映射。
- 必填主字段必须映射。
- 可映射已有基础可写字段，或在提交时创建一个新的基础字段。
- `LOOKUP`、`ROLLUP`、`FORMULA`、`CREATED_AT`、`UPDATED_AT` 和 `ATTACHMENT` 不可作为导入目标。
- NUMBER 接受标准十进制文本；DATETIME 接受 Excel 日期值或可解析 ISO/本地日期文本；CHECKBOX 接受 `true/false`、`是/否`、`1/0`。
- 多选使用逗号、中文逗号或换行分隔；单选/多选值必须存在于字段选项中。
- RELATION 不支持创建新字段映射；映射到现有关系字段时按目标主字段精确匹配，并遵守单值/多值配置。

## 6. API 与流程

1. `POST /api/base/tables/:tableId/imports`：multipart 上传，返回会话、工作表列表、列名、推断类型和前 100 行。
2. `PATCH /api/base/imports/:id/preview`：提交工作表和映射，重新扫描全量数据，返回有效/错误数量及前 100 条错误，不写业务记录。
3. `POST /api/base/imports/:id/commit`：锁定会话，先事务创建新字段，再按 250 行一批写入有效记录；错误行不写入。
4. `GET /api/base/imports/:id`：返回会话进度和最终统计。
5. `GET /api/base/imports/:id/errors`：下载 UTF-8 BOM CSV，保留原列并追加 `__row_number`、`__error_fields`、`__error_message`。
6. `DELETE /api/base/imports/:id`：未在导入中的会话可提前清理临时文件并标记过期。

提交期间若某个批次发生数据库异常，当前批次回滚，先前批次保留，会话标记 `PARTIAL` 并将未写入行加入错误文件。前端明确显示成功和失败数量，不把部分成功显示为全部完成。

## 7. 导出

`GET /api/base/tables/:tableId/export?format=csv|xlsx&scope=view|all&viewId=...`

- `scope=view` 必须提供属于当前表的 `viewId`，使用该视图保存的筛选和排序，并排除隐藏字段。
- `scope=all` 导出完整数据集和全部未归档字段，按字段 sequence 排列。
- 导出包含 P1-01A 的计算结果；数组使用 `, ` 拼接，日期统一输出本地时区可读值，同时 Excel 单元格保留日期类型。
- CSV 使用 UTF-8 BOM；Excel 首行冻结并启用筛选，列宽设置安全上限。
- 文件名格式为 `<表名>-<视图名或全部>-YYYYMMDD-HHmm.<扩展名>`，所有名称经过安全化。
- 导出采用后端流式响应，不受页面 100 条分页限制。

## 8. 前端交互

- `BaseToolbar` 增加“导入”和“导出”。系统预置表隐藏导入，但保留导出。
- 导入使用五步弹窗：选择文件、选择工作表、字段映射、全量预检、结果。
- 映射页给出类型建议但不自动提交；未映射列默认为忽略。
- 预检必须完成且映射未变化才能点击确认导入；映射变化后预检结果立即失效。
- 结果页显示成功、失败、跳过数量，并在有错误时提供“下载错误行”。
- 导出弹窗选择 CSV/Excel 与当前视图/完整表，浏览器使用后端 `Content-Disposition` 下载。

## 9. 错误处理

- 文件格式、大小、工作表、映射错误返回 400；不存在或过期会话返回 404/410；重复提交冲突返回 409。
- 文件解析器不返回内部路径、SQL 或堆栈信息。
- 导入失败后保留用户映射和错误摘要，允许下载错误文件，但不允许复用同一会话再次写库。
- 创建新字段和开始写记录必须处于同一事务边界；字段创建失败时不写入任何记录。

## 10. 测试与验收

### 后端

- CSV/XLSX 编码、签名、限制、工作表选择和恶意文件名。
- 各基础字段转换、关系匹配、必填、非法选项和计算字段拒绝。
- 预检零写入、重复提交幂等、批次回滚、部分成功和临时文件清理。
- 当前视图与完整表导出字段、顺序、总行数和公式结果。

### 前端

- 五步状态、映射失效预检、防重复提交、部分成功和错误下载。
- 系统预置表不显示导入；导出文件请求参数正确。

### 真实服务验收

1. 导入一份同时包含有效和错误行的 CSV，确认预检不写库。
2. 提交后只新增有效记录，错误 CSV 可下载且包含原值和原因。
3. 导入多工作表 XLSX 并选择非首个工作表。
4. 分别导出当前筛选视图和完整表，确认字段与行数不同且正确。
5. 清理导入会话与验收记录，确认存储目录不存在遗留临时文件。
