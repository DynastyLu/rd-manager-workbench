# 工作台首页大屏 Dashboard 重设计实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把工作台首页 (`WorkbenchHome`) 重构成全宽 Aurora Glass 风格的大屏 Dashboard，包含 KPI 数字卡、快捷入口、ECharts 图表和列表 Widgets。

**Architecture：** 复用现有 `/dashboard` 接口数据，新增一组可复用的 Dashboard 组件，页面使用 `.workspace-page` 全宽容器，图表通过 `echarts/core` 树摇按需引入，颜色从 workspace tokens 读取。

**Tech Stack：** React + TypeScript + Semi UI + Less + ECharts 5 + Framer Motion（已有）

## Global Constraints

- 所有颜色必须引用 `var(--workspace-*)`；ECharts 颜色通过读取 CSS 变量传入。
- 页面容器默认全宽，不使用 `max-width` 居中。
- 动画使用 `transform` / `opacity`，尊重 `prefers-reduced-motion`。
- 不改动后端接口，仅使用 `DashboardData` 已有字段。
- 每个任务结束后运行 `pnpm lint`、`pnpm typecheck`、相关测试，并提交。

---

### Task 1: 安装 ECharts 依赖

**Files:**
- Modify: `frontend/package.json`
- Run: `frontend/`

**Interfaces:**
- Produces: `echarts` 包可用。

- [ ] **Step 1: 安装依赖**

```bash
cd /Users/dynastylu/Desktop/AICode/rd-manager-workbench/frontend
pnpm add echarts
```

- [ ] **Step 2: 确认安装成功**

```bash
pnpm install
```

Expected: `node_modules/echarts` 存在。

- [ ] **Step 3: 提交**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml
git commit -m "chore(frontend): add echarts dependency for dashboard charts"
```

---

### Task 2: 创建 ECharts React 包装器

**Files:**
- Create: `frontend/src/components/dashboard/ReactECharts.tsx`

**Interfaces:**
- Consumes: ECharts option object and optional theme/color tokens.
- Produces: `<ReactECharts option={option} style={{ height: 240 }} />`

- [ ] **Step 1: 实现组件**

```tsx
import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { PieChart, BarChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  PieChart,
  BarChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  CanvasRenderer,
])

export type EChartsOption = echarts.EChartsCoreOption

interface ReactEChartsProps {
  option: EChartsOption
  className?: string
  style?: React.CSSProperties
}

export function ReactECharts({ option, className, style }: ReactEChartsProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.EChartsType | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const chart = echarts.init(containerRef.current)
    chartRef.current = chart
    chart.setOption(option)

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, true)
  }, [option])

  return <div ref={containerRef} className={className} style={style} />
}

export default ReactECharts
```

- [ ] **Step 2: 运行 typecheck**

```bash
pnpm typecheck
```

Expected: pass.

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/dashboard/ReactECharts.tsx
git commit -m "feat(dashboard): add reusable ECharts React wrapper"
```

---

### Task 3: 创建 KPI 数字卡组件

**Files:**
- Create: `frontend/src/components/dashboard/DashboardKpiCard.tsx`

**Interfaces:**
- Consumes: `label`, `value`, `icon`, `tone`.
- Produces: `<DashboardKpiCard label="进行项目" value={12} icon={<IconProject />} tone="brand" />`

- [ ] **Step 1: 实现组件**

```tsx
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

interface DashboardKpiCardProps {
  label: string
  value: number
  icon: ReactNode
  tone?: 'brand' | 'info' | 'warning' | 'danger'
}

const toneMap = {
  brand: 'dashboard-kpi-card--brand',
  info: 'dashboard-kpi-card--info',
  warning: 'dashboard-kpi-card--warning',
  danger: 'dashboard-kpi-card--danger',
}

function useAnimatedNumber(target: number, duration = 600): number {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      setDisplay(target)
      return
    }
    let start: number | null = null
    let raf = 0
    const step = (timestamp: number) => {
      if (start === null) start = timestamp
      const progress = Math.min((timestamp - start) / duration, 1)
      setDisplay(Math.floor(progress * target))
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return display
}

export function DashboardKpiCard({ label, value, icon, tone = 'brand' }: DashboardKpiCardProps) {
  const animated = useAnimatedNumber(value)
  return (
    <div className={`workspace-card dashboard-kpi-card ${toneMap[tone]}`}>
      <div className="dashboard-kpi-card__icon" aria-hidden="true">{icon}</div>
      <div className="dashboard-kpi-card__body">
        <strong className="dashboard-kpi-card__value">{animated}</strong>
        <span className="dashboard-kpi-card__label">{label}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/components/dashboard/DashboardKpiCard.tsx
git commit -m "feat(dashboard): add animated KPI card component"
```

---

### Task 4: 创建快捷入口组件

**Files:**
- Create: `frontend/src/components/dashboard/DashboardQuickApps.tsx`

**Interfaces:**
- Consumes: app item array.
- Produces: grid of clickable app cards.

- [ ] **Step 1: 实现组件**

```tsx
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

interface QuickAppItem {
  title: string
  description: string
  to: string
  icon: ReactNode
}

interface DashboardQuickAppsProps {
  items: QuickAppItem[]
}

export function DashboardQuickApps({ items }: DashboardQuickAppsProps) {
  return (
    <div className="workspace-card dashboard-quick-apps">
      <h2 className="dashboard-quick-apps__title">常用应用</h2>
      <nav className="dashboard-quick-apps__grid" aria-label="常用应用">
        {items.map((item) => (
          <Link key={item.title} to={item.to} className="dashboard-quick-apps__item">
            <span className="dashboard-quick-apps__icon" aria-hidden="true">{item.icon}</span>
            <span className="dashboard-quick-apps__name">{item.title}</span>
            <span className="dashboard-quick-apps__desc">{item.description}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git commit -m "feat(dashboard): add quick apps grid component"
```

---

### Task 5: 创建图表组件

**Files:**
- Create: `frontend/src/components/dashboard/HealthDonutChart.tsx`
- Create: `frontend/src/components/dashboard/TaskStatusBarChart.tsx`

**Interfaces:**
- Consumes: `data: Record<ProjectHealth, number>` and task arrays.
- Produces: rendered ECharts charts.

- [ ] **Step 1: 实现 HealthDonutChart**

```tsx
import { useMemo } from 'react'
import { ReactECharts } from './ReactECharts'
import type { ProjectHealth } from '@/modules/workbench/types'

interface HealthDonutChartProps {
  data: Record<ProjectHealth, number>
  onSliceClick?: (health: ProjectHealth) => void
}

export function HealthDonutChart({ data, onSliceClick }: HealthDonutChartProps) {
  const total = data.GREEN + data.YELLOW + data.RED
  const option = useMemo(() => {
    const getColor = (token: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(token).trim() || undefined

    return {
      title: {
        text: `${total}`,
        subtext: '项目总数',
        left: 'center',
        top: 'center',
        textStyle: { fontSize: 28, fontWeight: 700, color: getColor('--workspace-text') },
        subtextStyle: { color: getColor('--workspace-text-secondary') },
      },
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, left: 'center' },
      series: [
        {
          name: '项目健康度',
          type: 'pie',
          radius: ['45%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 8, borderColor: getColor('--workspace-surface'), borderWidth: 2 },
          label: { show: false },
          data: [
            { value: data.GREEN, name: '正常', itemStyle: { color: '#10b981' } },
            { value: data.YELLOW, name: '关注', itemStyle: { color: '#f59e0b' } },
            { value: data.RED, name: '风险', itemStyle: { color: '#ef4444' } },
          ],
        },
      ],
    }
  }, [data, total])

  return (
    <div className="workspace-card dashboard-chart">
      <h2 className="dashboard-chart__title">项目健康度</h2>
      <ReactECharts option={option} style={{ height: 240 }} />
    </div>
  )
}
```

- [ ] **Step 2: 实现 TaskStatusBarChart**

```tsx
import { useMemo } from 'react'
import { ReactECharts } from './ReactECharts'
import type { WorkTask } from '@/modules/workbench/types'

interface TaskStatusBarChartProps {
  todayActions: WorkTask[]
  overdueTasks: WorkTask[]
}

export function TaskStatusBarChart({ todayActions, overdueTasks }: TaskStatusBarChartProps) {
  const counts = useMemo(() => {
    const all = [...todayActions, ...overdueTasks]
    return {
      TODO: all.filter((t) => t.status === 'TODO').length,
      IN_PROGRESS: all.filter((t) => t.status === 'IN_PROGRESS').length,
      BLOCKED: all.filter((t) => t.status === 'BLOCKED').length,
    }
  }, [todayActions, overdueTasks])

  const option = useMemo(() => {
    const getColor = (token: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(token).trim() || undefined

    return {
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'value', splitLine: { show: false } },
      yAxis: {
        type: 'category',
        data: ['待办', '进行中', '阻塞'],
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: 'bar',
          data: [
            { value: counts.TODO, itemStyle: { color: getColor('--workspace-info') } },
            { value: counts.IN_PROGRESS, itemStyle: { color: getColor('--workspace-brand') } },
            { value: counts.BLOCKED, itemStyle: { color: getColor('--workspace-warning') } },
          ],
          barWidth: 16,
          itemStyle: { borderRadius: [0, 8, 8, 0] },
          label: { show: true, position: 'right' },
        },
      ],
    }
  }, [counts])

  return (
    <div className="workspace-card dashboard-chart">
      <h2 className="dashboard-chart__title">任务状态分布</h2>
      <ReactECharts option={option} style={{ height: 200 }} />
    </div>
  )
}
```

- [ ] **Step 3: 提交**

```bash
git commit -m "feat(dashboard): add health donut and task status bar chart components"
```

---

### Task 6: 创建列表 Widget 组件

**Files:**
- Create: `frontend/src/components/dashboard/DashboardWidget.tsx`

**Interfaces:**
- Consumes: `title`, `children`, optional `footer`.
- Produces: glass card with header.

- [ ] **Step 1: 实现组件**

```tsx
import type { ReactNode } from 'react'

interface DashboardWidgetProps {
  title: string
  children: ReactNode
  className?: string
}

export function DashboardWidget({ title, children, className = '' }: DashboardWidgetProps) {
  return (
    <div className={`workspace-card dashboard-widget ${className}`}>
      <div className="dashboard-widget__header">
        <h2 className="dashboard-widget__title">{title}</h2>
      </div>
      <div className="dashboard-widget__body">{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git commit -m "feat(dashboard): add dashboard list widget shell"
```

---

### Task 7: 重构 WorkbenchHome 页面

**Files:**
- Modify: `frontend/src/pages/WorkbenchHome.tsx`
- Create: `frontend/src/pages/WorkbenchHome.less`

**Interfaces:**
- Consumes: `DashboardData` from `getDashboard`.
- Produces: full-width dashboard page.

- [ ] **Step 1: 重写页面结构**

```tsx
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  IconBeaker,
  IconBriefcase,
  IconCalendar,
  IconChart,
  IconConfig,
  IconGlobe,
  IconGridSquare,
  IconSearch,
} from '@douyinfe/semi-icons'
import { Button } from '@/components/workspace/SemiCompat'
import { Skeleton } from '@/components/workspace/SemiCompat'
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard'
import { DashboardQuickApps } from '@/components/dashboard/DashboardQuickApps'
import { DashboardWidget } from '@/components/dashboard/DashboardWidget'
import { HealthDonutChart } from '@/components/dashboard/HealthDonutChart'
import { TaskStatusBarChart } from '@/components/dashboard/TaskStatusBarChart'
import { getDashboard } from '@/modules/workbench/api/dashboard'
import { ROUTES } from '@/constants/routes'
import type { ProjectHealth, WorkTask, Milestone, ProgressReport } from '@/modules/workbench/types'
import './WorkbenchHome.less'

const quickApps = [
  { title: '非项目研发', description: '预研、技术债与成果', to: `${ROUTES.OPERATIONS}?tab=non-project-rd`, icon: <IconBeaker /> },
  { title: '合作方', description: '联系人、协议与沟通', to: ROUTES.PARTNERS, icon: <IconBriefcase /> },
  { title: '资源负荷', description: '13 周容量与投入', to: `${ROUTES.OPERATIONS}?tab=resources`, icon: <IconChart /> },
  { title: '行业情报', description: '来源、情报卡与简报', to: ROUTES.INTELLIGENCE, icon: <IconGlobe /> },
  { title: '统计报表', description: '项目、任务、风险统计', to: ROUTES.REPORTS, icon: <IconChart /> },
  { title: '数据安全', description: '备份、恢复与审计', to: ROUTES.DATA_GOVERNANCE, icon: <IconConfig /> },
  { title: '多维表格', description: '业务台账与关联数据', to: ROUTES.BASE, icon: <IconGridSquare /> },
  { title: '全局搜索', description: '跨业务对象快速查找', to: ROUTES.SEARCH, icon: <IconSearch /> },
]

function formatDateLabel() {
  const now = new Date()
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${weekdays[now.getDay()]}`
}

function dueDays(dueAt: string | null): number | null {
  if (!dueAt) return null
  const diff = Date.now() - new Date(dueAt).getTime()
  return Math.max(0, Math.floor(diff / 86_400_000))
}

function healthLabel(health: ProjectHealth) {
  const map = { GREEN: '正常', YELLOW: '关注', RED: '风险' }
  return map[health]
}

function healthClass(health: ProjectHealth) {
  const map = { GREEN: 'is-green', YELLOW: 'is-yellow', RED: 'is-red' }
  return map[health]
}

function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton" aria-label="正在加载工作台" aria-busy="true">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="workspace-card dashboard-skeleton__card">
          <Skeleton className="h-5 w-28 mb-4" />
          <Skeleton className="h-24 w-full" />
        </div>
      ))}
    </div>
  )
}

export default function WorkbenchHome() {
  const dashboardQuery = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard })
  const [attentionFilter, setAttentionFilter] = useState<ProjectHealth | null>(null)

  const kpi = useMemo(() => {
    const data = dashboardQuery.data
    if (!data) return null
    const totalProjects = data.healthDistribution.GREEN + data.healthDistribution.YELLOW + data.healthDistribution.RED
    return {
      totalProjects,
      todayActions: data.todayActions.length,
      overdueTasks: data.overdueTasks.length,
      dueSoonMilestones: data.dueSoonMilestones.length,
    }
  }, [dashboardQuery.data])

  const attentionProjects = useMemo(() => {
    const all = dashboardQuery.data?.projectsNeedingAttention ?? []
    if (!attentionFilter) return all
    return all.filter((p) => p.health === attentionFilter)
  }, [dashboardQuery.data, attentionFilter])

  return (
    <div className="workspace-page workbench-home">
      <div className="workspace-page__inner">
        <header className="workbench-home__header">
          <div>
            <h1 className="workbench-home__title">研发主管工作台</h1>
            <p className="workbench-home__subtitle">优先处理今日行动、风险和临近里程碑。</p>
          </div>
          <time className="workbench-home__date" dateTime={new Date().toISOString()}>
            {formatDateLabel()}
          </time>
        </header>

        {dashboardQuery.isPending ? <DashboardSkeleton /> : null}

        {dashboardQuery.isError ? (
          <div className="workspace-card workbench-home__error">
            <h2>无法读取本地工作台</h2>
            <p>请确认本地服务已启动后重试。</p>
            <Button onClick={() => void dashboardQuery.refetch()}>重试</Button>
          </div>
        ) : null}

        {dashboardQuery.data && kpi ? (
          <>
            <section className="workbench-home__kpi-row">
              <DashboardKpiCard label="进行项目" value={kpi.totalProjects} icon={<IconBriefcase />} tone="brand" />
              <DashboardKpiCard label="今日待办" value={kpi.todayActions} icon={<IconCalendar />} tone="info" />
              <DashboardKpiCard label="逾期任务" value={kpi.overdueTasks} icon={<IconBeaker />} tone="warning" />
              <DashboardKpiCard label="临近里程碑" value={kpi.dueSoonMilestones} icon={<IconChart />} tone="danger" />
            </section>

            <section className="workbench-home__quick-row">
              <DashboardQuickApps items={quickApps} />
            </section>

            <section className="workbench-home__widget-grid">
              <HealthDonutChart data={dashboardQuery.data.healthDistribution} onSliceClick={setAttentionFilter} />
              <TaskStatusBarChart todayActions={dashboardQuery.data.todayActions} overdueTasks={dashboardQuery.data.overdueTasks} />

              <DashboardWidget title="今日行动">
                {dashboardQuery.data.todayActions.length ? (
                  <ul className="dashboard-list">
                    {dashboardQuery.data.todayActions.slice(0, 6).map((task) => (
                      <li key={task.id} className="dashboard-list__item">
                        <span className="dashboard-list__title">{task.title}</span>
                        <span className="dashboard-list__meta">
                          {task.assigneeName ? `负责人：${task.assigneeName}` : '暂未指定负责人'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dashboard-empty">今日没有待办行动。</p>
                )}
              </DashboardWidget>

              <DashboardWidget title="逾期任务">
                {dashboardQuery.data.overdueTasks.length ? (
                  <ul className="dashboard-list">
                    {dashboardQuery.data.overdueTasks.slice(0, 6).map((task) => {
                      const days = dueDays(task.dueAt)
                      return (
                        <li key={task.id} className="dashboard-list__item">
                          <span className="dashboard-list__title">{task.title}</span>
                          <span className="dashboard-list__meta dashboard-list__meta--danger">
                            {days !== null ? `逾期 ${days} 天` : '未设置截止日'}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="dashboard-empty">当前没有逾期任务。</p>
                )}
              </DashboardWidget>

              <DashboardWidget title="临近里程碑">
                {dashboardQuery.data.dueSoonMilestones.length ? (
                  <ul className="dashboard-list">
                    {dashboardQuery.data.dueSoonMilestones.slice(0, 6).map((milestone) => (
                      <li key={milestone.id} className="dashboard-list__item">
                        <span className="dashboard-list__title">{milestone.name}</span>
                        <span className="dashboard-list__meta">
                          {milestone.project ? `${milestone.project.name} · ` : ''}
                          {milestone.plannedAt ? new Date(milestone.plannedAt).toLocaleDateString() : '未设置'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dashboard-empty">当前没有临近的里程碑。</p>
                )}
              </DashboardWidget>

              <DashboardWidget title="需关注项目">
                {attentionProjects.length ? (
                  <ul className="dashboard-list">
                    {attentionProjects.slice(0, 6).map((project) => (
                      <li key={project.id} className="dashboard-list__item dashboard-list__item--attention">
                        <span className={`dashboard-list__dot ${healthClass(project.health)}`} />
                        <span className="dashboard-list__title">{project.name}</span>
                        <span className="dashboard-list__meta">{healthLabel(project.health)}</span>
                        {project.reasons?.length ? (
                          <div className="dashboard-list__tags">
                            {project.reasons.slice(0, 2).map((reason) => (
                              <span key={reason} className="dashboard-list__tag">{reason}</span>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dashboard-empty">当前没有需特别关注的项目。</p>
                )}
              </DashboardWidget>

              <DashboardWidget title="最近进展汇报" className="dashboard-widget--wide">
                {dashboardQuery.data.recentProgressReports.length ? (
                  <ul className="dashboard-list">
                    {dashboardQuery.data.recentProgressReports.slice(0, 5).map((report) => (
                      <li key={report.id} className="dashboard-list__item">
                        <span className="dashboard-list__title">
                          {report.project ? `${report.project.name} · ` : ''}
                          {report.summary.slice(0, 60)}
                          {report.summary.length > 60 ? '…' : ''}
                        </span>
                        <span className="dashboard-list__meta">
                          {new Date(report.reportedAt).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dashboard-empty">最近没有进展汇报。</p>
                )}
              </DashboardWidget>
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 添加样式**

```less
// WorkbenchHome.less
.workbench-home {
  &__header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
  }

  &__title {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  &__subtitle {
    margin: 6px 0 0;
    color: var(--workspace-text-secondary);
    font-size: 14px;
  }

  &__date {
    color: var(--workspace-text-muted);
    font-size: 14px;
    font-weight: 500;
  }

  &__kpi-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 16px;
  }

  &__quick-row {
    margin-bottom: 16px;
  }

  &__widget-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }

  &__error {
    padding: 24px;
  }
}

.dashboard-kpi-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px;

  &__icon {
    display: grid;
    width: 48px;
    height: 48px;
    place-items: center;
    border-radius: 12px;
    background: linear-gradient(135deg, var(--workspace-brand), var(--workspace-info));
    color: var(--workspace-text-inverse);
    font-size: 22px;
  }

  &__value {
    display: block;
    font-size: 30px;
    font-weight: 700;
    line-height: 1.1;
  }

  &__label {
    color: var(--workspace-text-secondary);
    font-size: 13px;
  }

  &--info .dashboard-kpi-card__icon { background: linear-gradient(135deg, var(--workspace-info), var(--workspace-info-text)); }
  &--warning .dashboard-kpi-card__icon { background: linear-gradient(135deg, var(--workspace-warning), var(--workspace-warning-text)); }
  &--danger .dashboard-kpi-card__icon { background: linear-gradient(135deg, var(--workspace-danger), #b91c1c); }
}

.dashboard-quick-apps {
  padding: 20px;

  &__title {
    margin: 0 0 16px;
    font-size: 15px;
    font-weight: 600;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  &__item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px;
    border: 1px solid var(--workspace-border);
    border-radius: var(--workspace-radius-lg);
    background: var(--workspace-surface);
    color: var(--workspace-text);
    text-decoration: none;
    transition: transform 150ms var(--ease-out), box-shadow 150ms var(--ease-out), border-color 150ms var(--ease-out);

    &:hover {
      transform: translateY(-2px);
      border-color: var(--workspace-brand);
      box-shadow: var(--workspace-shadow-float);
    }
  }

  &__icon {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border-radius: 8px;
    background: var(--workspace-brand-soft);
    color: var(--workspace-brand);
    font-size: 18px;
  }

  &__name {
    font-size: 14px;
    font-weight: 600;
  }

  &__desc {
    color: var(--workspace-text-secondary);
    font-size: 12px;
  }
}

.dashboard-chart {
  padding: 20px;
  min-height: 300px;

  &__title {
    margin: 0 0 12px;
    font-size: 15px;
    font-weight: 600;
  }
}

.dashboard-widget {
  display: flex;
  flex-direction: column;
  min-height: 280px;

  &__header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--workspace-border);
  }

  &__title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }

  &__body {
    flex: 1;
    padding: 16px 20px;
    overflow: auto;
  }

  &--wide {
    grid-column: span 2;
  }
}

.dashboard-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;

  &__item {
    display: grid;
    gap: 4px;
    padding: 10px 12px;
    border-radius: var(--workspace-radius);
    background: var(--workspace-surface-subtle);
  }

  &__item--attention {
    grid-template-columns: auto 1fr auto;
    align-items: center;
    row-gap: 6px;
  }

  &__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--workspace-text-muted);

    &.is-green { background: var(--workspace-success); }
    &.is-yellow { background: var(--workspace-warning); }
    &.is-red { background: var(--workspace-danger); }
  }

  &__title {
    font-size: 14px;
    font-weight: 500;
  }

  &__meta {
    color: var(--workspace-text-secondary);
    font-size: 12px;

    &--danger {
      color: var(--workspace-danger);
    }
  }

  &__tags {
    grid-column: 2 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  &__tag {
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--workspace-brand-soft);
    color: var(--workspace-brand);
    font-size: 11px;
  }
}

.dashboard-empty {
  margin: 0;
  color: var(--workspace-text-muted);
  font-size: 13px;
  text-align: center;
}

.dashboard-skeleton {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;

  &__card {
    padding: 20px;
  }
}

@media (max-width: 1440px) {
  .workbench-home__widget-grid { grid-template-columns: repeat(3, 1fr); }
  .dashboard-widget--wide { grid-column: span 2; }
}

@media (max-width: 1180px) {
  .workbench-home__kpi-row { grid-template-columns: repeat(2, 1fr); }
  .workbench-home__widget-grid { grid-template-columns: repeat(2, 1fr); }
  .dashboard-quick-apps__grid { grid-template-columns: repeat(2, 1fr); }
  .dashboard-widget--wide { grid-column: span 2; }
}

@media (max-width: 720px) {
  .workbench-home__kpi-row { grid-template-columns: 1fr; }
  .workbench-home__widget-grid { grid-template-columns: 1fr; }
  .dashboard-widget--wide { grid-column: span 1; }
  .workbench-home__header { flex-direction: column; align-items: flex-start; }
}
```

- [ ] **Step 3: 运行 lint 和 typecheck**

```bash
pnpm lint
pnpm typecheck
```

Expected: pass.

- [ ] **Step 4: 提交**

```bash
git add frontend/src/pages/WorkbenchHome.tsx frontend/src/pages/WorkbenchHome.less
git commit -m "feat(dashboard): redesign WorkbenchHome as full-width Aurora dashboard"
```

---

### Task 8: 添加 WorkbenchHome 单元测试

**Files:**
- Create: `frontend/src/pages/__tests__/WorkbenchHome.test.tsx`

**Interfaces:**
- Consumes: mocked `getDashboard` API.
- Produces: test verifying KPI cards and widgets render.

- [ ] **Step 1: 编写测试**

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkbenchHome from '../WorkbenchHome'

const mockGetDashboard = vi.fn()

vi.mock('@/modules/workbench/api/dashboard', () => ({
  getDashboard: () => mockGetDashboard(),
}))

vi.mock('@/components/dashboard/ReactECharts', () => ({
  ReactECharts: ({ option }: { option: unknown }) => (
    <div data-testid="echarts-mock" data-option={JSON.stringify(option)} />
  ),
}))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <WorkbenchHome />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkbenchHome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDashboard.mockResolvedValue({
      todayActions: [{ id: 't1', title: '今日任务', status: 'TODO', assigneeName: '张三' }],
      overdueTasks: [{ id: 'o1', title: '逾期任务', status: 'TODO', dueAt: '2026-07-20T00:00:00Z' }],
      dueSoonMilestones: [{ id: 'm1', name: '里程碑 A', plannedAt: '2026-08-05T00:00:00Z' }],
      healthDistribution: { GREEN: 8, YELLOW: 2, RED: 1 },
      projectsNeedingAttention: [
        { id: 'p1', code: 'P1', name: '关注项目', health: 'YELLOW', reasons: ['进度落后'], calculatedAt: new Date().toISOString() },
      ],
      recentProgressReports: [],
    })
  })

  it('renders KPI cards and dashboard widgets', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('进行项目')).toBeInTheDocument()
    })
    expect(screen.getByText('今日待办')).toBeInTheDocument()
    expect(screen.getByText('逾期任务')).toBeInTheDocument()
    expect(screen.getByText('临近里程碑')).toBeInTheDocument()
    expect(screen.getByText('常用应用')).toBeInTheDocument()
    expect(screen.getByText('关注项目')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行测试**

```bash
pnpm test src/pages/__tests__/WorkbenchHome.test.tsx
```

Expected: pass.

- [ ] **Step 3: 提交**

```bash
git add frontend/src/pages/__tests__/WorkbenchHome.test.tsx
git commit -m "test(dashboard): add WorkbenchHome dashboard render test"
```

---

### Task 9: 全局门禁与最终提交

- [ ] **Step 1: 运行全部门禁**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all pass.

- [ ] **Step 2: 更新 ledger**

在 `.superpowers/sdd/2026-08-01-aurora-glass-frontend-redesign/progress.md` 追加：

```markdown
- [x] 工作台首页 (`WorkbenchHome`) 重构为全宽 Aurora Glass 大屏 Dashboard，包含 KPI 数字卡、快捷入口、ECharts 图表和列表 Widgets。已提交。
```

- [ ] **Step 3: 最终提交（若尚未提交所有变更）**

```bash
git add -A
git commit -m "feat(dashboard): complete WorkbenchHome Aurora dashboard redesign"
```
