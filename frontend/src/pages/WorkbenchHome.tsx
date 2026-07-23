import { type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { Button } from '@/components/workspace/SemiCompat'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/workspace/SemiCompat'
import { Skeleton } from '@/components/workspace/SemiCompat'
import { getDashboard } from '@/modules/workbench/api/dashboard'
import { ROUTES } from '@/constants/routes'

function DashboardSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-base leading-snug font-medium">{title}</h2>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-label="正在加载工作台" aria-busy="true">
      {[0, 1, 2, 3].map((index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-5 w-28" />
          </CardHeader>
          <CardContent className="grid gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default function WorkbenchHome() {
  const dashboardQuery = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard })

  return (
    <div className="app-page app-page--home">
      <div className="app-page__inner">
        <div className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">Local R&amp;D Workspace</p>
            <h1 className="app-page__title">研发主管工作台</h1>
            <p className="app-page__subtitle">优先处理今日行动、风险和临近里程碑。</p>
          </div>
        </div>

        <section aria-label="常用应用" className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { title: '非项目研发', description: '预研、技术债与成果', to: `${ROUTES.OPERATIONS}?tab=non-project-rd` },
            { title: '合作方', description: '联系人、协议与沟通', to: ROUTES.PARTNERS },
            { title: '资源负荷', description: '13 周容量与投入', to: `${ROUTES.OPERATIONS}?tab=resources` },
            { title: '行业情报', description: '来源、情报卡与简报', to: ROUTES.INTELLIGENCE },
            { title: '统计报表', description: '项目、任务、风险统计', to: ROUTES.REPORTS },
            { title: '数据安全', description: '备份、恢复与审计', to: ROUTES.DATA_GOVERNANCE },
            { title: '多维表格', description: '业务台账与关联数据', to: ROUTES.BASE },
            { title: '全局搜索', description: '跨业务对象快速查找', to: ROUTES.SEARCH },
          ].map((item) => (
            <Link key={item.title} to={item.to} className="rounded-xl border bg-card p-4 text-card-foreground no-underline transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm">
              <strong className="block text-sm">{item.title}</strong>
              <span className="mt-1 block text-xs text-muted-foreground">{item.description}</span>
            </Link>
          ))}
        </section>

        {dashboardQuery.isPending ? <DashboardSkeleton /> : null}

        {dashboardQuery.isError ? (
          <Card>
            <CardHeader>
              <CardTitle>无法读取本地工作台</CardTitle>
              <CardDescription>请确认本地服务已启动后重试。</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => void dashboardQuery.refetch()}>重试</Button>
            </CardContent>
          </Card>
        ) : null}

        {dashboardQuery.data ? (
          <div className="grid gap-4 md:grid-cols-2">
            <DashboardSection title="今日行动">
              {dashboardQuery.data.todayActions.length ? (
                <ul className="grid gap-2">
                  {dashboardQuery.data.todayActions.map((task) => (
                    <li key={task.id} className="rounded-lg border p-3">
                      <p className="font-medium">{task.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {task.assigneeName ? `负责人：${task.assigneeName}` : '暂未指定负责人'}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">今日没有待办行动。</p>
              )}
            </DashboardSection>

            <DashboardSection title="逾期任务">
              {dashboardQuery.data.overdueTasks.length ? (
                <ul className="grid gap-2">
                  {dashboardQuery.data.overdueTasks.map((task) => (
                    <li key={task.id} className="rounded-lg border p-3">
                      <p className="font-medium">{task.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {task.dueAt
                          ? `截止：${new Date(task.dueAt).toLocaleDateString()}`
                          : '未设置截止日'}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">当前没有逾期任务。</p>
              )}
            </DashboardSection>

            <DashboardSection title="临近里程碑">
              {dashboardQuery.data.dueSoonMilestones.length ? (
                <ul className="grid gap-2">
                  {dashboardQuery.data.dueSoonMilestones.map((milestone) => (
                    <li key={milestone.id} className="rounded-lg border p-3">
                      <p className="font-medium">{milestone.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {milestone.plannedAt
                          ? `计划：${new Date(milestone.plannedAt).toLocaleDateString()}`
                          : '未设置计划日期'}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">当前没有临近的里程碑。</p>
              )}
            </DashboardSection>

            <DashboardSection title="项目健康度">
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <dt className="text-muted-foreground">正常</dt>
                  <dd className="mt-1 text-lg font-semibold">
                    正常：{dashboardQuery.data.healthDistribution.GREEN}
                  </dd>
                </div>
                <div className="rounded-lg border p-3">
                  <dt className="text-muted-foreground">关注</dt>
                  <dd className="mt-1 text-lg font-semibold">
                    关注：{dashboardQuery.data.healthDistribution.YELLOW}
                  </dd>
                </div>
                <div className="rounded-lg border p-3">
                  <dt className="text-muted-foreground">风险</dt>
                  <dd className="mt-1 text-lg font-semibold">
                    风险：{dashboardQuery.data.healthDistribution.RED}
                  </dd>
                </div>
              </dl>
            </DashboardSection>
          </div>
        ) : null}
      </div>
    </div>
  )
}
