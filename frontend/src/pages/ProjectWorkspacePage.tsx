import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Banner, Button, Modal, Progress, Skeleton, Tag } from '@douyinfe/semi-ui'
import {
  IconCalendarStroked,
  IconChevronLeft,
  IconFolderStroked,
  IconPlus,
} from '@douyinfe/semi-icons'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getProject } from '@/modules/workbench/api/projects'
import { listMeetings } from '@/modules/workbench/api/management'
import { request } from '@/lib/http'
import type {
  MilestoneStatus,
  ProjectDetail,
  ProjectHealth,
  ProjectStatus,
  TaskStatus,
} from '@/modules/workbench/types'
import { ROUTES } from '@/constants/routes'
import { ProgressReportForm } from '@/modules/workbench/components/ProgressReportForm'
import { TaskForm } from '@/modules/workbench/components/TaskForm'
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
  CANCELLED: '已取消',
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

function OverviewSection({ project }: { project: ProjectDetail }) {
  const openTasks = project.tasks.filter(
    (task) => task.status !== 'DONE' && task.status !== 'CANCELLED'
  )
  const latestProgress = project.progressReports[0]
  const health = project.latestHealthSnapshot?.health

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
          <small>根据任务与里程碑计算</small>
        </div>
      </section>

      <div className="project-workspace__overview-grid">
        <section className="project-workspace__panel">
          <header>
            <h2>项目目标</h2>
          </header>
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

        <section className="project-workspace__panel">
          <header><h2>里程碑</h2><span>{project.milestones.length}</span></header>
          {project.milestones.length ? (
            <ul className="project-workspace__list">
              {project.milestones.slice(0, 4).map((milestone) => (
                <li key={milestone.id}>
                  <span className={`project-workspace__dot project-workspace__dot--${milestone.status.toLowerCase()}`} />
                  <div><strong>{milestone.name}</strong><span>{formatDate(milestone.plannedAt)}</span></div>
                  <Tag size="small">{MILESTONE_LABELS[milestone.status]}</Tag>
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
      </div>
    </div>
  )
}

function WorkItemsSection({
  project,
  onCreate,
}: {
  project: ProjectDetail
  onCreate: () => void
}) {
  return project.tasks.length ? (
    <section className="project-workspace__panel project-workspace__panel--section">
      <header><h2>全部工作项</h2><span>{project.tasks.length}</span></header>
      <ul className="project-workspace__task-list">
        {project.tasks.map((task) => (
          <li key={task.id}>
            <span className={`project-workspace__priority project-workspace__priority--${task.priority.toLowerCase()}`} />
            <strong>{task.title}</strong>
            <span>{task.assigneeName || '未指定负责人'}</span>
            <time>{formatDate(task.dueAt)}</time>
            <Tag size="small">{TASK_LABELS[task.status]}</Tag>
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
}: {
  project: ProjectDetail
  onCreate: () => void
}) {
  return project.progressReports.length ? (
    <section className="project-workspace__panel project-workspace__panel--section">
      <header><h2>进展记录</h2><span>{project.progressReports.length}</span></header>
      <ol className="project-workspace__timeline">
        {project.progressReports.map((report) => (
          <li key={report.id}>
            <span>{report.completionPercent}%</span>
            <div><strong>{report.summary}</strong><time>{formatDate(report.reportedAt)}</time>{report.blockers ? <p>阻塞：{report.blockers}</p> : null}</div>
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

function ProjectDocumentsSection({ project }: { project: ProjectDetail }) {
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
    </section>
  )
}

function ProjectSectionContent({
  section,
  project,
  onCreateProgress,
  onCreateTask,
}: {
  section: ProjectSection
  project: ProjectDetail
  onCreateProgress: () => void
  onCreateTask: () => void
}) {
  if (section === 'work-items') return <WorkItemsSection project={project} onCreate={onCreateTask} />
  if (section === 'progress') return <ProgressSection project={project} onCreate={onCreateProgress} />
  if (section === 'risks') {
    return <EmptySection title="集中管理风险、问题与决策" description="现有风险、问题和决策记录将按当前项目筛选。" action={<Link to={`${ROUTES.governance('risks')}?projectId=${project.id}`}>打开风险与问题</Link>} />
  }
  if (section === 'meetings') {
    return <ProjectMeetingsSection project={project} />
  }
  if (section === 'docs') {
    return <ProjectDocumentsSection project={project} />
  }
  return <OverviewSection project={project} />
}

export default function ProjectWorkspacePage() {
  const { projectId = '', section: requestedSection = 'overview' } = useParams<{
    projectId: string
    section: string
  }>()
  const navigate = useNavigate()
  const [createTarget, setCreateTarget] = useState<'task' | 'progress' | null>(null)
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
  const health = project.latestHealthSnapshot?.health

  return (
    <div className="project-workspace">
      <div className="project-workspace__back-row">
        <Link to={ROUTES.PROJECT_SPACES}><IconChevronLeft /> 返回项目列表</Link>
      </div>
      <header className="project-workspace__header">
        <div className="project-workspace__project-mark">{project.name.slice(0, 1)}</div>
        <div className="project-workspace__heading">
          <div><h1>{project.name}</h1><Tag color="blue">{STATUS_LABELS[project.status]}</Tag>{health ? <Tag color={health === 'GREEN' ? 'green' : health === 'YELLOW' ? 'amber' : 'red'}>{HEALTH_LABELS[health]}</Tag> : null}</div>
          <p><span>{project.code}</span><span>负责人：{project.leadName || '未指定'}</span><span>{formatDate(project.plannedStartAt)} — {formatDate(project.plannedEndAt)}</span></p>
        </div>
        <Button
          theme="solid"
          type="primary"
          icon={<IconPlus />}
          aria-label="新建工作项"
          onClick={() => setCreateTarget('task')}
        >
          新建工作项
        </Button>
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
          onCreateProgress={() => setCreateTarget('progress')}
          onCreateTask={() => setCreateTarget('task')}
        />
      </section>

      <Modal
        title={createTarget === 'progress' ? '提交项目进展' : '新建项目工作项'}
        visible={createTarget !== null}
        onCancel={() => setCreateTarget(null)}
        footer={null}
        width={520}
      >
        {createTarget === 'task' ? (
          <TaskForm projectId={project.id} onSuccess={() => setCreateTarget(null)} />
        ) : null}
        {createTarget === 'progress' ? (
          <ProgressReportForm projectId={project.id} onSuccess={() => setCreateTarget(null)} />
        ) : null}
      </Modal>
    </div>
  )
}
