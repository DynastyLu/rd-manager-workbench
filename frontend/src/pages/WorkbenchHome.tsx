import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  IconBeaker,
  IconBriefcase,
  IconCalendar,
  IconConfigStroked,
  IconGlobe,
  IconGridSquare,
  IconHistogram,
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
import type { ProjectHealth } from '@/modules/workbench/types'

import './WorkbenchHome.less'

const quickApps = [
  { title: '非项目研发', description: '预研、技术债与成果', to: `${ROUTES.OPERATIONS}?tab=non-project-rd`, icon: <IconBeaker /> },
  { title: '合作方', description: '联系人、协议与沟通', to: ROUTES.PARTNERS, icon: <IconBriefcase /> },
  { title: '资源负荷', description: '13 周容量与投入', to: `${ROUTES.OPERATIONS}?tab=resources`, icon: <IconHistogram /> },
  { title: '行业情报', description: '来源、情报卡与简报', to: ROUTES.INTELLIGENCE, icon: <IconGlobe /> },
  { title: '统计报表', description: '项目、任务、风险统计', to: ROUTES.REPORTS, icon: <IconHistogram /> },
  { title: '数据安全', description: '备份、恢复与审计', to: ROUTES.DATA_GOVERNANCE, icon: <IconConfigStroked /> },
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

function healthLabel(health: ProjectHealth | null): string {
  if (!health) return ''
  const map = { GREEN: '正常', YELLOW: '关注', RED: '风险' }
  return map[health]
}

function healthClass(health: ProjectHealth | null): string {
  if (!health) return ''
  const map = { GREEN: 'is-green', YELLOW: 'is-yellow', RED: 'is-red' }
  return map[health]
}

function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton" aria-label="正在加载工作台" aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => (
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
              <DashboardKpiCard label="临近里程碑" value={kpi.dueSoonMilestones} icon={<IconHistogram />} tone="danger" />
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
                          {milestone.plannedAt
                            ? `${milestone.projectId} · ${new Date(milestone.plannedAt).toLocaleDateString()}`
                            : '未设置'}
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
                          {report.projectId} · {report.summary.slice(0, 60)}
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
