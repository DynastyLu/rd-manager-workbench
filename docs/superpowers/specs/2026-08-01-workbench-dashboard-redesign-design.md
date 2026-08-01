# 工作台首页大屏 Dashboard 重设计规范

- **Date:** 2026-08-01
- **Status:** Approved by user
- **Scope:** `frontend/src/pages/WorkbenchHome.tsx` 及其样式、相关组件
- **Related:** `frontend/src/styles/workspace-tokens.css`, `frontend/src/modules/workbench/api/dashboard`, ECharts

## 1. 背景与目标

当前工作台首页（`WorkbenchHome`）使用旧的 `.app-page` 居中窄容器，卡片堆砌、信息密度低、缺少视觉焦点，被评价为“太丑”。

本设计目标：
1. 把工作台首页改造成**全宽大屏 Dashboard（驾驶舱）**，充分利用屏幕宽度。
2. 一眼呈现关键指标（KPI）、快捷入口、项目健康度、待办/逾期/里程碑、需关注项目。
3. 使用 ECharts 绘制项目健康度环形图等小型图表，增强数据感。
4. 完全复用现有 `/dashboard` 接口数据，**不改动后端**。
5. 延续 Aurora Glass 视觉系统：玻璃卡片、渐变、动效、护眼主题兼容。

## 2. 总体布局

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  研发主管工作台                                      2026-08-01 周五 09:30    │
├─────────┬─────────┬─────────┬─────────┬───────────────────────────────────────┤
│ 12      │ 5       │ 3       │ 8       │  常用应用（8 个图标卡片）              │
│ 进行项目│ 今日待办│ 逾期任务│ 临近里程碑                              │
├─────────┴─────────┴─────────┴─────────┴───────────────────────────────────────┤
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌──────────────┐  │
│  │ 项目健康度    │  │ 任务状态分布  │  │ 今日行动      │  │ 逾期任务     │  │
│  │   环形图      │  │   迷你条形图  │  │   TOP 5 列表  │  │   TOP 5 列表 │  │
│  └───────────────┘  └───────────────┘  └───────────────┘  └──────────────┘  │
│  ┌────────────────────────────────┐  ┌─────────────────────────────────┐     │
│  │ 需关注项目（黄/红 + 原因）     │  │ 最近进展汇报                     │     │
│  └────────────────────────────────┘  └─────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 页面容器

- 外层改为 `.workspace-page`，使用全宽 Aurora 渐变背景。
- 内层 `.workspace-page__inner`（不加 `--narrow`），内容横向铺满，padding 保持 `--workspace-page-padding`。
- 顶部保留简洁标题栏：左侧页面标题 + 副标题，右侧显示当前日期（动态生成，无需接口）。

## 3. 模块详细设计

### 3.1 KPI 数字卡（顶部第一行）

共 4 张，占据左侧 4 列；右侧并排放置常用应用快捷入口区。

| 指标 | 数据来源 | 说明 |
|---|---|---|
| 进行项目 | `dashboard.healthDistribution` 三项之和 | 当前未归档项目总数 |
| 今日待办 | `dashboard.todayActions.length` | 今日截止的活跃任务 |
| 逾期任务 | `dashboard.overdueTasks.length` | 已过截止日仍未完成的任务 |
| 临近里程碑 | `dashboard.dueSoonMilestones.length` | 未来 7 天内到期的里程碑 |

视觉要求：
- 使用 `.workspace-card` 玻璃卡片。
- 数字使用大字号（28–32px）、字重 700。
- 标签使用 `--workspace-text-secondary` 小字。
- 每张卡片配一个与指标语义相关的图标/色块（紫/蓝/橙/绿）。
- 悬停时卡片轻微上浮 + 阴影加深。
- 进入页面时数字从 0 计数动画到目标值（约 600ms，ease-out）。

### 3.2 常用应用快捷入口

- 保留现有 8 个入口：非项目研发、合作方、资源负荷、行业情报、统计报表、数据安全、多维表格、全局搜索。
- 改为图标 + 标题 + 描述的玻璃卡片网格。
- 图标容器使用 Aurora 渐变背景，白色图标。
- 悬停时上浮 + 边框变品牌色。
- 进入动画：stagger 淡入上浮，每张延迟 50ms。

### 3.3 图表区

#### 3.3.1 项目健康度环形图

- 使用 ECharts 饼图，半径 `['45%', '70%']`，中心显示总项目数。
- 颜色：绿 `#10b981`、黄 `#f59e0b`、红 `#ef4444`（必须引用 workspace tokens，不能写死 hex；图表颜色通过 token 读取）。
- 图例在下方或右侧，显示数量与百分比。
- 点击图例/扇区可筛选下方“需关注项目”列表（仅黄/红）。

#### 3.3.2 任务状态分布迷你条形图

- 从 `todayActions` + `overdueTasks` 按状态聚合：TODO / IN_PROGRESS / BLOCKED。
- 使用 ECharts 横向条形图，紧凑高度。
- 颜色使用 workspace info/brand/warning tokens。

> 若数据不足导致图表为空，显示友好空状态“暂无数据”，不展示空白区域。

### 3.4 列表 Widgets

统一使用 `.workspace-card` 作为容器，标题在卡片 header，内容在卡片 body。

| Widget | 数据 | 展示规则 |
|---|---|---|
| 今日行动 | `todayActions` | 最多 6 条，标题 + 负责人 + 截止时间；可点击跳转任务详情 |
| 逾期任务 | `overdueTasks` | 最多 6 条，标题 + 逾期天数（红色高亮）；可点击跳转 |
| 临近里程碑 | `dueSoonMilestones` | 最多 6 条，里程碑名 + 所属项目 + 计划日期 |
| 需关注项目 | `projectsNeedingAttention` | **必须显示**，按健康度黄/红排序；显示项目名称、健康色点、原因标签 |
| 最近进展汇报 | `recentProgressReports` | 最多 5 条，项目名 + 汇报摘要前 60 字 + 汇报时间 |

空状态：当列表为空时，卡片内显示一句友好提示，不隐藏卡片。

## 4. 动效规范

- 页面进入：整体 fadeInUp，duration 400ms，ease-out。
- KPI 卡片：stagger 100ms 逐个上浮出现。
- 快捷入口：stagger 50ms。
- 图表：ECharts 自带动画，启用 `animationDuration: 800`。
- 列表 widget：stagger 150ms 上浮出现。
- 悬停：卡片 `translateY(-2px)` + shadow 加深（使用 `.workspace-card:hover` 已有样式）。
- 数字：从 0 计数到目标值，使用 requestAnimationFrame。
- 尊重 `prefers-reduced-motion`：关闭计数和进入动画，仅保留颜色状态变化。

## 5. 响应式断点

| 屏幕宽度 | 列数 |
|---|---|
| ≥1440px | KPI 4 列 + 快捷入口 4 列；下方图表/列表 4 列 |
| ≥1180px | KPI 4 列 + 快捷入口 4 列；下方 3 列 |
| ≥900px  | KPI 2 列 + 快捷入口 4 列；下方 2 列 |
| <900px  | 全部 1 列，快捷入口 2 列 |

## 6. 视觉约束

- 所有颜色必须引用 `var(--workspace-*)`；ECharts 颜色通过读取 CSS 变量后传入。
- 字体：主标题 26px/700，KPI 数字 28–32px/700，卡片标题 15px/600，正文 14px/400。
- 卡片间距 16px（gap-4），卡片内边距 20px。
- 不使用大段边框线，靠阴影和背景区分层次。

## 7. 依赖

- 新增 `echarts` 和 `echarts-for-react`（或自写 React 包装器）。
- 不新增其他图表/动画库。

## 8. 关键文件变更

- `frontend/src/pages/WorkbenchHome.tsx`：重写页面结构。
- `frontend/src/pages/WorkbenchHome.less`：新增页面级样式。
- `frontend/package.json`：新增 echarts / echarts-for-react 依赖。
- `frontend/src/styles/workspace-tokens.css`：若图表所需颜色 token 缺失则补充。
- 可选新增组件（若不复用现有卡片）：
  - `frontend/src/components/dashboard/DashboardKpiCard.tsx`
  - `frontend/src/components/dashboard/DashboardQuickApps.tsx`
  - `frontend/src/components/dashboard/HealthDonutChart.tsx`
  - `frontend/src/components/dashboard/DashboardWidget.tsx`

## 9. 验收标准

- [ ] 工作台首页全宽显示，无居中窄容器。
- [ ] 4 个 KPI 数字正确显示，带计数动画。
- [ ] 8 个快捷入口可点击跳转。
- [ ] ECharts 图表正常渲染，颜色跟随 Aurora 主题。
- [ ] 需关注项目列表展示项目名称、健康色点和原因。
- [ ] 今日行动、逾期任务、临近里程碑、最近汇报列表正常显示。
- [ ] 空状态友好提示。
- [ ] 响应式布局在不同宽度下不错乱。
- [ ] `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 全部通过。

## 10. 后续扩展

- 可在 KPI 区增加“今日日期/周数”或“本周目标”小 widget。
- 可增加“知识库最近更新”或“待办审批”等更多 widget，均按本设计的卡片模式扩展。
