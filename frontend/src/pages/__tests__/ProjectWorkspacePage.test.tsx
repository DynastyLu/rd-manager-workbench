import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectWorkspacePage from '../ProjectWorkspacePage'

const { getProject } = vi.hoisted(() => ({ getProject: vi.fn() }))

vi.mock('@/modules/workbench/api/projects', () => ({ getProject }))

function CurrentPath() {
  return <output aria-label="当前项目路径">{useLocation().pathname}</output>
}

function renderWorkspace(path = '/spaces/projects/project-1/overview') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/spaces/projects/:projectId/:section?"
            element={
              <>
                <ProjectWorkspacePage />
                <CurrentPath />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const project = {
  id: 'project-1',
  code: 'RD-001',
  name: '耐盐材料筛选',
  type: '研发',
  researchDirection: '新材料',
  objective: '完成耐盐材料筛选与验证',
  expectedOutcome: '形成候选材料清单',
  leadName: '张工',
  participantNames: [],
  plannedStartAt: '2026-07-01T00:00:00.000Z',
  plannedEndAt: '2026-09-30T00:00:00.000Z',
  actualStartAt: null,
  actualEndAt: null,
  status: 'ACTIVE',
  phase: 'RESEARCH',
  archivedAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
  milestones: [
    {
      id: 'milestone-1',
      projectId: 'project-1',
      name: '完成初筛',
      plannedAt: '2026-08-01T00:00:00.000Z',
      actualAt: null,
      ownerName: '张工',
      isCritical: true,
      status: 'IN_PROGRESS',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    },
  ],
  tasks: [
    {
      id: 'task-1',
      projectId: 'project-1',
      milestoneId: 'milestone-1',
      parentId: null,
      title: '整理实验样本',
      description: null,
      assigneeName: '张工',
      collaboratorNames: [],
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      dueAt: '2026-07-25T00:00:00.000Z',
      completedAt: null,
      sourceType: null,
      sourceId: null,
      archivedAt: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
      dependencyIds: [],
    },
  ],
  progressReports: [
    {
      id: 'progress-1',
      projectId: 'project-1',
      summary: '已完成样本准备',
      completionPercent: 35,
      blockers: null,
      reportedAt: '2026-07-18T00:00:00.000Z',
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    },
  ],
  latestHealthSnapshot: {
    id: 'health-1',
    projectId: 'project-1',
    health: 'YELLOW',
    reasons: ['存在临近任务'],
    calculatedAt: '2026-07-18T00:00:00.000Z',
  },
} as const

describe('ProjectWorkspacePage', () => {
  beforeEach(() => {
    getProject.mockReset()
    getProject.mockResolvedValue(project)
  })

  it('renders the fixed project context and six connected sections', async () => {
    renderWorkspace()

    expect(await screen.findByRole('heading', { name: '耐盐材料筛选' })).toBeInTheDocument()
    expect(screen.getByText('RD-001')).toBeInTheDocument()
    expect(screen.getByText('完成耐盐材料筛选与验证')).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '概览',
      '工作项',
      '进展',
      '风险与问题',
      '会议',
      '文档与资料',
    ])
    expect(screen.getByText('完成初筛')).toBeInTheDocument()
    expect(screen.getByText('整理实验样本')).toBeInTheDocument()
  })

  it('updates the URL when the user changes project sections', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await screen.findByRole('heading', { name: '耐盐材料筛选' })
    await user.click(screen.getByRole('tab', { name: '进展' }))

    expect(screen.getByLabelText('当前项目路径')).toHaveTextContent(
      '/spaces/projects/project-1/progress'
    )
    expect(screen.getByText('已完成样本准备')).toBeInTheDocument()
  })

  it('shows a retry action when the project cannot be loaded', async () => {
    getProject.mockRejectedValue(new Error('offline'))
    renderWorkspace()

    expect(await screen.findByText('无法读取项目空间')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })
})
