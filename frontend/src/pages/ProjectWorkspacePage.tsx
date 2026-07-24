import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Banner, Button, Modal, Progress, Skeleton, Tag } from '@douyinfe/semi-ui'
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
  getProject,
} from '@/modules/workbench/api/projects'
import { listMeetings, listPartners, listRisks } from '@/modules/workbench/api/management'
import { archiveTask } from '@/modules/workbench/api/tasks'
import { listNonProjectRd } from '@/modules/workbench/api/operations'
import { request } from '@/lib/http'
import { getProjectTeamProgress } from '@/modules/employees/api'
import { defaultPeriodStart } from '@/modules/employees/periods'
import { employeeQueryKeys } from '@/modules/employees/queryKeys'
import type {
  MilestoneStatus,
  ProjectDetail,
  ProjectHealth,
  ProjectStatus,
  Milestone,
  ProgressReport,
  TaskStatus,
  WorkTask,
} from '@/modules/workbench/types'
import { ROUTES } from '@/constants/routes'
import { ProgressReportForm } from '@/modules/workbench/components/ProgressReportForm'
import { TaskForm } from '@/modules/workbench/components/TaskForm'
import { MilestoneForm } from '@/modules/workbench/components/MilestoneForm'
import { ProjectDetailsForm } from '@/modules/workbench/components/ProjectDetailsForm'
import { FileAttachments } from '@/modules/content/components/FileAttachments'
import { toast } from 'sonner'
import './ProjectWorkspacePage.less'

const SECTIONS = [
  { key: 'overview', label: '概览' },
  { key: 'work-items', label: '工作项' },
  { key: 'progress', label: '进展' },
  { key: 'risks', label: '风险与问题' },
  { key: 'meetings', label: '会议' },
  { key: 'docs', label: '文档与资料' },
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

const MILESTONE_LABELS: Record<MilestoneStatus, string> = {
  PENDING: '待开始',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成',
  MISSED: '已逾期',
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
  const latestProgress = project.progressReports[0]
  const health = project.effectiveHealth ?? project.healthOverride ?? project.latestHealthSnapshot?.health
  const completedMilestones = project.milestones.filter((item) => item.status === 'COMPLETED').length
  const milestonePercent = project.milestones.length
    ? Math.round((completedMilestones / project.milestones.length) * 100)
    : 0

  return (
    <div className="project-workspace__overview">
      <section className="project-workspace__metrics" aria-label="项目摘要">
        <div>
          <span>当前进度</span>
          <strong>{latestProgress?.completionPercent ?? 0}%</strong>
          <Progress percent={latestProgress?.completionPercent ?? 0} showInfo={false} />
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
          <div className="project-workspace__milestone-progress">
            <Progress percent={milestonePercent} showInfo={false} aria-label="里程碑完成进度" />
          </div>
          {project.milestones.length ? (
            <ul className="project-workspace__list project-workspace__milestones">
              {project.milestones.map((milestone) => (
                <li key={milestone.id}>
                  <span className={`project-workspace__dot project-workspace__dot--${milestone.status.toLowerCase()}`} />
                  <div><strong>{milestone.name}</strong><span>{formatDate(milestone.plannedAt)}</span></div>
                  <Tag size="small" color={milestone.status === 'COMPLETED' ? 'blue' : milestone.status === 'IN_PROGRESS' ? 'green' : milestone.status === 'MISSED' ? 'red' : 'grey'}>{MILESTONE_LABELS[milestone.status]}</Tag>
                  <div className="project-workspace__row-actions">
                    <Button size="small" theme="borderless" onClick={() => onEditMilestone(milestone)}>编辑</Button>
                    <Button size="small" theme="borderless" type="danger" onClick={() => onDeleteMilestone(milestone)}>删除</Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="project-workspace__muted">尚未创建里程碑。</p>}
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
  return project.tasks.length ? (
    <section className="project-workspace__panel project-workspace__panel--section">
      <header><div><h2>全部工作项</h2><span>{project.tasks.length}</span></div><Button size="small" theme="borderless" icon={<IconPlus />} aria-label="新建工作项" onClick={onCreate}>新建工作项</Button></header>
      <ul className="project-workspace__task-list">
        {project.tasks.map((task) => (
          <li key={task.id}>
            <span className={`project-workspace__priority project-workspace__priority--${task.priority.toLowerCase()}`} />
            <div className="project-workspace__task-title"><strong>{task.title}</strong><Progress percent={task.completionPercent ?? 0} showInfo={false} aria-label={`${task.title}完成进度`} /></div>
            <span>{task.assigneeName || '未指定负责人'}</span>
            <time>{formatDate(task.dueAt)}</time>
            <span className="project-workspace__task-percent">{task.completionPercent ?? 0}%</span>
            <Tag size="small" color={task.status === 'DONE' ? 'blue' : task.status === 'IN_PROGRESS' ? 'green' : task.status === 'BLOCKED' ? 'red' : 'grey'}>{TASK_LABELS[task.status]}</Tag>
            <div className="project-workspace__row-actions"><Button size="small" theme="borderless" onClick={() => onEdit(task)}>编辑</Button><Button size="small" theme="borderless" type="danger" onClick={() => onDelete(task)}>删除</Button></div>
          </li>
        ))}
      </ul>
    </section>
  ) : (
    <EmptySection title="还没有工作项" description="为这个项目创建第一个可执行任务。" action={<Button onClick={onCreate}>新建任务</Button>} />
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
            <div className="project-workspace__row-actions"><Button size="small" theme="borderless" onClick={() => onEdit(report)}>编辑</Button><Button size="small" theme="borderless" type="danger" onClick={() => onDelete(report)}>删除</Button></div>
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
        <Link to={`${ROUTES.DOCS}?projectId=${project.id}&create=document`}>新建文档</Link>
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
  )
}

function ProjectSectionContent({
  section,
  project,
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
          </button>
        ))}
      </div>

      <section className="project-workspace__content" aria-label="项目内容">
        <ProjectSectionContent
          section={section}
          project={project}
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
          <ProgressReportForm projectId={project.id} report={dialog.report} onSuccess={() => setDialog(null)} />
        ) : null}
        {dialog?.type === 'milestone' ? <MilestoneForm projectId={project.id} milestone={dialog.milestone} onSuccess={() => setDialog(null)} /> : null}
      </Modal> : null}
    </div>
  )
}
