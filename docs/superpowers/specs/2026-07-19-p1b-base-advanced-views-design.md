# P1-01B 多维表格进阶视图设计

**状态：** 已确认
**范围：** 甘特视图、画册视图、保存筛选、单人个人视图配置  
**前置版本：** P0-D 多维表格最小可用版、P1-01A 关联与计算

## 1. 目标

在现有同一份 `DataTable`、`DataRecord` 和 `DataView` 数据上增加飞书式甘特和画册视图，并让每个视图独立保存查询、筛选、排序、分组和展示设置。切换视图不复制记录，任何视图中的可写修改都回到原记录。

## 2. 范围边界

- 本地单人版不增加用户、角色或视图权限表；所有用户创建的视图都是当前本机的个人视图。
- 不实现多人共享视图、发布视图、字段级权限、时间基线、关键路径或跨表甘特依赖线。
- 甘特和画册只消费当前表记录；系统预置表与自定义表均可创建视图，但只有原本可写的日期字段允许拖动回写。

## 3. 数据模型

Prisma 和前端 `DataViewType` 新增：

- `GANTT`
- `GALLERY`

不新增专用视图表。现有 `DataView.config` 保存完整个人视图配置。

```ts
interface ViewFilter {
  fieldKey: string
  operator: 'EQ' | 'NE' | 'CONTAINS' | 'NOT_CONTAINS' | 'EMPTY' | 'NOT_EMPTY' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'BEFORE' | 'AFTER' | 'IN'
  value?: unknown
}

interface ViewSort {
  fieldKey: string
  direction: 'asc' | 'desc'
}

interface SharedViewConfig {
  query?: string
  filters?: ViewFilter[]
  sorts?: ViewSort[]
  groupField?: string
  hiddenFieldIds?: string[]
  fieldOrder?: string[]
}
```

- 单个视图最多保存 20 个筛选条件和 5 个排序条件。
- 条件之间首批统一使用 AND；`IN` 的值最多 100 项。
- 旧的 `filterField`、`filterValue`、`sortField`、`sortOrder` 读取时转换为新数组格式，首次保存后写成新格式。
- 被删除或归档字段对应的条件读取时忽略并在视图设置中显示失效提示，不使整页失败。

## 4. 服务端查询

`GET /api/base/tables/:tableId/records` 增加可选 `viewId`。传入后，后端校验视图属于当前表，并使用视图保存的 query、filters 和 sorts 查询完整数据集后再分页。

- 自定义表由 `BaseService` 的查询解析器处理。
- 系统预置表由 `SystemRecordsAdapter` 接受同一规范化查询结构。
- 计算字段可用于显示，但 P1-01B 不允许作为服务端筛选、排序、分组或甘特日期字段，避免读取时计算改变分页集合。
- 查询参数中的临时 `query` 可以覆盖视图保存的全文查询；其他配置以已保存视图为准。
- 返回的 `meta.total` 必须是完整过滤结果数量，不能只过滤当前页。

## 5. 甘特视图

```ts
interface GanttViewConfig extends SharedViewConfig {
  titleFieldKey?: string
  startFieldKey?: string
  endFieldKey?: string
  scale?: 'DAY' | 'WEEK' | 'MONTH'
  rowHeight?: 'COMPACT' | 'STANDARD'
}
```

- 主体采用左侧冻结记录列表、右侧可横向滚动时间轴。
- 必须选择两个基础 `DATETIME` 字段作为开始和结束；两者可以相同，此时显示单日任务条。
- 缺少开始或结束日期的记录进入“未排期”分组；结束早于开始时显示行级错误，不渲染负长度任务条。
- 支持日、周、月缩放，默认周；进入视图时滚动到当前日期附近并显示“今天”标线。
- 拖动任务条整体平移开始/结束时间；拖动左右边缘调整单侧日期。保存失败时恢复原位置并显示错误。
- 系统预置表只有适配器声明为可写的日期字段才显示拖动手柄，否则甘特只读。
- 任务条点击打开现有记录详情或原业务对象，不建立甘特副本。

## 6. 画册视图

```ts
interface GalleryViewConfig extends SharedViewConfig {
  titleFieldKey?: string
  coverFieldKey?: string
  visibleFieldIds?: string[]
  cardSize?: 'COMPACT' | 'STANDARD' | 'WIDE'
  coverFit?: 'COVER' | 'CONTAIN'
}
```

- 标题字段默认使用主字段。
- 封面允许 `ATTACHMENT` 或 `LINK`；附件取第一个可显示图片，链接仅接受 `http/https` 图片地址。
- 没有封面或加载失败时显示按标题生成的稳定渐变占位，不显示破图。
- 卡片最多展示 8 个附加字段；长文本截断，多选以标签显示，计算错误沿用 P1-01A 错误提示。
- 卡片点击打开记录详情；画册本身不支持行内修改，修改通过详情抽屉或表单完成。

## 7. 前端交互

- `ViewManager` 增加甘特、画册图标和类型说明。
- 视图设置统一放入右侧抽屉：名称、筛选、排序、分组、字段显示以及当前视图专属配置。
- 筛选条件使用字段类型决定可选运算符和值编辑器；非法组合不能保存。
- 配置修改先乐观更新当前界面，350ms 防抖保存；保存失败回滚到服务端配置。
- 新建视图默认继承当前视图的共享筛选/排序配置，但不继承类型专属字段。
- 支持将任意视图设为默认视图；删除默认视图后沿用现有规则选择下一视图。

## 8. 错误与兼容

- 非法字段、运算符或视图归属返回 400；不存在的视图返回 404。
- 视图配置由后端白名单规范化，未知键保留兼容但不参与执行。
- 旧 GRID/KANBAN/CALENDAR/FORM 行为保持不变，并逐步共用新的筛选/排序组件。
- 甘特更新使用现有记录写入接口，因此保留字段校验、系统对象回写和缓存失效行为。

## 9. 测试与验收

### 后端

- 新旧配置转换、多条件筛选、多字段排序、分页总数和字段归档兼容。
- `viewId` 表归属校验，系统预置表与自定义表查询结果一致。
- 甘特日期更新沿用字段可写限制和日期校验。

### 前端

- 甘特未排期、非法日期、缩放、拖动成功/回滚和打开原对象。
- 画册封面、占位图、字段选择、卡片尺寸和记录详情。
- 视图独立保存、切换、默认视图和保存失败回滚。

### 真实服务验收

1. 在一张自定义表中创建开始、结束日期和封面字段。
2. 创建甘特视图，拖动任务条并确认表格中的原日期同步变化。
3. 创建画册视图，配置封面和展示字段并确认无封面占位正常。
4. 分别保存两组不同筛选，切换视图后配置互不覆盖。
5. 刷新页面并重启本地服务，视图和筛选仍然存在。
