import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Banner,
  Button,
  Input,
  Modal,
  Progress,
  Select,
  Skeleton,
  Tag,
} from '@douyinfe/semi-ui'
import { DateTimePickerField } from '@/components/FormControls/DateTimePickerField'
import {
  IconCalendarStroked,
  IconChevronLeft,
  IconFolderStroked,
  IconPlus,
} from '@douyinfe/semi-icons'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  archiveMilestone,
  archiveProgressReport,
  archiveProject,
  applyProjectScheduleChange,
  createProjectPlanBaseline,
  getProject,
  getProjectCriticalPath,
  listProjectPlanBaselines,
  listProjectPlanChanges,
  previewProjectScheduleImpact,
  updateProjectWorkItemView,
} from '@/modules/workbench/api/projects'
import { listMeetings, listPartners, listRisks } from '@/modules/workbench/api/management'
import { archiveTask, updateTask } from '@/modules/workbench/api/tasks'
import { listNonProjectRd } from '@/modules/workbench/api/operations'
import { request } from '@/lib/http'
import {
  getProjectTeamProgress,
  listEmployeeWeekPlans,
  listEmployeeWorkItems,
} from '@/modules/employees/api'
import { EmployeeWeekPlanTable } from '@/modules/employees/components/EmployeeWeekPlanTable'
import { EmployeeWorkTable } from '@/modules/employees/components/EmployeeWorkTable'
import { ProjectProgressDrafts } from '@/modules/employees/components/ProjectProgressDrafts'
import { ActivityTimeline } from '@/modules/activity/components/ActivityTimeline'
import { defaultPeriodStart } from '@/modules/employees/periods'
import { useAuthStore } from '@/modules/auth/store'
import { listProjectProgressDrafts } from '@/modules/employees/api'
import { employeeQueryKeys } from '@/modules/employees/queryKeys'
import type {
  ProjectDetail,
  ProjectHealth,
  ProjectStatus,
  ProjectWorkItemViewConfig,
  ProjectWorkItemViewType,
  ProjectScheduleChangeInput,
  ProjectScheduleImpact,
  Milestone,
  ProgressReport,
  TaskStatus,
  WorkTask,
} from '@/modules/workbench/types'
import type { BaseRecord, DataField, GanttViewConfig } from '@/modules/base/types'
import { KanbanView } from '@/modules/base/components/KanbanView'
import { CalendarView } from '@/modules/base/components/CalendarView'
import { GanttView } from '@/modules/base/components/GanttView'
import { ROUTES } from '@/constants/routes'
import { ProgressReportForm } from '@/modules/workbench/components/ProgressReportForm'
import { ProjectProgressTimeline } from '@/modules/workbench/components/ProjectProgressTimeline'
import { TaskForm } from '@/modules/workbench/components/TaskForm'
import { MilestoneForm } from '@/modules/workbench/components/MilestoneForm'
import { ProjectDetailsForm } from '@/modules/workbench/components/ProjectDetailsForm'
import { FileAttachments } from '@/modules/content/components/FileAttachments'
import { toast } from 'sonner'
import './ProjectWorkspacePage.less'
import { useRouteHistoryTitle } from '@/components/AppShell/RouteHistoryTitleContext'

const SECTIONS = [
  { key: 'overview', label: '概览' },
  { key: 'work-items', label: '工作项' },
  { key: 'progress', label: '进展' },
  { key: 'risks', label: '风险与问题' },
  { key: 'meetings', label: '会议' },
  { key: 'docs', label: '文档与资料' },
  { key: 'activity', label: '动态' },
] as const

type ProjectSection = (typeof SECTIONS)[number]['key']

const STATUS_LABELS: Record<ProjectStatus, string> = {
  DRAFT: '草稿',
  ACTIVE: '进行中',
  ON_HOLD: '已暂停',
  COMPLETED: '已完成',
  CANCELLED: '已终止',
}

const STATUS_COLORS: Record<ProjectStatus, 'grey' | 'green' | 'amber' | 'blue' | 'red'> = {
  DRAFT: 'grey',
  ACTIVE: 'green',
  ON_HOLD: 'amber',
  COMPLETED: 'blue',
  CANCELLED: 'red',
}

const TASK_LABELS: Record<TaskStatus, string> = {
  TODO: '待开始',
  IN_PROGRESS: '进行中',
  BLOCKED: '阻塞',
  DONE: '已完成',
  CANCELLED: '已取消',
}

const HEALTH_LABELS: Record<ProjectHealth, string> = {
  GREEN: '健康',
  YELLOW: '需关注',
  RED: '有风险',
}

function rememberProjectVisit(id: string) {
  try {
    const current = JSON.parse(
      localStorage.getItem('rd-workbench:recent-projects') ?? '[]'
    ) as string[]
    const next = [id, ...current.filter((item) => item !== id)].slice(0, 8)
    localStorage.setItem('rd-workbench:recent-projects', JSON.stringify(next))
    window.dispatchEvent(new Event('rd-workbench:recent-projects-changed'))
  } catch {
    localStorage.setItem('rd-workbench:recent-projects', JSON.stringify([id]))
    window.dispatchEvent(new Event('rd-workbench:recent-projects-changed'))
  }
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString('zh-CN') : '未设置'
}

function useCanPublishProject(project: ProjectDetail | undefined): boolean {
  return useAuthStore((state) => {
    const user = state.user
    if (!user || !project) return false
    if (user.roleCodes.includes('SUPER_ADMIN')) return true
    if (user.permissions.some((grant) => grant.code === 'project.progress.publish')) return true
    return project.ownerUserId === user.id
  })
}

function ProjectWorkspaceSkeleton() {
  return (
    <div className="project-workspace project-workspace--loading" aria-label="正在加载项目空间">
      <Skeleton.Title style={{ width: 280 }} />
      <Skeleton.Paragraph rows={5} />
    </div>
  )
}

function EmptySection({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: React.ReactNode
}) {
  return (
    <div className="project-workspace__empty">
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  )
}

function ProjectPlanPanel({ project }: { project: ProjectDetail }) {
  const queryClient = useQueryClient()
  const baselinesQuery = useQuery({
    queryKey: ['project-plan-baselines', project.id],
    queryFn: () => listProjectPlanBaselines(project.id),
  })
  const changesQuery = useQuery({
    queryKey: ['project-plan-changes', project.id],
    queryFn: () => listProjectPlanChanges(project.id),
  })
  const criticalPathQuery = useQuery({
    queryKey: ['project-critical-path', project.id],
    queryFn: () => getProjectCriticalPath(project.id),
  })
  const defaultEntity = project.tasks[0]
    ? `TASK:${project.tasks[0].id}`
    : project.milestones[0]
      ? `MILESTONE:${project.milestones[0].id}`
      : ''
  const [selectedEntity, setSelectedEntity] = useState(defaultEntity)
  const [nextDate, setNextDate] = useState('')
  const [reason, setReason] = useState('')
  const [impact, setImpact] = useState<ProjectScheduleImpact | null>(null)
  const baselineMutation = useMutation({
    mutationFn: () =>
      createProjectPlanBaseline(project.id, {
        name: `计划基线 ${new Date().toLocaleDateString('zh-CN')}`,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-plan-baselines', project.id] })
      toast.success('当前计划已生成只读基线')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : '生成计划基线失败。'),
  })
  const scheduleInput = (): ProjectScheduleChangeInput | null => {
    const [entityType, entityId] = selectedEntity.split(':')
    if (
      (entityType !== 'TASK' && entityType !== 'MILESTONE') ||
      !entityId ||
      !nextDate ||
      !reason.trim()
    ) {
      return null
    }
    return {
      entityType,
      entityId,
      nextDate: new Date(`${nextDate}T00:00:00.000Z`).toISOString(),
      reason: reason.trim(),
    }
  }
  const previewMutation = useMutation({
    mutationFn: async () => {
      const input = scheduleInput()
      if (!input) throw new Error('请选择变更对象、日期并填写变更原因。')
      return previewProjectScheduleImpact(project.id, input)
    },
    onSuccess: setImpact,
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : '影响预览失败。'),
  })
  const applyMutation = useMutation({
    mutationFn: async () => {
      const input = scheduleInput()
      if (!input || !impact) throw new Error('请先生成最新影响预览。')
      return applyProjectScheduleChange(project.id, input)
    },
    onSuccess: async () => {
      setImpact(null)
      setReason('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project', project.id] }),
        queryClient.invalidateQueries({ queryKey: ['project-plan-changes', project.id] }),
        queryClient.invalidateQueries({ queryKey: ['project-critical-path', project.id] }),
      ])
      toast.success('计划变更已记录')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : '计划变更失败。'),
  })
  const latestBaseline = baselinesQuery.data?.[0]

  return (
    <section className="project-workspace__panel project-workspace__panel--wide project-workspace__plan">
      <header>
        <div>
          <h2>计划基线与关键路径</h2>
          <span>
            {criticalPathQuery.data
              ? `关键路径 ${criticalPathQuery.data.criticalTaskIds.length} 个工作项`
              : '正在计算关键路径'}
          </span>
        </div>
        <Button
          size="small"
          loading={baselineMutation.isPending}
          aria-label="生成当前计划基线"
          onClick={() => baselineMutation.mutate()}
        >
          生成基线
        </Button>
      </header>
      {latestBaseline ? (
        <div className="project-workspace__baseline-summary">
          <strong>{latestBaseline.name} · V{latestBaseline.version}</strong>
          <span>生成于 {formatDate(latestBaseline.createdAt)}</span>
          <span>只读快照：{latestBaseline.milestoneSnapshots.length} 个里程碑 / {latestBaseline.taskSnapshots.length} 个工作项</span>
        </div>
      ) : baselinesQuery.isPending ? (
        <Skeleton.Paragraph rows={1} />
      ) : (
        <p className="project-workspace__muted">尚未批准计划基线。</p>
      )}
      <div className="project-workspace__schedule-change">
        <div className="project-workspace__schedule-field">
          <span id="project-plan-entity-label">计划变更对象</span>
          <Select
            aria-labelledby="project-plan-entity-label"
            value={selectedEntity}
            optionList={[
              ...project.tasks.map((task) => ({
                value: `TASK:${task.id}`,
                label: `工作项 · ${task.title}`,
              })),
              ...project.milestones.map((milestone) => ({
                value: `MILESTONE:${milestone.id}`,
                label: `里程碑 · ${milestone.name}`,
              })),
            ]}
            onChange={(value) => {
              setSelectedEntity(String(value))
              setImpact(null)
            }}
            style={{ width: '100%' }}
          />
        </div>
        <div className="project-workspace__schedule-field">
          <span>调整后日期</span>
          <DateTimePickerField
            id="project-plan-next-date"
            mode="date"
            aria-label="调整后日期"
            value={nextDate}
            onChange={(value) => {
              setNextDate(value)
              setImpact(null)
            }}
          />
        </div>
        <div className="project-workspace__schedule-field project-workspace__schedule-reason">
          <span>变更原因</span>
          <Input
            aria-label="计划变更原因"
            value={reason}
            onChange={(value) => {
              setReason(value)
              setImpact(null)
            }}
          />
        </div>
        <Button
          loading={previewMutation.isPending}
          aria-label="预览计划影响"
          onClick={() => previewMutation.mutate()}
        >
          预览影响
        </Button>
      </div>
      {impact ? (
        <div className="project-workspace__impact-preview" role="status">
          <strong>将影响 {impact.affectedTaskIds.length} 个工作项</strong>
          <Tag color={impact.affectsCriticalPath ? 'red' : 'blue'}>
            {impact.affectsCriticalPath ? '影响关键路径' : '不影响关键路径'}
          </Tag>
          <span>{impact.delayDays >= 0 ? `延期 ${impact.delayDays} 天` : `提前 ${Math.abs(impact.delayDays)} 天`}</span>
          <Button
            theme="solid"
            type="primary"
            loading={applyMutation.isPending}
            aria-label="确认计划变更"
            onClick={() => applyMutation.mutate()}
          >
            确认变更
          </Button>
        </div>
      ) : null}
      {changesQuery.data?.length ? (
        <ol className="project-workspace__plan-changes" aria-label="计划变更记录">
          {changesQuery.data.slice(0, 5).map((change) => (
            <li key={change.id}>
              <strong>{change.reason}</strong>
              <span>{change.entityType === 'TASK' ? '工作项' : '里程碑'} · {formatDate(change.changedAt)}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}

function ProjectPartnersSection({ projectId }: { projectId: string }) {
  const partnersQuery = useQuery({
    queryKey: ['partners', { projectId, pageSize: 6 }],
    queryFn: () => listPartners({ projectId, pageSize: 6 }),
  })

  return (
    <section className="project-workspace__panel project-workspace__panel--wide">
      <header>
        <h2>关联合作方</h2>
        <Link to={`${ROUTES.governance('partners')}?projectId=${encodeURIComponent(projectId)}`}>
          管理合作方
        </Link>
      </header>
      {partnersQuery.isPending ? <Skeleton.Paragraph rows={2} /> : null}
      {partnersQuery.isError ? (
        <div className="project-workspace__inline-error">
          <span>无法读取项目合作方。</span>
          <Button size="small" onClick={() => void partnersQuery.refetch()}>重试</Button>
        </div>
      ) : null}
      {partnersQuery.data?.data.length ? (
        <ul className="project-workspace__partner-list">
          {partnersQuery.data.data.map((partner) => (
            <li key={partner.id}>
              <span className="project-workspace__partner-mark">{partner.name.slice(0, 1)}</span>
              <div>
                <strong>{partner.name}</strong>
                <span>{partner.category || '未分类'} · {partner.contactCount ?? 0} 位联系人 · {partner.activeAgreementCount ?? 0} 份履约协议</span>
              </div>
              <time>下次跟进 {formatDate(partner.nextFollowUpAt ?? null)}</time>
              <Link
                aria-label={`打开合作方：${partner.name}`}
                to={`${ROUTES.governance('partners')}?recordId=${encodeURIComponent(partner.id)}&projectId=${encodeURIComponent(projectId)}`}
              >
                查看
              </Link>
            </li>
          ))}
        </ul>
      ) : partnersQuery.data ? (
        <p className="project-workspace__muted">当前项目还没有关联合作方。</p>
      ) : null}
    </section>
  )
}

function ProjectNonProjectRdSection({ projectId }: { projectId: string }) {
  const itemsQuery = useQuery({
    queryKey: ['non-project-rd', { projectId, pageSize: 6 }],
    queryFn: () => listNonProjectRd({ projectId, pageSize: 6 }),
  })
  return (
    <section className="project-workspace__panel project-workspace__panel--wide" aria-label="关联非项目研发">
      <header>
        <h2>关联非项目研发</h2>
        <Link to={`${ROUTES.OPERATIONS}?tab=non-project-rd&projectId=${encodeURIComponent(projectId)}`}>
          管理研发事项
        </Link>
      </header>
      {itemsQuery.isPending ? <Skeleton.Paragraph rows={2} /> : null}
      {itemsQuery.isError ? (
        <div><span>无法读取关联研发事项。</span><Button size="small" onClick={() => void itemsQuery.refetch()}>重试</Button></div>
      ) : null}
      {itemsQuery.data?.data.length ? (
        <ul className="project-workspace__partner-list">
          {itemsQuery.data.data.map((item) => (
            <li key={item.id}>
              <span className="project-workspace__partner-mark">研</span>
              <div><strong>{item.title}</strong><span>{item.code} · {item.status}</span></div>
              <Link
                aria-label={`打开研发事项：${item.title}`}
                to={`${ROUTES.OPERATIONS}?tab=non-project-rd&recordId=${encodeURIComponent(item.id)}&projectId=${encodeURIComponent(projectId)}`}
              >
                查看
              </Link>
            </li>
          ))}
        </ul>
      ) : itemsQuery.data ? <p className="project-workspace__muted">当前项目还没有关联非项目研发事项。</p> : null}
    </section>
  )
}

function OverviewSection({
  project,
  onEditProject,
  onCreateMilestone,
  onEditMilestone,
  onDeleteMilestone,
}: {
  project: ProjectDetail
  onEditProject: () => void
  onCreateMilestone: () => void
  onEditMilestone: (milestone: Milestone) => void
  onDeleteMilestone: (milestone: Milestone) => void
}) {
  const openTasks = project.tasks.filter(
    (task) => task.status !== 'DONE' && task.status !== 'CANCELLED'
  )
  const latestProgress = project.progressReports.find((report) => report.sourceType === 'MANUAL')
  const health = project.effectiveHealth ?? project.healthOverride ?? project.latestHealthSnapshot?.health
  const completedMilestones = project.milestones.filter((item) => item.status === 'COMPLETED').length
  const calculatedProgress = project.progressSummary

  return (
    <div className="project-workspace__overview">
      <section className="project-workspace__metrics" aria-label="项目摘要">
        <div>
          <span>当前进度</span>
          <strong>{calculatedProgress?.actualPercent === null ? '未规划' : `${calculatedProgress?.actualPercent ?? 0}%`}</strong>
          <Progress percent={calculatedProgress?.actualPercent ?? 0} showInfo={false} />
        </div>
        <div>
          <span>待处理工作项</span>
          <strong>{openTasks.length}</strong>
          <small>共 {project.tasks.length} 项</small>
        </div>
        <div>
          <span>里程碑</span>
          <strong>{project.milestones.length}</strong>
          <small>{project.milestones.filter((item) => item.status === 'COMPLETED').length} 个已完成</small>
        </div>
        <div>
          <span>项目健康度</span>
          <strong>{health ? HEALTH_LABELS[health] : '待评估'}</strong>
          <small>{project.healthOverride ? '人工设置' : '根据任务与里程碑自动评估'}</small>
        </div>
      </section>

      <div className="project-workspace__overview-grid">
        <section className="project-workspace__panel">
          <header><h2>项目目标</h2><Button size="small" theme="borderless" onClick={onEditProject}>编辑</Button></header>
          <p className="project-workspace__objective">{project.objective || '尚未填写项目目标。'}</p>
          <dl className="project-workspace__facts">
            <div><dt>预期成果</dt><dd>{project.expectedOutcome || '未设置'}</dd></div>
            <div><dt>研究方向</dt><dd>{project.researchDirection || '未设置'}</dd></div>
            <div><dt>项目周期</dt><dd>{formatDate(project.plannedStartAt)} — {formatDate(project.plannedEndAt)}</dd></div>
          </dl>
        </section>

        <section className="project-workspace__panel">
          <header><h2>最近进展</h2></header>
          {latestProgress ? (
            <div className="project-workspace__latest-progress">
              <strong>{latestProgress.summary}</strong>
              <time>{formatDate(latestProgress.reportedAt)}</time>
              {latestProgress.blockers ? <p>阻塞：{latestProgress.blockers}</p> : null}
            </div>
          ) : <p className="project-workspace__muted">尚未提交项目进展。</p>}
        </section>

        <section className="project-workspace__panel project-workspace__panel--wide">
          <header>
            <div><h2>里程碑</h2><span>{completedMilestones}/{project.milestones.length} 已完成</span></div>
            <Button size="small" theme="borderless" icon={<IconPlus />} aria-label="新建里程碑" onClick={onCreateMilestone}>新建</Button>
          </header>
          {calculatedProgress ? (
            <ProjectProgressTimeline
              summary={calculatedProgress}
              milestones={project.milestones}
              onSelectMilestone={onEditMilestone}
              onDeleteMilestone={onDeleteMilestone}
            />
          ) : <p className="project-workspace__muted">项目进度正在计算，请稍后刷新。</p>}
        </section>

        <section className="project-workspace__panel project-workspace__panel--wide">
          <header><h2>临近工作项</h2><span>{openTasks.length}</span></header>
          {openTasks.length ? (
            <ul className="project-workspace__task-list">
              {openTasks.slice(0, 6).map((task) => (
                <li key={task.id}>
                  <span className={`project-workspace__priority project-workspace__priority--${task.priority.toLowerCase()}`} />
                  <strong>{task.title}</strong>
                  <span>{task.assigneeName || '未指定负责人'}</span>
                  <time>{formatDate(task.dueAt)}</time>
                  <Tag size="small">{TASK_LABELS[task.status]}</Tag>
                </li>
              ))}
            </ul>
          ) : <p className="project-workspace__muted">当前没有待处理工作项。</p>}
        </section>

        <ProjectPlanPanel project={project} />
        <ProjectPartnersSection projectId={project.id} />
        <ProjectNonProjectRdSection projectId={project.id} />
      </div>
    </div>
  )
}

function WorkItemsSection({
  project,
  onCreate,
  onEdit,
  onDelete,
}: {
  project: ProjectDetail
  onCreate: () => void
  onEdit: (task: WorkTask) => void
  onDelete: (task: WorkTask) => void
}) {
  const queryClient = useQueryClient()
  const baselinesQuery = useQuery({
    queryKey: ['project-plan-baselines', project.id],
    queryFn: () => listProjectPlanBaselines(project.id),
  })
  const criticalPathQuery = useQuery({
    queryKey: ['project-critical-path', project.id],
    queryFn: () => getProjectCriticalPath(project.id),
  })
  const initialConfig = project.workItemViewConfig ?? {
    type: 'LIST',
    groupField: 'status',
    hiddenFields: [],
    ganttScale: 'WEEK',
  }
  const [config, setConfig] = useState<ProjectWorkItemViewConfig>(initialConfig)
  const [isSavingView, setIsSavingView] = useState(false)
  const taskById = useMemo(() => new Map(project.tasks.map((task) => [task.id, task])), [project.tasks])
  const fields = useMemo<DataField[]>(
    () => [
      {
        id: 'project-task-title',
        tableId: project.id,
        key: 'title',
        name: '任务',
        type: 'TEXT',
        config: { readOnly: true },
        isPrimary: true,
        isRequired: true,
        sequence: 0,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'project-task-status',
        tableId: project.id,
        key: 'status',
        name: '状态',
        type: 'SINGLE_SELECT',
        config: {
          options: Object.entries(TASK_LABELS).map(([value, label]) => ({ value, label })),
        },
        isPrimary: false,
        isRequired: true,
        sequence: 1,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'project-task-priority',
        tableId: project.id,
        key: 'priority',
        name: '优先级',
        type: 'SINGLE_SELECT',
        config: {
          options: [
            { value: 'LOW', label: '低' },
            { value: 'MEDIUM', label: '中' },
            { value: 'HIGH', label: '高' },
            { value: 'CRITICAL', label: '紧急' },
          ],
        },
        isPrimary: false,
        isRequired: true,
        sequence: 2,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'project-task-assignee',
        tableId: project.id,
        key: 'assigneeName',
        name: '负责人',
        type: 'TEXT',
        config: { readOnly: true },
        isPrimary: false,
        isRequired: false,
        sequence: 3,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'project-task-due',
        tableId: project.id,
        key: 'dueAt',
        name: '计划日期',
        type: 'DATETIME',
        config: {},
        isPrimary: false,
        isRequired: false,
        sequence: 4,
        createdAt: '',
        updatedAt: '',
      },
    ],
    [project.id]
  )
  const records = useMemo<BaseRecord[]>(
    () =>
      project.tasks
        .filter((task) => !config.status || task.status === config.status)
        .filter((task) => {
          const query = config.query?.trim().toLocaleLowerCase()
          return !query || `${task.title} ${task.assigneeName ?? ''}`.toLocaleLowerCase().includes(query)
        })
        .map((task) => ({
          id: task.id,
          values: {
            title: task.title,
            status: task.status,
            priority: task.priority,
            assigneeName: task.assigneeName,
            dueAt: task.dueAt,
          },
          sourceType: 'WORK_TASK',
          sourceId: task.id,
          sourcePath: `/tasks/${encodeURIComponent(task.id)}`,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        })),
    [config.query, config.status, project.tasks]
  )

  async function persistConfig(next: ProjectWorkItemViewConfig) {
    const previous = config
    setConfig(next)
    setIsSavingView(true)
    try {
      await updateProjectWorkItemView(project.id, next)
    } catch (error) {
      setConfig(previous)
      toast.error(error instanceof Error ? error.message : '工作项视图保存失败。')
    } finally {
      setIsSavingView(false)
    }
  }

  async function updateTaskValues(
    taskId: string,
    values: Record<string, unknown>
  ) {
    const status = typeof values.status === 'string' && values.status in TASK_LABELS
      ? values.status as TaskStatus
      : undefined
    const priority = typeof values.priority === 'string'
      && ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(values.priority)
      ? values.priority as WorkTask['priority']
      : undefined
    const dueAt = typeof values.dueAt === 'string' ? values.dueAt : undefined
    if (!status && !priority && !dueAt) return
    await updateTask(taskId, { ...(status ? { status } : {}), ...(priority ? { priority } : {}), ...(dueAt ? { dueAt } : {}) })
    await queryClient.invalidateQueries({ queryKey: ['project', project.id] })
  }

  const viewTypes: Array<{ type: ProjectWorkItemViewType; label: string }> = [
    { type: 'LIST', label: '列表' },
    { type: 'BOARD', label: '看板' },
    { type: 'CALENDAR', label: '日历' },
    { type: 'GANTT', label: '甘特' },
  ]
  const openRecord = (record: BaseRecord) => {
    const task = taskById.get(record.id)
    if (task) onEdit(task)
  }
  const ganttConfig: GanttViewConfig = {
    titleFieldKey: 'title',
    startFieldKey: 'dueAt',
    endFieldKey: 'dueAt',
    scale: config.ganttScale ?? 'WEEK',
  }
  const criticalTasks = (criticalPathQuery.data?.criticalTaskIds ?? [])
    .map((taskId) => taskById.get(taskId))
    .filter((task): task is WorkTask & { dependencyIds: string[] } => Boolean(task))
  const latestBaseline = baselinesQuery.data?.[0]
  const baselineVariance = latestBaseline?.taskSnapshots.flatMap((snapshot) => {
    const task = taskById.get(snapshot.taskId)
    if (!task?.dueAt || !snapshot.dueAt) return []
    const days = Math.round(
      (new Date(task.dueAt).getTime() - new Date(snapshot.dueAt).getTime()) /
        (24 * 60 * 60 * 1000)
    )
    return days === 0 ? [] : [{ taskId: task.id, days }]
  }) ?? []

  if (!project.tasks.length) {
    return (
      <EmptySection title="还没有工作项" description="为这个项目创建第一个可执行任务。" action={<Button onClick={onCreate}>新建任务</Button>} />
    )
  }

  return (
    <section className="project-workspace__panel project-workspace__panel--section">
      <header><div><h2>全部工作项</h2><span>{project.tasks.length}</span></div><Button size="small" theme="borderless" icon={<IconPlus />} aria-label="新建工作项" onClick={onCreate}>新建工作项</Button></header>
      <div className="project-workspace__work-item-toolbar">
        <div role="tablist" aria-label="工作项视图">
          {viewTypes.map((view) => (
            <button
              key={view.type}
              type="button"
              role="tab"
              aria-selected={config.type === view.type}
              disabled={isSavingView}
              onClick={() => void persistConfig({ ...config, type: view.type })}
            >
              {view.label}
            </button>
          ))}
        </div>
        <Input
          aria-label="筛选项目工作项"
          value={config.query ?? ''}
          placeholder="筛选任务或负责人"
          onChange={(value) => void persistConfig({ ...config, query: value || undefined })}
        />
        <Select
          aria-label="按状态筛选工作项"
          value={config.status ?? ''}
          optionList={[
            { value: '', label: '全部状态' },
            ...Object.entries(TASK_LABELS).map(([value, label]) => ({ value, label })),
          ]}
          onChange={(value) => void persistConfig({
            ...config,
            status: (String(value) || undefined) as TaskStatus | undefined,
          })}
          style={{ minWidth: 150 }}
        />
      </div>
      {config.type === 'LIST' ? <ul className="project-workspace__task-list">
        {records.map((record) => {
          const task = taskById.get(record.id)!
          return <li key={task.id} data-testid={`list-task-${task.id}`}>
            <span className={`project-workspace__priority project-workspace__priority--${task.priority.toLowerCase()}`} />
            <div className="project-workspace__task-title"><strong>{task.title}</strong><Progress percent={task.completionPercent ?? 0} showInfo={false} aria-label={`${task.title}完成进度`} /></div>
            <span>{task.assigneeName || '未指定负责人'}</span>
            <time>{formatDate(task.dueAt)}</time>
            <span className="project-workspace__task-percent">{task.completionPercent ?? 0}%</span>
            <Tag size="small" color={task.status === 'DONE' ? 'blue' : task.status === 'IN_PROGRESS' ? 'green' : task.status === 'BLOCKED' ? 'red' : 'grey'}>{TASK_LABELS[task.status]}</Tag>
            <div className="project-workspace__row-actions"><Button size="small" theme="borderless" onClick={() => onEdit(task)}>编辑</Button><Button size="small" theme="borderless" type="danger" onClick={() => onDelete(task)}>删除</Button></div>
          </li>
        })}
      </ul> : null}
      {config.type === 'BOARD' ? (
        <KanbanView
          fields={fields}
          records={records}
          groupFieldKey={config.groupField ?? 'status'}
          onGroupFieldChange={(groupField) => void persistConfig({ ...config, groupField: groupField as 'status' | 'priority' })}
          onRecordUpdate={(taskId, input) => updateTaskValues(taskId, input.values)}
          onOpenRecord={openRecord}
        />
      ) : null}
      {config.type === 'CALENDAR' ? (
        <CalendarView fields={fields} records={records} dateFieldKey="dueAt" onOpenRecord={openRecord} />
      ) : null}
      {config.type === 'GANTT' ? (
        <div className="project-workspace__gantt-plan">
          <div className="project-workspace__gantt-markers">
            {criticalTasks.map((task) => (
              <Tag key={task.id} color="red">关键路径：{task.title}</Tag>
            ))}
            {baselineVariance.map(({ taskId, days }) => (
              <Tag key={taskId} color={days > 0 ? 'amber' : 'green'}>
                基线偏差 {days > 0 ? '+' : ''}{days} 天
              </Tag>
            ))}
          </div>
          <GanttView
            fields={fields}
            records={records}
            totalRecords={records.length}
            config={ganttConfig}
            onConfigChange={(next) => void persistConfig({ ...config, ganttScale: next.scale })}
            onRecordChange={updateTaskValues}
            onOpenRecord={openRecord}
          />
        </div>
      ) : null}
    </section>
  )
}

function ProgressSection({
  project,
  onCreate,
  onEdit,
  onDelete,
}: {
  project: ProjectDetail
  onCreate: () => void
  onEdit: (report: ProgressReport) => void
  onDelete: (report: ProgressReport) => void
}) {
  return project.progressReports.length ? (
    <section className="project-workspace__panel project-workspace__panel--section">
      <header><div><h2>进展记录</h2><span>{project.progressReports.length}</span></div><Button theme="solid" type="primary" size="small" icon={<IconPlus />} aria-label="提交进展" onClick={onCreate}>提交进展</Button></header>
      <ol className="project-workspace__timeline">
        {project.progressReports.map((report) => (
          <li key={report.id}>
            <span>{report.completionPercent}%</span>
            <div><strong>{report.summary}</strong><Progress percent={report.completionPercent} showInfo={false} aria-label={`${report.summary}项目进度`} /><time>{formatDate(report.reportedAt)}</time>{report.blockers ? <p>阻塞：{report.blockers}</p> : null}</div>
            {report.sourceType === 'MANUAL' ? (
              <div className="project-workspace__row-actions"><Button size="small" theme="borderless" onClick={() => onEdit(report)}>编辑</Button><Button size="small" theme="borderless" type="danger" onClick={() => onDelete(report)}>删除</Button></div>
            ) : <Tag size="small" color="blue">系统记录</Tag>}
          </li>
        ))}
      </ol>
    </section>
  ) : (
    <EmptySection title="还没有进展记录" description="提交本周进展和当前阻塞项。" action={<Button theme="solid" type="primary" onClick={onCreate}>提交进展</Button>} />
  )
}

type ProjectDocumentSummary = {
  id: string
  title: string
  type: 'DOCUMENT' | 'KNOWLEDGE_PAGE' | 'MEETING_MINUTES'
  updatedAt: string
}

type ProjectDocumentPage = {
  data: ProjectDocumentSummary[]
  meta: { page: number; pageSize: number; total: number }
}

function ProjectMeetingsSection({ project }: { project: ProjectDetail }) {
  const meetingsQuery = useQuery({
    queryKey: ['meetings', { projectId: project.id, pageSize: 6 }],
    queryFn: () => listMeetings({ projectId: project.id, pageSize: 6 }),
  })

  if (meetingsQuery.isPending) return <Skeleton.Paragraph rows={4} />
  if (meetingsQuery.isError) {
    return (
      <EmptySection
        title="无法读取项目会议"
        description="本地服务暂时没有返回会议，请重试。"
        action={<Button onClick={() => void meetingsQuery.refetch()}>重试</Button>}
      />
    )
  }

  return (
    <section className="project-workspace__panel project-workspace__panel--section">
      <header>
        <h2>项目会议</h2>
        <Link to={`${ROUTES.CALENDAR}?projectId=${project.id}`}>新建会议</Link>
      </header>
      {meetingsQuery.data.data.length ? (
        <ul className="project-workspace__task-list">
          {meetingsQuery.data.data.map((meeting) => (
            <li key={meeting.id}>
              <IconCalendarStroked />
              <strong>{meeting.title}</strong>
              <time>{new Date(meeting.scheduledAt).toLocaleString('zh-CN')}</time>
              <Tag size="small">{meeting.status === 'HELD' ? '已结束' : meeting.status === 'CANCELLED' ? '已取消' : '待召开'}</Tag>
              <Link
                aria-label={`打开会议：${meeting.title}`}
                to={`${ROUTES.CALENDAR}?meetingId=${meeting.id}`}
              >
                查看
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="project-workspace__muted">当前项目还没有会议，可从日历新建并自动关联。</p>
      )}
    </section>
  )
}

function ProjectDocumentsSection({
  project,
  focusedFileId,
}: {
  project: ProjectDetail
  focusedFileId?: string
}) {
  const documentsQuery = useQuery({
    queryKey: ['documents', { projectId: project.id, pageSize: 6 }],
    queryFn: () =>
      request<ProjectDocumentPage>(
        `/documents?projectId=${encodeURIComponent(project.id)}&pageSize=6`
      ),
  })

  if (documentsQuery.isPending) return <Skeleton.Paragraph rows={4} />
  if (documentsQuery.isError) {
    return (
      <EmptySection
        title="无法读取项目文档"
        description="本地服务暂时没有返回文档，请重试。"
        action={<Button onClick={() => void documentsQuery.refetch()}>重试</Button>}
      />
    )
  }

  return (
    <section className="project-workspace__panel project-workspace__panel--section">
      <header>
        <h2>文档与资料</h2>
        <Link to={`${ROUTES.DOCS}?projectId=${project.id}`}>打开项目资料</Link>
      </header>
      {documentsQuery.data.data.length ? (
        <ul className="project-workspace__task-list">
          {documentsQuery.data.data.map((document) => (
            <li key={document.id}>
              <IconFolderStroked />
              <strong>{document.title}</strong>
              <span>{document.type === 'KNOWLEDGE_PAGE' ? '知识页' : document.type === 'MEETING_MINUTES' ? '会议纪要' : '文档'}</span>
              <time>{new Date(document.updatedAt).toLocaleDateString('zh-CN')}</time>
              <Link
                aria-label={`打开文档：${document.title}`}
                to={`${ROUTES.DOCS}?documentId=${document.id}`}
              >
                打开
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="project-workspace__muted">当前项目还没有文档或知识页。</p>
      )}
      <FileAttachments associations={{ projectId: project.id }} focusedFileId={focusedFileId} />
    </section>
  )
}

const RISK_LABELS = { LOW: '低', MEDIUM: '中', HIGH: '高', CRITICAL: '严重' } as const

function ProjectRisksSection({ projectId }: { projectId: string }) {
  const risksQuery = useQuery({
    queryKey: ['risks', { projectId, pageSize: 100 }],
    queryFn: () => listRisks({ projectId, pageSize: 100 }),
  })

  if (risksQuery.isPending) return <Skeleton.Paragraph rows={4} />
  if (risksQuery.isError) {
    return <EmptySection title="无法读取项目风险" description="本地服务暂时没有返回风险记录。" action={<Button onClick={() => void risksQuery.refetch()}>重试</Button>} />
  }

  return (
    <section className="project-workspace__panel project-workspace__panel--section">
      <header><div><h2>风险与问题</h2><span>{risksQuery.data.data.length}</span></div><Link to={`${ROUTES.governance('risks')}?projectId=${projectId}`}>管理风险</Link></header>
      {risksQuery.data.data.length ? (
        <ul className="project-workspace__risk-list">
          {risksQuery.data.data.map((risk) => (
            <li key={risk.id}>
              <Tag className={`project-workspace__risk-level project-workspace__risk-level--${risk.level.toLowerCase()}`} color={risk.level === 'LOW' ? 'green' : risk.level === 'MEDIUM' ? 'amber' : 'red'}>{RISK_LABELS[risk.level]}风险</Tag>
              <div><strong>{risk.title}</strong><span>{risk.ownerName || '未指定负责人'} · {risk.status === 'CLOSED' ? '已关闭' : risk.status === 'MITIGATING' ? '处理中' : '待处理'}</span></div>
              <Link to={`${ROUTES.governance('risks')}?projectId=${projectId}&recordId=${risk.id}`}>查看</Link>
            </li>
          ))}
        </ul>
      ) : <p className="project-workspace__muted">当前项目没有风险记录。</p>}
    </section>
  )
}

function ProjectTeamProgressSection({ projectId }: { projectId: string }) {
  const filters = useMemo(
    () => ({ periodType: 'WEEK' as const, periodStart: defaultPeriodStart('WEEK') }),
    []
  )
  const teamQuery = useQuery({
    queryKey: employeeQueryKeys.projectProgress(projectId, filters),
    queryFn: () => getProjectTeamProgress(projectId, filters),
  })
  const reportPeriodStart = teamQuery.data?.period.start
  const currentWorkQuery = useQuery({
    queryKey: ['employees', 'project-current-work', projectId, reportPeriodStart],
    queryFn: () =>
      listEmployeeWorkItems({
        periodType: 'WEEK',
        periodStart: reportPeriodStart!,
        projectId,
        page: 1,
        pageSize: 20,
      }),
    enabled: Boolean(reportPeriodStart),
  })
  const nextPeriodStart = useMemo(() => {
    const value = new Date(`${reportPeriodStart ?? filters.periodStart}T00:00:00.000Z`)
    value.setUTCDate(value.getUTCDate() + 7)
    return value.toISOString().slice(0, 10)
  }, [filters.periodStart, reportPeriodStart])
  const futurePlansQuery = useQuery({
    queryKey: ['employees', 'project-future-plans', projectId, nextPeriodStart],
    queryFn: () =>
      listEmployeeWeekPlans({
        periodType: 'WEEK',
        periodStart: nextPeriodStart,
        projectId,
        page: 1,
        pageSize: 20,
      }),
    enabled: Boolean(reportPeriodStart),
  })

  if (teamQuery.isPending) return <Skeleton.Paragraph rows={3} />
  if (teamQuery.isError || !teamQuery.data) {
    return (
      <EmptySection
        title="无法读取团队进展"
        description="本地服务暂时没有返回团队进展数据。"
        action={<Button onClick={() => void teamQuery.refetch()}>重试</Button>}
      />
    )
  }

  const team = teamQuery.data
  const employees = team.employees?.data ?? []
  const employeeDetailUrl = (employeeId: string) =>
    `${ROUTES.employeeDetail(employeeId)}?periodType=${team.period.type}&periodStart=${team.period.start}`

  return (
    <>
      <section className="project-workspace__panel project-workspace__panel--section project-workspace__team-progress">
      <header>
        <div>
          <h2>团队进展</h2>
          <span>
            {team.period.start} — {team.period.end}
          </span>
        </div>
        <Link
          aria-label="打开团队概览"
          to={`${ROUTES.EMPLOYEES}?tab=overview&periodType=${team.period.type}&periodStart=${team.period.start}`}
        >
          团队概览
        </Link>
      </header>
      <p className="project-workspace__team-summary">
        参与 {team.employees?.total ?? employees.length} 人 · 计划 {team.metrics.plannedHours} 小时 /
        实际 {team.metrics.actualHours} 小时 · 完成 {team.metrics.completedCount}/
        {team.metrics.workItemCount} 项 · 风险 {team.metrics.riskCount}
      </p>
      {employees.length ? (
        <ul className="project-workspace__team-list">
          {employees.map((employee) => (
            <li key={employee.employeeId}>
              <div className="project-workspace__team-person">
                <Link to={employeeDetailUrl(employee.employeeId)}>{employee.displayName}</Link>
                <span>{employee.department || '未设置部门'}</span>
              </div>
              <div className="project-workspace__team-cell">
                <strong>完成</strong>
                <span>
                  {employee.completedItems.data.map((item) => item.title).join('、') || '—'}
                </span>
              </div>
              <div className="project-workspace__team-cell">
                <strong>下步计划</strong>
                <span>{employee.nextPlans.data.map((item) => item.text).join('、') || '—'}</span>
              </div>
              <div className="project-workspace__team-cell">
                <strong>风险</strong>
                <span>
                  {employee.risks.data
                    .map((item) => item.text)
                    .filter(Boolean)
                    .join('、') || '—'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="project-workspace__muted">当前周期还没有员工填报该项目的工作。</p>
      )}
      </section>

      <section className="project-workspace__panel project-workspace__panel--section project-workspace__employee-report-links">
        <header>
          <div>
            <h2>当前工作</h2>
            <span>{currentWorkQuery.data?.meta.total ?? 0}</span>
          </div>
          <Link
            to={`${ROUTES.EMPLOYEES}?tab=work-items&periodType=WEEK&periodStart=${team.period.start}&projectId=${encodeURIComponent(projectId)}`}
          >
            查看全部
          </Link>
        </header>
        {currentWorkQuery.isPending ? <Skeleton.Paragraph rows={3} /> : null}
        {currentWorkQuery.isError ? (
          <div className="project-workspace__inline-error">
            <span>无法读取项目当前工作。</span>
            <Button size="small" onClick={() => void currentWorkQuery.refetch()}>
              重试
            </Button>
          </div>
        ) : null}
        {currentWorkQuery.data ? (
          <EmployeeWorkTable items={currentWorkQuery.data.data} showEmployee />
        ) : null}
      </section>

      <section className="project-workspace__panel project-workspace__panel--section project-workspace__employee-report-links">
        <header>
          <div>
            <h2>未来计划</h2>
            <span>{futurePlansQuery.data?.meta.total ?? 0}</span>
          </div>
          <Link
            to={`${ROUTES.EMPLOYEES}?tab=overview&periodType=WEEK&periodStart=${team.period.start}&projectId=${encodeURIComponent(projectId)}`}
          >
            团队计划
          </Link>
        </header>
        {futurePlansQuery.isPending ? <Skeleton.Paragraph rows={3} /> : null}
        {futurePlansQuery.isError ? (
          <div className="project-workspace__inline-error">
            <span>无法读取项目未来计划。</span>
            <Button size="small" onClick={() => void futurePlansQuery.refetch()}>
              重试
            </Button>
          </div>
        ) : null}
        {futurePlansQuery.data ? (
          <EmployeeWeekPlanTable plans={futurePlansQuery.data.data} showEmployee />
        ) : null}
      </section>
    </>
  )
}

function ProjectSectionContent({
  section,
  project,
  canPublish,
  onCreateProgress,
  onCreateTask,
  onEditProject,
  onCreateMilestone,
  onEditMilestone,
  onDeleteMilestone,
  onEditTask,
  onDeleteTask,
  onEditProgress,
  onDeleteProgress,
  focusedFileId,
}: {
  section: ProjectSection
  project: ProjectDetail
  canPublish: boolean
  onCreateProgress: () => void
  onCreateTask: () => void
  onEditProject: () => void
  onCreateMilestone: () => void
  onEditMilestone: (milestone: Milestone) => void
  onDeleteMilestone: (milestone: Milestone) => void
  onEditTask: (task: WorkTask) => void
  onDeleteTask: (task: WorkTask) => void
  onEditProgress: (report: ProgressReport) => void
  onDeleteProgress: (report: ProgressReport) => void
  focusedFileId?: string
}) {
  if (section === 'work-items') return <WorkItemsSection project={project} onCreate={onCreateTask} onEdit={onEditTask} onDelete={onDeleteTask} />
  if (section === 'progress') {
    return (
      <>
        <ProgressSection project={project} onCreate={onCreateProgress} onEdit={onEditProgress} onDelete={onDeleteProgress} />
        <ProjectProgressDrafts projectId={project.id} canPublish={canPublish} />
        <ProjectTeamProgressSection projectId={project.id} />
      </>
    )
  }
  if (section === 'risks') {
    return <ProjectRisksSection projectId={project.id} />
  }
  if (section === 'meetings') {
    return <ProjectMeetingsSection project={project} />
  }
  if (section === 'docs') {
    return <ProjectDocumentsSection project={project} focusedFileId={focusedFileId} />
  }
  if (section === 'activity') {
    return (
      <>
        <ActivityTimeline projectId={project.id} />
      </>
    )
  }
  return <OverviewSection project={project} onEditProject={onEditProject} onCreateMilestone={onCreateMilestone} onEditMilestone={onEditMilestone} onDeleteMilestone={onDeleteMilestone} />
}

type ProjectDialog =
  | { type: 'project' }
  | { type: 'task'; task?: WorkTask }
  | { type: 'progress'; report?: ProgressReport }
  | { type: 'milestone'; milestone?: Milestone }

export default function ProjectWorkspacePage() {
  const { projectId = '', section: requestedSection = 'overview' } = useParams<{
    projectId: string
    section: string
  }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const focusedFileId = searchParams.get('fileId')?.trim() || undefined
  const [dialog, setDialog] = useState<ProjectDialog | null>(null)
  const section = SECTIONS.some((item) => item.key === requestedSection)
    ? (requestedSection as ProjectSection)
    : 'overview'
  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId),
    enabled: Boolean(projectId),
  })
  useRouteHistoryTitle(projectQuery.data?.name)
  const pendingDraftsQuery = useQuery({
    queryKey: ['project-progress-drafts', projectId, undefined],
    queryFn: () => listProjectProgressDrafts({ projectId }),
    enabled: Boolean(projectId),
    select: (drafts) => drafts.filter((draft) => draft.status === 'PENDING').length,
  })
  const pendingDraftCount = pendingDraftsQuery.data ?? 0
  const canPublish = useCanPublishProject(projectQuery.data)

  useEffect(() => {
    if (projectQuery.data) rememberProjectVisit(projectQuery.data.id)
  }, [projectQuery.data])

  async function refreshProject() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['my-work'] }),
    ])
  }

  function confirmDelete(title: string, content: string, action: () => Promise<void>) {
    Modal.confirm({
      title,
      content,
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { type: 'danger' },
      onOk: async () => {
        try {
          await action()
          await refreshProject()
          toast.success('已删除')
        } catch (error) {
          toast.error(error instanceof Error ? error.message : '删除失败，请重试。')
          throw error
        }
      },
    })
  }

  if (projectQuery.isPending) return <ProjectWorkspaceSkeleton />

  if (projectQuery.isError || !projectQuery.data) {
    return (
      <div className="project-workspace project-workspace--error">
        <Banner
          type="danger"
          fullMode={false}
          title="无法读取项目空间"
          description="请确认本地服务已启动，或返回项目列表后重试。"
          closeIcon={null}
        >
          <Button onClick={() => void projectQuery.refetch()}>重试</Button>
        </Banner>
      </div>
    )
  }

  const project = projectQuery.data
  const health = project.effectiveHealth ?? project.healthOverride ?? project.latestHealthSnapshot?.health

  return (
    <div className="project-workspace">
      <div className="project-workspace__back-row">
        <Link to={ROUTES.PROJECT_SPACES}><IconChevronLeft /> 返回项目列表</Link>
      </div>
      <header className="project-workspace__header">
        <div className="project-workspace__project-mark">{project.name.slice(0, 1)}</div>
        <div className="project-workspace__heading">
          <div><h1>{project.name}</h1><Tag className={`project-workspace__status project-workspace__status--${project.status.toLowerCase()}`} color={STATUS_COLORS[project.status]}>{STATUS_LABELS[project.status]}</Tag>{health ? <Tag color={health === 'GREEN' ? 'green' : health === 'YELLOW' ? 'amber' : 'red'}>{HEALTH_LABELS[health]}</Tag> : null}</div>
          <p><span>{project.code}</span><span>负责人：{project.leadName || '未指定'}</span><span>{formatDate(project.plannedStartAt)} — {formatDate(project.plannedEndAt)}</span></p>
        </div>
        <div className="project-workspace__header-actions">
          <Button onClick={() => setDialog({ type: 'project' })}>编辑项目</Button>
          <Button theme="solid" type="primary" icon={<IconPlus />} aria-label="新建工作项" onClick={() => setDialog({ type: 'task' })}>新建工作项</Button>
          <Button type="danger" onClick={() => Modal.confirm({ title: '删除项目？', content: '项目将从工作区归档，关联记录不会被物理删除。', okText: '确认删除', cancelText: '取消', okButtonProps: { type: 'danger' }, onOk: async () => { await archiveProject(project.id); toast.success('项目已删除'); void navigate(ROUTES.PROJECT_SPACES) } })}>删除项目</Button>
        </div>
      </header>

      <div className="project-workspace__tabs" aria-label="项目空间页签" role="tablist">
        {SECTIONS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={section === item.key}
            onClick={() => {
              void navigate(ROUTES.projectWorkspace(project.id, item.key))
            }}
          >
            {item.label}
            {item.key === 'progress' && pendingDraftCount > 0 ? (
              <span className="project-workspace__tab-badge">{pendingDraftCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      <section className="project-workspace__content" aria-label="项目内容">
        <ProjectSectionContent
          section={section}
          project={project}
          canPublish={canPublish}
          onCreateProgress={() => setDialog({ type: 'progress' })}
          onCreateTask={() => setDialog({ type: 'task' })}
          onEditProject={() => setDialog({ type: 'project' })}
          onCreateMilestone={() => setDialog({ type: 'milestone' })}
          onEditMilestone={(milestone) => setDialog({ type: 'milestone', milestone })}
          onDeleteMilestone={(milestone) => confirmDelete('删除里程碑？', `“${milestone.name}”将被删除，关联工作项会保留。`, () => archiveMilestone(project.id, milestone.id))}
          onEditTask={(task) => setDialog({ type: 'task', task })}
          onDeleteTask={(task) => confirmDelete('删除工作项？', `“${task.title}”将从当前项目归档。`, () => archiveTask(task.id))}
          onEditProgress={(report) => setDialog({ type: 'progress', report })}
          onDeleteProgress={(report) => confirmDelete('删除进展记录？', `“${report.summary}”将被永久删除。`, () => archiveProgressReport(project.id, report.id))}
          focusedFileId={focusedFileId}
        />
      </section>

      {dialog ? <Modal
        title={dialog?.type === 'project' ? '编辑项目' : dialog?.type === 'task' ? (dialog.task ? '编辑工作项' : '新建项目工作项') : dialog?.type === 'progress' ? (dialog.report ? '编辑项目进展' : '提交项目进展') : dialog?.type === 'milestone' ? (dialog.milestone ? '编辑里程碑' : '新建里程碑') : ''}
        visible
        onCancel={() => setDialog(null)}
        footer={null}
        width={dialog?.type === 'project' ? 720 : 560}
      >
        {dialog?.type === 'project' ? <ProjectDetailsForm project={project} onSuccess={() => setDialog(null)} /> : null}
        {dialog?.type === 'task' ? (
          <TaskForm projectId={project.id} task={dialog.task} onSuccess={() => setDialog(null)} />
        ) : null}
        {dialog?.type === 'progress' ? (
          <ProgressReportForm projectId={project.id} report={dialog.report} milestones={project.milestones} onSuccess={() => setDialog(null)} />
        ) : null}
        {dialog?.type === 'milestone' ? <MilestoneForm projectId={project.id} milestone={dialog.milestone} onSuccess={() => setDialog(null)} /> : null}
      </Modal> : null}
    </div>
  )
}
