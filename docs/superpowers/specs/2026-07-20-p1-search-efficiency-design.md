# P1-02 全局搜索与个人效率设计

## 1. 目标

在现有 `/search` 顶级入口交付本机单人全局搜索：覆盖主要业务对象和多维表格记录，支持分类过滤、安全高亮、最近搜索和少量可撤销/可确认的快捷操作。搜索结果必须打开现有真实对象，不能复制一份搜索专用业务数据。

## 2. 方案选择

比较三种方案：

1. PostgreSQL 全文索引与统一搜索文档：查询快，但需要所有写入口持续维护索引，当前模块多且容易产生陈旧结果。
2. 前端逐接口聚合：实现快，但分页、排序、归档过滤和错误处理不一致，页面还会产生大量请求。
3. 后端适配器注册表按领域参数化查询：由一个 SearchService 调用允许清单内适配器、统一排序和分页，不产生第二份业务数据。

采用方案 3。第一版是本机单人数据量，优先保证结果实时、对象一致和可维护性；适配器接口为未来切换 PostgreSQL FTS 保留边界。

## 3. 搜索范围

固定类型：`PROJECT`、`TASK`、`APPLICATION_CASE`、`MEETING`、`DOCUMENT`、`FILE`、`RISK`、`ISSUE`、`DECISION`、`PARTNER`、`COMMUNICATION`、`NON_PROJECT_RD`、`INTELLIGENCE_ITEM`、`BASE_RECORD`。

- P1-02 首次交付时不存在的后续类型返回空组，不返回假数据；P1-04/P2-01 模块接入后注册对应适配器。
- 默认排除软归档、回收站和不可用关联对象。
- 关键词去除首尾空白后长度为 2～100；连续空白折叠为单空格。
- `types` 是枚举允许清单，最多 14 项；默认搜索全部已注册类型。
- 每个领域适配器最多返回 100 个候选；统一服务最多保留 500 个候选后计算分页，避免无界内存。

## 4. 结果契约与排序

`GET /api/search?q=&types=&page=1&pageSize=20` 返回：

```ts
interface GlobalSearchResult {
  data: SearchHit[]
  groups: Array<{ type: SearchType; count: number }>
  meta: { page: number; pageSize: number; total: number }
}

interface SearchHit {
  type: SearchType
  id: string
  title: string
  snippet: string | null
  path: string
  updatedAt: string
  score: number
  matches: Array<{ field: 'title' | 'snippet'; start: number; end: number }>
  actions: SearchAction[]
}
```

排序：标题完整相等 400 分，标题前缀 300，标题包含 200，摘要/正文包含 100；多字段命中累加 10，最后按 `score desc, updatedAt desc, type, id`。高亮区间由服务端按 Unicode 字符索引计算，前端只拆分文本节点并渲染 `<mark>`，绝不使用 `dangerouslySetInnerHTML`。

## 5. 最近搜索

最近搜索属于 renderer 本地个人偏好，使用版本化 localStorage key `rd-workbench:recent-searches:v1`，不进入 PostgreSQL、备份和审计。

- 只有成功返回搜索结果的显式提交才记录；输入法中间状态和每次按键不记录。
- 相同规范化词与 types 组合更新原记录并增加 `useCount`。
- 只保留最近 20 条；结构解析失败时安全回退为空数组，不阻塞搜索。
- 单条删除和全部清空都只修改该版本化 key，不影响业务对象。
- 未来多人/LAN 版本若需要跨设备同步，再迁移为用户级服务端模型；P1 不提前引入无账号归属的数据表。

## 6. 快捷操作

所有结果都有前端本地 `OPEN` 与 `COPY_LINK`。后端只开放三项白名单动作：

- 任务：`COMPLETE_TASK`、`REOPEN_TASK`，复用 TasksService 的状态规则。
- 文档：`TOGGLE_DOCUMENT_FAVORITE`，复用 DocumentsService。
- 风险：`CLOSE_RISK` 需要二次确认，复用 RisksService 并写关闭时间。

接口为 `POST /api/search/actions/:type/:id`，body `{ action }`。服务端根据命中类型再次查询活动对象并校验动作，不接受任意路径、字段或 PATCH 内容。成功后返回更新后的 SearchHit，前端只失效搜索和对应领域缓存。

## 7. 前端体验

- `/search` 替换 `AutomationDataPage`，保持七入口侧栏和工作区顶栏。
- 页面包含主搜索框、最近搜索、分类 chips、结果列表和右侧快捷预览；`⌘K/Ctrl+K` 聚焦搜索框。
- 空输入展示最近搜索与搜索范围；无结果展示修改关键词建议；任一适配器失败时保留其他结果并显示可重试的部分失败提示。
- 关键词变化 250ms debounce，但只有回车、点击搜索或选择最近记录才写最近搜索。
- 搜索路径只允许应用路由表中的本地 `/#/...` 路径；外部链接只作为 FILE/DOCUMENT 内容中的显式次要操作。

## 8. 错误与安全

新增错误码：`SEARCH_QUERY_INVALID`、`SEARCH_TYPE_INVALID`、`SEARCH_RESULT_NOT_FOUND`、`SEARCH_ACTION_UNSUPPORTED`、`SEARCH_PARTIAL_FAILURE`。

- Prisma 查询只使用结构化条件或参数化 `$queryRaw`；Base JSONB 查询的表 ID 来自服务端目录，关键词始终参数绑定。
- 返回摘要最多 240 字符，不返回文档完整正文、附件字节、联系方式、密钥或审计前后快照。
- 快捷动作写入审计；普通搜索 GET 和最近搜索不写审计，避免记录个人检索内容。若后续需要性能统计，只允许记录不可逆 query SHA-256、类型和结果数，不记录正文。

## 9. 验收

- 同一关键词可找到项目、任务、会议、文档、合作方和多维表格记录，分类计数与过滤一致。
- 中文和英文高亮区间正确，恶意 HTML 作为纯文本显示。
- 刷新后最近搜索存在，可删除单条和全部清空，最多保持 20 条。
- 任务完成、文档收藏和风险关闭调用真实服务；失败时结果不乐观残留。
- 页面加载、空态、部分失败、完整失败、重试和键盘操作均有自动化测试与真实浏览器验收。
