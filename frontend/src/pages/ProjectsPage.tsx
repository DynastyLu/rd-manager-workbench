import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Banner, Button, Empty, Input, Modal, Select, Table, Tag } from '@douyinfe/semi-ui'
import { IconPlus, IconSearch } from '@douyinfe/semi-icons'
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table/interface'
import { Link } from 'react-router-dom'
import { ProjectForm } from '@/modules/workbench/components/ProjectForm'
import { listProjects } from '@/modules/workbench/api/projects'
import type { Project, ProjectHealth, ProjectStatus } from '@/modules/workbench/types'
import { ROUTES } from '@/constants/routes'
import './ProjectsPage.less'

const STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string }> = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'ACTIVE', label: '进行中' },
  { value: 'ON_HOLD', label: '已暂停' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
]

const STATUS_COLORS: Record<ProjectStatus, 'blue' | 'green' | 'amber' | 'grey' | 'red'> = {
  DRAFT: 'grey',
  ACTIVE: 'blue',
  ON_HOLD: 'amber',
  COMPLETED: 'green',
  CANCELLED: 'red',
}

const HEALTH_META: Record<ProjectHealth, { label: string; className: string }> = {
  GREEN: { label: '正常', className: 'project-health project-health--green' },
  YELLOW: { label: '关注', className: 'project-health project-health--yellow' },
  RED: { label: '风险', className: 'project-health project-health--red' },
}

type ProjectView = 'all' | 'recent'

const PROJECT_PAGE_SIZE = 20
const RECENT_PROJECT_LIMIT = 8

function projectStatusLabel(status: ProjectStatus) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
}

function getRecentProjectIds(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem('rd-workbench:recent-projects') ?? '[]')
    if (!Array.isArray(stored)) return []

    return [
      ...new Set(stored.filter((id): id is string => typeof id === 'string' && id.length > 0)),
    ].slice(0, RECENT_PROJECT_LIMIT)
  } catch {
    return []
  }
}

function rememberProject(id: string) {
  const next = [id, ...getRecentProjectIds().filter((item) => item !== id)].slice(0, 8)
  localStorage.setItem('rd-workbench:recent-projects', JSON.stringify(next))
}

export default function ProjectsPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ProjectStatus | undefined>()
  const [view, setView] = useState<ProjectView>('all')
  const [page, setPage] = useState(1)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const recentProjectIds = useMemo(() => (view === 'recent' ? getRecentProjectIds() : []), [view])
  const projectsQuery = useQuery({
    queryKey: ['projects', { page, pageSize: PROJECT_PAGE_SIZE, search, status }],
    queryFn: () =>
      listProjects({
        page,
        pageSize: PROJECT_PAGE_SIZE,
        search: search || undefined,
        status,
      }),
    enabled: view === 'all',
  })
  const recentProjectsQuery = useQuery({
    queryKey: ['projects', 'recent', { ids: recentProjectIds, search, status }],
    queryFn: () => {
      if (recentProjectIds.length === 0) {
        return Promise.resolve({
          data: [],
          meta: { page: 1, pageSize: RECENT_PROJECT_LIMIT, total: 0 },
        })
      }

      return listProjects({
        ids: recentProjectIds,
        page: 1,
        pageSize: RECENT_PROJECT_LIMIT,
        search: search || undefined,
        status,
      })
    },
    enabled: view === 'recent',
  })
  const activeQuery = view === 'recent' ? recentProjectsQuery : projectsQuery

  const projects = useMemo(() => {
    const all = activeQuery.data?.data ?? []
    if (view === 'all') return all
    return recentProjectIds.flatMap((id) => {
      const project = all.find((item) => item.id === id)
      return project ? [project] : []
    })
  }, [activeQuery.data, recentProjectIds, view])

  const columns: ColumnProps<Project>[] = [
    {
      title: '项目',
      dataIndex: 'name',
      width: 320,
      render: (_value, project) => (
        <div className="project-name-cell">
          <span className="project-name-cell__mark">{project.name.slice(0, 1)}</span>
          <div>
            <Link
              to={ROUTES.projectWorkspace(project.id)}
              onClick={() => rememberProject(project.id)}
              aria-label={`打开项目空间：${project.name}`}
            >
              {project.name}
            </Link>
            <span>{project.code}</span>
          </div>
        </div>
      ),
    },
    {
      title: '负责人',
      dataIndex: 'leadName',
      width: 140,
      render: (value: string | null) => value || '未指定',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 130,
      render: (value: ProjectStatus) => (
        <Tag color={STATUS_COLORS[value]}>{projectStatusLabel(value)}</Tag>
      ),
    },
    {
      title: '健康度',
      dataIndex: 'health',
      width: 120,
      render: (value: ProjectHealth | null | undefined) => {
        if (!value) return <span className="project-health">未评估</span>
        const meta = HEALTH_META[value]
        return <span className={meta.className}>{meta.label}</span>
      },
    },
    {
      title: '计划结束',
      dataIndex: 'plannedEndAt',
      width: 140,
      render: (value: string | null) =>
        value ? new Date(value).toLocaleDateString('zh-CN') : '未设置',
    },
  ]

  return (
    <div className="projects-page">
      <header className="projects-page__header">
        <div>
          <h1>项目</h1>
          <p>围绕目标、工作项、会议和资料推进研发工作。</p>
        </div>
        <Button
          theme="solid"
          type="primary"
          icon={<IconPlus />}
          aria-label="新建项目"
          onClick={() => setIsCreateOpen(true)}
        >
          新建项目
        </Button>
      </header>

      <section className="projects-page__surface" aria-label="项目目录">
        <div className="projects-page__tabs" role="tablist" aria-label="项目视图">
          <button
            id="projects-tab-recent"
            type="button"
            role="tab"
            aria-controls="projects-view-panel"
            aria-selected={view === 'recent'}
            tabIndex={view === 'recent' ? 0 : -1}
            onClick={() => setView('recent')}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault()
                setView('all')
                document.getElementById('projects-tab-all')?.focus()
              }
            }}
          >
            最近访问
          </button>
          <button
            id="projects-tab-all"
            type="button"
            role="tab"
            aria-controls="projects-view-panel"
            aria-selected={view === 'all'}
            tabIndex={view === 'all' ? 0 : -1}
            onClick={() => setView('all')}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault()
                setView('recent')
                document.getElementById('projects-tab-recent')?.focus()
              }
            }}
          >
            全部项目
          </button>
        </div>

        <div
          id="projects-view-panel"
          role="tabpanel"
          aria-labelledby={view === 'recent' ? 'projects-tab-recent' : 'projects-tab-all'}
        >
          <div className="projects-page__toolbar">
          <Input
            aria-label="搜索项目"
            prefix={<IconSearch />}
            placeholder="搜索项目名称或编号"
            value={search}
            onChange={(value) => {
              setSearch(value)
              setPage(1)
            }}
            showClear
          />
          <span id="project-status-label" className="projects-page__sr-only">
            项目状态
          </span>
          <Select
            aria-labelledby="project-status-label"
            value={status ?? 'ALL'}
            onChange={(value) => {
              setStatus(value === 'ALL' ? undefined : (value as ProjectStatus))
              setPage(1)
            }}
            optionList={[
              { value: 'ALL', label: '全部状态' },
              ...STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
            ]}
          />
          </div>

          {activeQuery.isError ? (
          <Banner
            type="danger"
            fullMode={false}
            title="无法读取项目列表"
            description="请确认本地服务已启动后重试。"
            closeIcon={null}
          >
            <Button onClick={() => void activeQuery.refetch()}>重试</Button>
          </Banner>
          ) : null}

          {!activeQuery.isError ? (
          <Table<Project>
            className="projects-page__table"
            rowKey="id"
            size="middle"
            pagination={
              view === 'all'
                ? {
                    currentPage: page,
                    pageSize: PROJECT_PAGE_SIZE,
                    total: projectsQuery.data?.meta.total ?? 0,
                    showTotal: true,
                    showSizeChanger: false,
                    onPageChange: setPage,
                  }
                : false
            }
            loading={activeQuery.isPending}
            columns={columns}
            dataSource={projects}
            empty={
              <Empty
                title={
                  view === 'recent' ? '还没有最近访问的项目。' : '还没有项目，先新建一个项目吧。'
                }
                description={view === 'recent' ? '打开一个项目后，它会出现在这里。' : undefined}
              />
            }
          />
          ) : null}
        </div>
      </section>

      <Modal
        title="新建项目"
        visible={isCreateOpen}
        onCancel={() => setIsCreateOpen(false)}
        footer={null}
        closeOnEsc
        width={520}
      >
        <p className="projects-page__modal-copy">
          先填写项目编号和名称，创建后进入项目空间继续完善。
        </p>
        <ProjectForm onSuccess={() => setIsCreateOpen(false)} />
      </Modal>
    </div>
  )
}
