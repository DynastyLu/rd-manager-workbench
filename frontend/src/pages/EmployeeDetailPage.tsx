import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banner, Button, Modal, Select, Skeleton, Tag, TextArea } from '@douyinfe/semi-ui'
import { IconChevronLeft } from '@douyinfe/semi-icons'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ROUTES } from '@/constants/routes'
import { WorkspaceDatePicker } from '@/components/workspace/WorkspaceDatePicker'
import { useWorkspaceSearchParams } from '@/hooks/useWorkspaceSearchParams'
import { ActivityTimeline } from '@/modules/activity/components/ActivityTimeline'
import {
  cancelEmployeeWeekPlan,
  convertEmployeeWeekPlanToTask,
  convertEmployeeWorkItemRisk,
  getEmployeeProgress,
  listEmployeeWeekPlans,
  listEmployeeWorkItems,
  matchEmployeeWeekPlan,
  unmatchEmployeeWeekPlan,
  updateEmployeeWorkItem,
  updateEmployeeWeekPlan,
} from '@/modules/employees/api'
import { EmployeeProgressFilters } from '@/modules/employees/components/EmployeeProgressFilters'
import { EmployeeProgressMetrics } from '@/modules/employees/components/EmployeeProgressMetrics'
import { EmployeeProgressTrend } from '@/modules/employees/components/EmployeeProgressTrend'
import { EmployeeWorkTable } from '@/modules/employees/components/EmployeeWorkTable'
import { EmployeeWorkItemEditor } from '@/modules/employees/components/EmployeeWorkItemEditor'
import { EmployeeWeekPlanTable } from '@/modules/employees/components/EmployeeWeekPlanTable'
import { percentage } from '@/modules/employees/format'
import { EMPLOYEE_WORK_STATUS_COLORS, EMPLOYEE_WORK_STATUS_LABELS, EMPLOYMENT_STATUS_LABELS } from '@/modules/employees/labels'
import { defaultPeriodStart, recentPeriodStarts, trendPeriodLabel } from '@/modules/employees/periods'
import { employeeQueryKeys } from '@/modules/employees/queryKeys'
import type {
  EmployeePlanPriority,
  EmployeeWeekPlan,
  EmployeeWorkItem,
  EmployeeWorkKind,
  EmployeeWorkStatus,
  ProgressFilters,
  UpdateEmployeeWeekPlanInput,
  UpdateEmployeeWorkItemInput,
} from '@/modules/employees/types'
import { listProjects } from '@/modules/workbench/api/projects'
import { listTasks } from '@/modules/workbench/api/tasks'
import { loadAllPages } from '@/lib/loadAllPages'
import './EmployeeDetailPage.less'
import { useRouteHistoryTitle } from '@/components/AppShell/RouteHistoryTitleContext'

const PAGE_SIZE = 10
const WORK_STATUS_VALUES = ['ALL', 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'AT_RISK', 'BLOCKED'] as const

function nextPlanPeriodStart(periodType: ProgressFilters['periodType'], periodStart: string) {
  if (periodType === 'MONTH') return periodStart
  const value = new Date(`${periodStart}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + 7)
  return value.toISOString().slice(0, 10)
}

type PlanDialog =
  | { mode: 'edit'; plan: EmployeeWeekPlan }
  | { mode: 'cancel'; plan: EmployeeWeekPlan }
  | { mode: 'match'; plan: EmployeeWeekPlan }

interface PlanDraft {
  workKind: EmployeeWorkKind
  projectId: string
  taskId: string
  plannedCompletionAt: string
  priority: EmployeePlanPriority
  collaborationText: string
}

export default function EmployeeDetailPage() {
  const { employeeId = '' } = useParams<{ employeeId: string }>()
  const queryClient = useQueryClient()
  const searchParams = useWorkspaceSearchParams()
  const periodType = searchParams.getEnum('periodType', ['WEEK', 'MONTH'] as const, 'WEEK')
  const periodStart = searchParams.getString('periodStart') || defaultPeriodStart(periodType)
  const statusParam = searchParams.getEnum('status', WORK_STATUS_VALUES, 'ALL')
  const status: EmployeeWorkStatus | undefined = statusParam === 'ALL' ? undefined : statusParam
  const focusedWorkItemId = searchParams.getString('workItemId') || undefined
  const focusedPlanId = searchParams.getString('planItemId') || undefined
  const page = searchParams.getPositiveInt('page', 1)
  const nextPlanPage = searchParams.getPositiveInt('nextPlanPage', 1)
  const [planDialog, setPlanDialog] = useState<PlanDialog | null>(null)
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [matchWorkItemId, setMatchWorkItemId] = useState('')
  const [editingWorkItem, setEditingWorkItem] = useState<EmployeeWorkItem | null>(null)

  const filters: ProgressFilters = { periodType, periodStart, status }
  const progressQuery = useQuery({
    queryKey: employeeQueryKeys.progress(employeeId, filters),
    queryFn: () => getEmployeeProgress(employeeId, filters),
    enabled: Boolean(employeeId),
  })
  useRouteHistoryTitle(progressQuery.data?.employee.displayName)
  const workItemsQuery = useQuery({
    queryKey: employeeQueryKeys.workItems({ ...filters, employeeId, page, pageSize: PAGE_SIZE }),
    queryFn: () =>
      listEmployeeWorkItems({ ...filters, employeeId, page, pageSize: PAGE_SIZE }),
    enabled: Boolean(employeeId),
  })
  const planPeriodStart = focusedPlanId
    ? periodStart
    : nextPlanPeriodStart(periodType, periodStart)
  const weekPlansQuery = useQuery({
    queryKey: [
      'employees',
      'week-plans',
      { periodType, periodStart: planPeriodStart, employeeId, page: nextPlanPage },
    ],
    queryFn: () =>
      listEmployeeWeekPlans({
        periodType,
        periodStart: planPeriodStart,
        employeeId,
        page: nextPlanPage,
        pageSize: PAGE_SIZE,
      }),
    enabled: Boolean(employeeId),
  })
  const matchingPlan = planDialog?.mode === 'match' ? planDialog.plan : null
  const matchCandidatesQuery = useQuery({
    queryKey: [
      'employees',
      'work-items',
      'plan-match-candidates',
      {
        employeeId,
        periodStart: matchingPlan?.periodStart,
      },
    ],
    queryFn: () =>
      loadAllPages((page, pageSize) =>
        listEmployeeWorkItems({
          periodType: 'WEEK',
          periodStart: matchingPlan!.periodStart,
          employeeId,
          page,
          pageSize,
        })
      ),
    enabled: Boolean(employeeId && matchingPlan),
  })
  const editProjectsQuery = useQuery({
    queryKey: ['projects', 'employee-work-item-editor'],
    queryFn: () =>
      loadAllPages((page, pageSize) => listProjects({ page, pageSize })),
    enabled: Boolean(editingWorkItem || planDialog?.mode === 'edit'),
  })
  const editTasksQuery = useQuery({
    queryKey: ['tasks', 'employee-work-item-editor'],
    queryFn: () =>
      loadAllPages((page, pageSize) => listTasks({ page, pageSize })),
    enabled: Boolean(editingWorkItem || planDialog?.mode === 'edit'),
  })
  const suggestedMatchWorkItemId = useMemo(() => {
    if (!matchingPlan || !matchCandidatesQuery.data) return ''
    const normalizedTitle = matchingPlan.title.trim().toLocaleLowerCase()
    return (
      matchCandidatesQuery.data.data.find(
        (item) => item.title.trim().toLocaleLowerCase() === normalizedTitle
      )?.id ?? ''
    )
  }, [matchingPlan, matchCandidatesQuery.data])
  const selectedMatchWorkItemId = matchWorkItemId || suggestedMatchWorkItemId

  // A deep-linked work item (?workItemId=) may live on a later page; scan the
  // remaining pages and move there so the row renders and gets highlighted.
  const updateSearchParams = searchParams.update
  useEffect(() => {
    if (!focusedWorkItemId || !employeeId) return
    const result = workItemsQuery.data
    if (!result) return
    if (result.data.some((item) => item.id === focusedWorkItemId)) return
    const totalPages = Math.ceil(result.meta.total / PAGE_SIZE)
    if (page >= totalPages) return
    let cancelled = false
    void (async () => {
      try {
        for (let nextPage = page + 1; nextPage <= totalPages; nextPage += 1) {
          const next = await listEmployeeWorkItems({
            periodType,
            periodStart,
            status,
            employeeId,
            page: nextPage,
            pageSize: PAGE_SIZE,
          })
          if (cancelled) return
          if (next.data.some((item) => item.id === focusedWorkItemId)) {
            updateSearchParams({ page: nextPage })
            return
          }
        }
      } catch {
        // Best-effort locating; stay on the requested page when it fails.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    focusedWorkItemId,
    employeeId,
    workItemsQuery.data,
    page,
    periodType,
    periodStart,
    status,
    updateSearchParams,
  ])

  useEffect(() => {
    if (!focusedPlanId || !employeeId) return
    const result = weekPlansQuery.data
    if (!result) return
    if (result.data.some((item) => item.id === focusedPlanId)) return
    const totalPages = Math.ceil(result.meta.total / PAGE_SIZE)
    if (nextPlanPage >= totalPages) return
    let cancelled = false
    void (async () => {
      try {
        for (let nextPage = nextPlanPage + 1; nextPage <= totalPages; nextPage += 1) {
          const next = await listEmployeeWeekPlans({
            periodType,
            periodStart: planPeriodStart,
            employeeId,
            page: nextPage,
            pageSize: PAGE_SIZE,
          })
          if (cancelled) return
          if (next.data.some((item) => item.id === focusedPlanId)) {
            updateSearchParams({ nextPlanPage: nextPage })
            return
          }
        }
      } catch {
        // Best-effort locating; stay on the requested page when it fails.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    focusedPlanId,
    employeeId,
    weekPlansQuery.data,
    nextPlanPage,
    periodType,
    planPeriodStart,
    updateSearchParams,
  ])

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
        queryClient.invalidateQueries({ queryKey: ['search'] }),
      ])
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '风险转换失败，请重试。')
    },
  })
  const updateWorkItemMutation = useMutation({
    mutationFn: ({
      item,
      input,
    }: {
      item: EmployeeWorkItem
      input: UpdateEmployeeWorkItemInput
    }) => updateEmployeeWorkItem(item.id, input),
    onSuccess: async () => {
      setEditingWorkItem(null)
      toast.success('工作系统字段已更新')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['search'] }),
      ])
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : '更新工作项失败，请重试。'),
  })

  async function refreshPlans() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['employees', 'week-plans'] }),
      queryClient.invalidateQueries({ queryKey: employeeQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['project', planDialog?.plan.project?.id ?? null] }),
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    ])
  }

  function planActionSuccess(message: string) {
    setPlanDialog(null)
    setPlanDraft(null)
    setCancelReason('')
    setMatchWorkItemId('')
    toast.success(message)
    return refreshPlans()
  }

  const updatePlanMutation = useMutation({
    mutationFn: ({ planId, input }: { planId: string; input: UpdateEmployeeWeekPlanInput }) =>
      updateEmployeeWeekPlan(planId, input),
    onSuccess: () => planActionSuccess('计划系统字段已更新'),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : '更新计划失败，请重试。'),
  })
  const cancelPlanMutation = useMutation({
    mutationFn: ({ planId, reason }: { planId: string; reason: string }) =>
      cancelEmployeeWeekPlan(planId, reason),
    onSuccess: () => planActionSuccess('计划已取消'),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : '取消计划失败，请重试。'),
  })
  const matchPlanMutation = useMutation({
    mutationFn: ({ planId, workItemId }: { planId: string; workItemId: string }) =>
      matchEmployeeWeekPlan(planId, workItemId),
    onSuccess: () => planActionSuccess('计划已承接到本周执行'),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : '承接计划失败，请重试。'),
  })
  const unmatchPlanMutation = useMutation({
    mutationFn: (plan: EmployeeWeekPlan) => unmatchEmployeeWeekPlan(plan.id),
    onSuccess: () => planActionSuccess('已撤销计划承接'),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : '撤销承接失败，请重试。'),
  })
  const convertPlanMutation = useMutation({
    mutationFn: (plan: EmployeeWeekPlan) => convertEmployeeWeekPlanToTask(plan.id),
    onSuccess: () => planActionSuccess('计划已转换为项目任务'),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : '转换任务失败，请重试。'),
  })

  function openEditPlan(plan: EmployeeWeekPlan) {
    setPlanDraft({
      workKind: plan.workKind,
      projectId: plan.project?.id ?? '',
      taskId: plan.task?.id ?? '',
      plannedCompletionAt: plan.plannedCompletionDate ?? '',
      priority: plan.priority,
      collaborationText: plan.collaborationText ?? '',
    })
    setPlanDialog({ mode: 'edit', plan })
  }

  function submitPlanDialog() {
    if (!planDialog) return
    if (planDialog.mode === 'edit' && planDraft) {
      updatePlanMutation.mutate({
        planId: planDialog.plan.id,
        input: {
          workKind: planDraft.workKind,
          projectId: planDraft.workKind === 'PROJECT' ? planDraft.projectId || null : null,
          taskId: planDraft.workKind === 'PROJECT' ? planDraft.taskId || null : null,
          plannedCompletionAt: planDraft.plannedCompletionAt || null,
          priority: planDraft.priority,
          collaborationText: planDraft.collaborationText.trim() || null,
        },
      })
      return
    }
    if (planDialog.mode === 'cancel') {
      if (!cancelReason.trim()) {
        toast.error('请填写取消原因')
        return
      }
      cancelPlanMutation.mutate({ planId: planDialog.plan.id, reason: cancelReason.trim() })
      return
    }
    if (!selectedMatchWorkItemId) {
      toast.error('请选择承接该计划的本周执行项')
      return
    }
    matchPlanMutation.mutate({
      planId: planDialog.plan.id,
      workItemId: selectedMatchWorkItemId,
    })
  }

  if (progressQuery.isPending) {
    return (
      <div className="employee-detail workspace-page">
        <div className="employee-detail__inner workspace-page__inner employee-detail--loading" aria-label="正在加载员工进展">
          <Skeleton.Title style={{ width: 240 }} />
          <Skeleton.Paragraph rows={6} />
        </div>
      </div>
    )
  }

  if (progressQuery.isError || !progressQuery.data) {
    return (
      <div className="employee-detail workspace-page">
        <div className="employee-detail__inner workspace-page__inner employee-detail--error">
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
      </div>
    )
  }

  const progress = progressQuery.data
  const profile = progress.employee
  const missingWeeks = progress.metrics.missingWeeks

  return (
    <div className="employee-detail workspace-page">
      <div className="employee-detail__inner workspace-page__inner">
      <div className="employee-detail__back-row">
        <Link to={ROUTES.EMPLOYEES}>
          <IconChevronLeft /> 返回员工列表
        </Link>
      </div>

      <div className="employee-detail__hero">
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
                <dt>工作方向</dt>
                <dd>{profile.workDirection || '未设置'}</dd>
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
      </div>

      <section className="employee-detail__surface workspace-card" aria-label="员工周期进展">
        <EmployeeProgressFilters
          value={{ periodType, periodStart, status }}
          showScopeFilters={false}
          onChange={(next) =>
            searchParams.update(
              {
                periodType: next.periodType,
                periodStart: next.periodStart,
                status: next.status,
                page: 1,
              },
              { defaults: { page: 1 } }
            )
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

        <EmployeeProgressMetrics
          metrics={progress.metrics}
          nextPlanMetrics={progress.nextPlanMetrics}
        />

        <section className="employee-detail__section" aria-label="本周执行">
          <header>
            <h2>本周执行</h2>
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
              onEdit={setEditingWorkItem}
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

        <section className="employee-detail__section" aria-label="下周计划">
          <header>
            <h2>下周计划</h2>
            <span>
              {weekPlansQuery.data?.period.start ?? planPeriodStart} —{' '}
              {weekPlansQuery.data?.period.end ?? '—'}
            </span>
          </header>
          {weekPlansQuery.isPending ? (
            <div className="employee-detail__table-loading" aria-label="正在加载下周计划">
              <Skeleton.Paragraph rows={3} />
            </div>
          ) : weekPlansQuery.isError ? (
            <div className="employee-detail__feedback">
              <Banner
                type="danger"
                fullMode={false}
                title="无法读取下周计划"
                description="请稍后重试。"
                closeIcon={null}
              >
                <Button onClick={() => void weekPlansQuery.refetch()}>重试</Button>
              </Banner>
            </div>
          ) : (
            <EmployeeWeekPlanTable
              plans={weekPlansQuery.data?.data ?? []}
              focusedPlanId={focusedPlanId}
              onEdit={openEditPlan}
              onCancel={(plan) => {
                setCancelReason('')
                setPlanDialog({ mode: 'cancel', plan })
              }}
              onMatch={(plan) => {
                setMatchWorkItemId('')
                setPlanDialog({ mode: 'match', plan })
              }}
              onUnmatch={(plan) => unmatchPlanMutation.mutate(plan)}
              onConvertToTask={(plan) => convertPlanMutation.mutate(plan)}
              pendingPlanId={
                convertPlanMutation.isPending ? (convertPlanMutation.variables?.id ?? null) : null
              }
              pagination={{
                currentPage: nextPlanPage,
                pageSize: PAGE_SIZE,
                total: weekPlansQuery.data?.meta.total ?? 0,
                showSizeChanger: false,
                onPageChange: (nextPage: number) =>
                  searchParams.update(
                    { nextPlanPage: nextPage },
                    { defaults: { nextPlanPage: 1 } }
                  ),
              }}
            />
          )}
        </section>

        <EmployeeProgressTrend
          points={trendPoints}
          hint={status ? '趋势不受状态筛选影响' : undefined}
        />

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

      <ActivityTimeline employeeId={employeeId} />

      <EmployeeWorkItemEditor
        key={editingWorkItem?.id ?? 'closed'}
        item={editingWorkItem}
        projects={(editProjectsQuery.data?.data ?? []).map((project) => ({
          value: project.id,
          label: `${project.code} ${project.name}`,
        }))}
        tasks={(editTasksQuery.data?.data ?? []).map((task) => ({
          value: task.id,
          label: `${task.code} ${task.title}`,
          projectId: task.projectId,
        }))}
        loading={updateWorkItemMutation.isPending}
        onCancel={() => setEditingWorkItem(null)}
        onSubmit={(item, input) => updateWorkItemMutation.mutate({ item, input })}
      />

      <Modal
        title={
          planDialog?.mode === 'edit'
            ? '编辑计划系统字段'
            : planDialog?.mode === 'cancel'
              ? '取消计划'
              : '承接计划'
        }
        visible={Boolean(planDialog)}
        width={560}
        onCancel={() => setPlanDialog(null)}
        footer={
          <div className="workspace-modal-footer">
            <Button onClick={() => setPlanDialog(null)}>取消</Button>
            <Button
              theme="solid"
              type="primary"
              loading={
                updatePlanMutation.isPending ||
                cancelPlanMutation.isPending ||
                matchPlanMutation.isPending
              }
              onClick={submitPlanDialog}
            >
              确认
            </Button>
          </div>
        }
      >
        {planDialog?.mode === 'edit' && planDraft ? (
          <div className="employee-detail__plan-form">
            <div className="employee-detail__plan-field">
              <span>工作类型</span>
              <Select
                aria-label="工作类型"
                value={planDraft.workKind}
                optionList={[
                  { value: 'PROJECT', label: '项目工作' },
                  { value: 'NON_PROJECT', label: '非项目工作' },
                ]}
                onChange={(value) =>
                  setPlanDraft((current) =>
                    current ? { ...current, workKind: value as EmployeeWorkKind } : current
                  )
                }
              />
            </div>
            {planDraft.workKind === 'PROJECT' ? (
              <div className="workspace-modal-form__grid">
                <div className="employee-detail__plan-field">
                  <span>项目 ID</span>
                  <Select
                    aria-label="项目 ID"
                    filter
                    value={planDraft.projectId || undefined}
                    placeholder="请选择项目"
                    optionList={(editProjectsQuery.data?.data ?? []).map((project) => ({
                      value: project.id,
                      label: `${project.code} ${project.name}`,
                    }))}
                    onChange={(value) =>
                      setPlanDraft((current) =>
                        current
                          ? { ...current, projectId: String(value), taskId: '' }
                          : current
                      )
                    }
                  />
                </div>
                <div className="employee-detail__plan-field">
                  <span>任务 ID</span>
                  <Select
                    aria-label="任务 ID"
                    filter
                    showClear
                    value={planDraft.taskId || undefined}
                    placeholder="请选择项目内任务"
                    optionList={(editTasksQuery.data?.data ?? [])
                      .filter((task) => task.projectId === planDraft.projectId)
                      .map((task) => ({
                        value: task.id,
                        label: `${task.code} ${task.title}`,
                      }))}
                    onChange={(value) =>
                      setPlanDraft((current) =>
                        current ? { ...current, taskId: value ? String(value) : '' } : current
                      )
                    }
                  />
                </div>
              </div>
            ) : null}
            <div className="workspace-modal-form__grid">
              <div className="employee-detail__plan-field">
                <span>计划完成日</span>
                <WorkspaceDatePicker
                  aria-label="计划完成日"
                  mode="date"
                  value={planDraft.plannedCompletionAt}
                  onChange={(value) =>
                    setPlanDraft((current) =>
                      current ? { ...current, plannedCompletionAt: value } : current
                    )
                  }
                />
              </div>
              <div className="employee-detail__plan-field">
                <span>优先级</span>
                <Select
                  aria-label="优先级"
                  value={planDraft.priority}
                  optionList={[
                    { value: 'UNSPECIFIED', label: '未指定' },
                    { value: 'LOW', label: '低' },
                    { value: 'MEDIUM', label: '中' },
                    { value: 'HIGH', label: '高' },
                    { value: 'URGENT', label: '紧急' },
                  ]}
                  onChange={(value) =>
                    setPlanDraft((current) =>
                      current ? { ...current, priority: value as EmployeePlanPriority } : current
                    )
                  }
                />
              </div>
            </div>
            <div className="employee-detail__plan-field">
              <span>协作需求</span>
              <TextArea
                aria-label="协作需求"
                value={planDraft.collaborationText}
                onChange={(value) =>
                  setPlanDraft((current) =>
                    current ? { ...current, collaborationText: value } : current
                  )
                }
              />
            </div>
          </div>
        ) : null}
        {planDialog?.mode === 'cancel' ? (
          <div className="employee-detail__plan-form">
            <span>取消原因</span>
            <TextArea
              aria-label="取消原因"
              value={cancelReason}
              onChange={setCancelReason}
              placeholder="说明取消原因，便于后续追溯"
            />
          </div>
        ) : null}
        {planDialog?.mode === 'match' ? (
          <div className="employee-detail__plan-form">
            <span>承接到计划周期执行</span>
            <Select
              aria-label="承接到计划周期执行"
              value={selectedMatchWorkItemId || undefined}
              placeholder={
                matchCandidatesQuery.isPending ? '正在加载计划周期执行项' : '选择同员工同周期执行项'
              }
              loading={matchCandidatesQuery.isPending}
              optionList={(matchCandidatesQuery.data?.data ?? []).map((item) => ({
                value: item.id,
                label: item.title,
              }))}
              onChange={(value) => setMatchWorkItemId(String(value))}
            />
          </div>
        ) : null}
      </Modal>
      </div>
    </div>
  )
}
