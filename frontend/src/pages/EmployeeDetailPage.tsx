import { useMemo } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banner, Button, Skeleton, Tag } from '@douyinfe/semi-ui'
import { IconChevronLeft } from '@douyinfe/semi-icons'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ROUTES } from '@/constants/routes'
import { useWorkspaceSearchParams } from '@/hooks/useWorkspaceSearchParams'
import {
  convertEmployeeWorkItemRisk,
  getEmployeeProgress,
  listEmployeeWorkItems,
} from '@/modules/employees/api'
import { EmployeeProgressFilters } from '@/modules/employees/components/EmployeeProgressFilters'
import { EmployeeProgressMetrics } from '@/modules/employees/components/EmployeeProgressMetrics'
import { EmployeeProgressTrend } from '@/modules/employees/components/EmployeeProgressTrend'
import { EmployeeWorkTable } from '@/modules/employees/components/EmployeeWorkTable'
import { EMPLOYEE_WORK_STATUS_COLORS, EMPLOYEE_WORK_STATUS_LABELS, EMPLOYMENT_STATUS_LABELS } from '@/modules/employees/labels'
import { defaultPeriodStart, recentPeriodStarts, trendPeriodLabel } from '@/modules/employees/periods'
import { employeeQueryKeys } from '@/modules/employees/queryKeys'
import type { EmployeeWorkItem, EmployeeWorkStatus, ProgressFilters } from '@/modules/employees/types'
import './EmployeeDetailPage.less'

const PAGE_SIZE = 10
const WORK_STATUS_VALUES = ['ALL', 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'AT_RISK', 'BLOCKED'] as const

const percentage = (value: number | null) => (value === null ? '暂无数据' : `${value}%`)

export default function EmployeeDetailPage() {
  const { employeeId = '' } = useParams<{ employeeId: string }>()
  const queryClient = useQueryClient()
  const searchParams = useWorkspaceSearchParams()
  const periodType = searchParams.getEnum('periodType', ['WEEK', 'MONTH'] as const, 'WEEK')
  const periodStart = searchParams.getString('periodStart') || defaultPeriodStart(periodType)
  const statusParam = searchParams.getEnum('status', WORK_STATUS_VALUES, 'ALL')
  const status: EmployeeWorkStatus | undefined = statusParam === 'ALL' ? undefined : statusParam
  const focusedWorkItemId = searchParams.getString('workItemId') || undefined
  const page = searchParams.getPositiveInt('page', 1)

  const filters: ProgressFilters = { periodType, periodStart, status }
  const progressQuery = useQuery({
    queryKey: employeeQueryKeys.progress(employeeId, filters),
    queryFn: () => getEmployeeProgress(employeeId, filters),
    enabled: Boolean(employeeId),
  })
  const workItemsQuery = useQuery({
    queryKey: employeeQueryKeys.workItems({ ...filters, employeeId, page, pageSize: PAGE_SIZE }),
    queryFn: () =>
      listEmployeeWorkItems({ ...filters, employeeId, page, pageSize: PAGE_SIZE }),
    enabled: Boolean(employeeId),
  })

  const trendStarts = useMemo(
    () => recentPeriodStarts(periodType, periodStart, 4).reverse(),
    [periodType, periodStart]
  )
  const trendQueries = useQueries({
    queries: trendStarts.map((start) => ({
      queryKey: employeeQueryKeys.progress(employeeId, { periodType, periodStart: start }),
      queryFn: () => getEmployeeProgress(employeeId, { periodType, periodStart: start }),
      enabled: Boolean(employeeId),
    })),
  })
  const trendPoints = trendQueries.flatMap((query, index) => {
    const start = trendStarts[index]
    if (!query.data || !start) return []
    return [
      {
        periodStart: start,
        label: trendPeriodLabel(periodType, start),
        value: query.data.metrics.averageCompletionRate,
      },
    ]
  })

  const convertMutation = useMutation({
    mutationFn: (item: EmployeeWorkItem) => convertEmployeeWorkItemRisk(item.id),
    onSuccess: async (result, item) => {
      toast.success(result.alreadyExists ? '该风险已转换为项目风险' : '已转换为项目风险')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['risks'] }),
        queryClient.invalidateQueries({ queryKey: ['project', item.project?.id ?? null] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '风险转换失败，请重试。')
    },
  })

  if (progressQuery.isPending) {
    return (
      <div className="employee-detail employee-detail--loading" aria-label="正在加载员工进展">
        <Skeleton.Title style={{ width: 240 }} />
        <Skeleton.Paragraph rows={6} />
      </div>
    )
  }

  if (progressQuery.isError || !progressQuery.data) {
    return (
      <div className="employee-detail employee-detail--error">
        <Banner
          type="danger"
          fullMode={false}
          title="无法读取员工进展"
          description="请确认本地服务已启动后重试。"
          closeIcon={null}
        >
          <Button onClick={() => void progressQuery.refetch()}>重试</Button>
        </Banner>
      </div>
    )
  }

  const progress = progressQuery.data
  const profile = progress.employee
  const missingWeeks = progress.metrics.missingWeeks

  return (
    <div className="employee-detail">
      <div className="employee-detail__back-row">
        <Link to={ROUTES.EMPLOYEES}>
          <IconChevronLeft /> 返回员工列表
        </Link>
      </div>

      <header className="employee-detail__header">
        <div className="employee-detail__avatar" aria-hidden="true">
          {profile.displayName.slice(0, 1)}
        </div>
        <div>
          <h1>{profile.displayName}</h1>
          <dl className="employee-detail__facts">
            <div>
              <dt>部门</dt>
              <dd>{profile.department || '未设置'}</dd>
            </div>
            <div>
              <dt>岗位</dt>
              <dd>{profile.roleTitle || '未设置'}</dd>
            </div>
            <div>
              <dt>直属负责人</dt>
              <dd>{profile.managerName || '未设置'}</dd>
            </div>
            <div>
              <dt>在职状态</dt>
              <dd>{EMPLOYMENT_STATUS_LABELS[profile.employmentStatus]}</dd>
            </div>
            <div>
              <dt>每周容量</dt>
              <dd>{profile.weeklyCapacityHours} 小时</dd>
            </div>
          </dl>
        </div>
      </header>

      <section className="employee-detail__surface" aria-label="员工周期进展">
        <EmployeeProgressFilters
          value={{ periodType, periodStart, status }}
          showScopeFilters={false}
          onChange={(next) =>
            searchParams.update({
              periodType: next.periodType,
              periodStart: next.periodStart,
              status: next.status,
              page: 1,
            })
          }
        />

        {missingWeeks.length > 0 ? (
          <div className="employee-detail__feedback">
            <Banner
              type="warning"
              fullMode={false}
              title="数据不完整"
              description={`以下周期缺少已提交的计划数据：${missingWeeks.join('、')}`}
              closeIcon={null}
            />
          </div>
        ) : null}

        <EmployeeProgressMetrics metrics={progress.metrics} />

        <section className="employee-detail__section" aria-label="工作明细">
          <header>
            <h2>工作明细</h2>
            <span>
              {progress.period.start} — {progress.period.end}
            </span>
          </header>
          {workItemsQuery.isError ? (
            <div className="employee-detail__feedback">
              <Banner
                type="danger"
                fullMode={false}
                title="无法读取工作明细"
                description="请稍后重试。"
                closeIcon={null}
              >
                <Button onClick={() => void workItemsQuery.refetch()}>重试</Button>
              </Banner>
            </div>
          ) : (
            <EmployeeWorkTable
              items={workItemsQuery.data?.data ?? []}
              focusedWorkItemId={focusedWorkItemId}
              onConvertRisk={(item) => convertMutation.mutate(item)}
              convertingWorkItemId={
                convertMutation.isPending ? (convertMutation.variables?.id ?? null) : null
              }
              pagination={{
                currentPage: page,
                pageSize: PAGE_SIZE,
                total: workItemsQuery.data?.meta.total ?? 0,
                showSizeChanger: false,
                onPageChange: (nextPage: number) =>
                  searchParams.update({ page: nextPage }, { defaults: { page: 1 } }),
              }}
            />
          )}
        </section>

        <EmployeeProgressTrend points={trendPoints} />

        <div className="employee-detail__grid">
          <section className="employee-detail__section" aria-label="项目投入分布">
            <header>
              <h2>项目投入分布</h2>
              <span>{progress.projects.total}</span>
            </header>
            {progress.projects.data.length ? (
              <ul className="employee-detail__list">
                {progress.projects.data.map((project) => (
                  <li key={project.projectId}>
                    <Link
                      aria-label={`打开项目空间：${project.projectCode} ${project.projectName}`}
                      to={ROUTES.projectWorkspace(project.projectId, 'overview')}
                    >
                      {project.projectCode} {project.projectName}
                    </Link>
                    <span>
                      工作项 {project.metrics.workItemCount} · 平均完成度{' '}
                      {percentage(project.metrics.averageCompletionRate)} · 工时{' '}
                      {project.metrics.plannedHours}/{project.metrics.actualHours}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="employee-detail__muted">当前周期没有关联项目的工作。</p>
            )}
          </section>

          <section className="employee-detail__section" aria-label="风险与阻塞">
            <header>
              <h2>风险与阻塞</h2>
              <span>{progress.risks.total}</span>
            </header>
            {progress.risks.data.length ? (
              <ul className="employee-detail__list">
                {progress.risks.data.map((risk) => (
                  <li key={risk.id}>
                    <div>
                      <strong>{risk.title}</strong>
                      <span>{risk.riskText || '未填写风险说明'}</span>
                    </div>
                    <Tag size="small" color={EMPLOYEE_WORK_STATUS_COLORS[risk.status]}>
                      {EMPLOYEE_WORK_STATUS_LABELS[risk.status]}
                    </Tag>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="employee-detail__muted">当前周期没有风险或阻塞。</p>
            )}
          </section>
        </div>

        <section className="employee-detail__section" aria-label="数据来源">
          <header>
            <h2>数据来源</h2>
          </header>
          {progress.sourceBatchIds.length ? (
            <div className="employee-detail__sources">
              {progress.sourceBatchIds.map((batchId) => (
                <code key={batchId}>{batchId}</code>
              ))}
              <p className="employee-detail__muted">
                以上导入批次提供当前周期数据，工作行的原始行号见明细“来源”列。
              </p>
            </div>
          ) : (
            <p className="employee-detail__muted">当前周期没有导入批次。</p>
          )}
        </section>
      </section>
    </div>
  )
}
