import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Modal } from '@douyinfe/semi-ui'
import ProjectWorkspacePage from '../ProjectWorkspacePage'

const {
  archiveMilestone,
  archiveProgressReport,
  archiveProject,
  archiveTask,
  createMilestone,
  createProgressReport,
  createTask,
  getProject,
  listMeetings,
  listNonProjectRd,
  listPartners,
  listRisks,
  request,
  updateMilestone,
  updateProgressReport,
  updateProject,
  updateTask,
} = vi.hoisted(() => ({
  archiveMilestone: vi.fn(),
  archiveProgressReport: vi.fn(),
  archiveProject: vi.fn(),
  archiveTask: vi.fn(),
  createMilestone: vi.fn(),
  createProgressReport: vi.fn(),
  createTask: vi.fn(),
  getProject: vi.fn(),
  listMeetings: vi.fn(),
  listNonProjectRd: vi.fn(),
  listPartners: vi.fn(),
  listRisks: vi.fn(),
  request: vi.fn(),
  updateMilestone: vi.fn(),
  updateProgressReport: vi.fn(),
  updateProject: vi.fn(),
  updateTask: vi.fn(),
}))

vi.mock('@/modules/workbench/api/projects', () => ({ archiveMilestone, archiveProgressReport, archiveProject, createMilestone, createProgressReport, getProject, updateMilestone, updateProgressReport, updateProject }))
vi.mock('@/modules/workbench/api/tasks', () => ({ archiveTask, createTask, updateTask }))
vi.mock('@/modules/workbench/api/management', () => ({ listMeetings, listPartners, listRisks }))
vi.mock('@/modules/workbench/api/operations', () => ({ listNonProjectRd }))
vi.mock('@/lib/http', () => ({ request }))

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

const teamProgressFixture = {
  project: { id: 'project-1', code: 'RD-001', name: '耐盐材料筛选', status: 'ACTIVE' },
  period: { type: 'WEEK', start: '2026-07-20', end: '2026-07-26' },
  metrics: {
    workItemCount: 2,
    completedCount: 1,
    completionRate: 50,
    averageCompletionRate: 75,
    plannedHours: 20,
    actualHours: 18,
    riskCount: 1,
    blockedCount: 0,
    projectCount: 1,
    unlinkedCount: 0,
    dataComplete: true,
    missingWeeks: [],
  },
  sourceBatchIds: ['batch-1'],
  employees: {
    data: [
      {
        employeeId: 'employee-1',
        displayName: '张明',
        department: '研发一组',
        metrics: {
          workItemCount: 2,
          completedCount: 1,
          completionRate: 50,
          averageCompletionRate: 75,
          plannedHours: 20,
          actualHours: 18,
          riskCount: 1,
          blockedCount: 0,
          projectCount: 1,
          unlinkedCount: 0,
          dataComplete: true,
          missingWeeks: [],
        },
        completedItems: {
          data: [{ workItemId: 'work-1', title: '完成权限模型设计' }],
          total: 1,
          limit: 5,
          hasMore: false,
        },
        nextPlans: {
          data: [{ workItemId: 'work-1', text: '联调准备' }],
          total: 1,
          limit: 5,
          hasMore: false,
        },
        risks: {
          data: [{ workItemId: 'work-2', text: '依赖方接口未冻结' }],
          total: 1,
          limit: 5,
          hasMore: false,
        },
        sourceBatchIds: ['batch-1'],
        employeeProgressUrl: '/employees/employee-1/progress?periodType=WEEK&periodStart=2026-07-20',
        workItemsUrl: '/employee-work-items?periodType=WEEK&periodStart=2026-07-20',
      },
    ],
    total: 1,
    limit: 10,
    hasMore: false,
  },
  risks: { data: [], total: 0, limit: 10, hasMore: false },
  links: { workItemsUrl: '/employee-work-items?periodType=WEEK&periodStart=2026-07-20' },
}

const projectWorkItemsFixture = {
  period: { type: 'WEEK', start: '2026-07-20', end: '2026-07-26' },
  data: [
    {
      id: 'work-1',
      employeeId: 'employee-1',
      employeeName: '张明',
      department: '研发一组',
      workDirection: '耐盐材料',
      importBatchId: 'batch-1',
      importVersion: 2,
      sourceRowId: 'row-1',
      sourceRowNumber: 7,
      sourceBatchIds: ['batch-1'],
      periodStart: '2026-07-20',
      periodEnd: '2026-07-26',
      title: '完成权限模型设计',
      workKind: 'PROJECT',
      classificationState: 'CLASSIFIED',
      plannedCompletionDate: '2026-07-25',
      overdue: false,
      source: {
        sheetName: '张明',
        section: 'CURRENT_WORK',
        rowNumber: 7,
        key: '张明:CURRENT_WORK:7',
        label: '张明 / 本周工作 / 第 7 行',
      },
      planText: null,
      summaryText: '完成设计评审',
      completionRate: 100,
      status: 'COMPLETED',
      nextPlanText: null,
      riskText: null,
      plannedHours: 12,
      actualHours: 10,
      project: { id: 'project-1', code: 'RD-001', name: '耐盐材料筛选' },
      task: null,
      riskId: null,
      note: null,
      links: {
        selfUrl: '/employee-work-items/work-1',
        employeeProgressUrl: '/employees/employee-1/progress',
        projectProgressUrl: '/projects/project-1/team-progress',
        sourceBatchUrl: '/employee-work-imports/batch-1',
      },
    },
  ],
  meta: { page: 1, pageSize: 20, total: 1 },
  sourceBatchIds: ['batch-1'],
  links: { progressUrl: '/projects/project-1/team-progress' },
}

const projectWeekPlansFixture = {
  period: { type: 'WEEK', start: '2026-07-27', end: '2026-08-02' },
  data: [
    {
      id: 'plan-1',
      employeeId: 'employee-1',
      employeeName: '张明',
      department: '研发一组',
      workDirection: '耐盐材料',
      importBatchId: 'batch-1',
      importVersion: 2,
      sourceRowId: 'row-plan-1',
      sourceBatchIds: ['batch-1'],
      periodStart: '2026-07-27',
      periodEnd: '2026-08-02',
      title: '安排耐盐实验复测',
      deliverableText: '复测记录',
      plannedCompletionDate: '2026-07-31',
      priority: 'HIGH',
      collaborationText: '需要实验室协作',
      planText: null,
      note: null,
      workKind: 'PROJECT',
      carryStatus: 'PLANNED',
      matchedWorkItemId: null,
      cancelReason: null,
      project: { id: 'project-1', code: 'RD-001', name: '耐盐材料筛选' },
      task: null,
      source: {
        sheetName: '张明',
        section: 'NEXT_WEEK_PLAN',
        rowNumber: 21,
        key: '张明:NEXT_WEEK_PLAN:21',
        label: '张明 / 下周计划 / 第 21 行',
      },
      links: {
        selfUrl: '/employee-week-plans/plan-1',
        employeeProgressUrl: '/employees/employee-1/progress',
        projectProgressUrl: '/projects/project-1/team-progress',
        sourceBatchUrl: '/employee-work-imports/batch-1',
      },
    },
  ],
  meta: { page: 1, pageSize: 20, total: 1 },
  sourceBatchIds: ['batch-1'],
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
  healthOverride: null,
  archivedAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
  milestones: [
    {
      id: 'milestone-1',
      projectId: 'project-1',
      name: '完成初筛',
      plannedAt: '2026-08-01T00:00:00.000Z',
      plannedStartAt: '2026-07-01T00:00:00.000Z',
      plannedEndAt: '2026-08-01T00:00:00.000Z',
      actualAt: null,
      ownerName: '张工',
      isCritical: true,
      status: 'IN_PROGRESS',
      weightPercent: null,
      manualCompletionPercent: null,
      completionPercent: 68,
      completionSource: 'TASKS',
      effectiveWeightPercent: 100,
      linkedTaskCount: 1,
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
      completionPercent: 45,
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
      previousPercent: null,
      sourceType: 'MANUAL',
      milestoneId: null,
      taskId: null,
      blockers: null,
      completedResults: null,
      nextSteps: null,
      changeSnapshot: null,
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
  effectiveHealth: 'YELLOW',
  progressSummary: {
    actualPercent: 56,
    timePercent: 64,
    variancePercent: -8,
    scheduleState: 'BEHIND',
    weightMode: 'EQUAL',
    currentMilestoneId: 'milestone-1',
  },
} as const

describe('ProjectWorkspacePage', () => {
  beforeEach(() => {
    archiveMilestone.mockReset()
    archiveProgressReport.mockReset()
    archiveProject.mockReset()
    archiveTask.mockReset()
    createMilestone.mockReset()
    createProgressReport.mockReset()
    createTask.mockReset()
    getProject.mockReset()
    listMeetings.mockReset()
    listNonProjectRd.mockReset()
    listPartners.mockReset()
    listRisks.mockReset()
    request.mockReset()
    updateMilestone.mockReset()
    updateProgressReport.mockReset()
    updateProject.mockReset()
    updateTask.mockReset()
    getProject.mockResolvedValue(project)
    listMeetings.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 6, total: 0 } })
    listNonProjectRd.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 6, total: 0 } })
    listPartners.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 6, total: 0 } })
    listRisks.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 100, total: 0 } })
    request.mockImplementation((url: string) => {
      if (typeof url !== 'string') {
        return Promise.resolve({ data: [], meta: { page: 1, pageSize: 6, total: 0 } })
      }
      if (url.includes('team-progress')) return Promise.resolve(teamProgressFixture)
      if (url.startsWith('/employee-work-items?')) return Promise.resolve(projectWorkItemsFixture)
      if (url.startsWith('/employee-week-plans?')) return Promise.resolve(projectWeekPlansFixture)
      return Promise.resolve({ data: [], meta: { page: 1, pageSize: 6, total: 0 } })
    })
    updateProject.mockResolvedValue(project)
    updateTask.mockResolvedValue(project.tasks[0])
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
    expect(screen.getByText('已完成样本准备')).toBeInTheDocument()
    expect(screen.getByText('2026/7/18')).toBeInTheDocument()
    expect(document.querySelector('.project-workspace__status')).toHaveClass('project-workspace__status--active')
  })

  it('shows calculated actual, elapsed time, variance, and milestone progress', async () => {
    renderWorkspace()

    expect((await screen.findAllByText('56%')).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('时间已过 64%')).toBeInTheDocument()
    expect(screen.getByText('滞后 8%')).toBeInTheDocument()
    expect(screen.getByText('68% · 权重 100%')).toBeInTheDocument()
    expect(screen.queryByText('35%', { selector: 'strong' })).not.toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: '提交进展' })).toBeInTheDocument()
  })

  it('shows a retry action when the project cannot be loaded', async () => {
    getProject.mockRejectedValue(new Error('offline'))
    renderWorkspace()

    expect(await screen.findByText('无法读取项目空间')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })

  it('creates a work item in the current project from the project header', async () => {
    createTask.mockResolvedValue({ id: 'task-2', projectId: 'project-1' })
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(await screen.findByRole('button', { name: '新建工作项' }))
    await user.type(screen.getByLabelText('任务名称'), '验证候选材料')
    await user.click(screen.getByRole('button', { name: '保存任务' }))

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith({
        title: '验证候选材料',
        projectId: 'project-1',
        completionPercent: 0,
      })
    })
  })

  it('submits a progress report to the current project', async () => {
    getProject.mockResolvedValue({ ...project, progressReports: [] })
    createProgressReport.mockResolvedValue({ id: 'progress-2', projectId: 'project-1' })
    const user = userEvent.setup()
    renderWorkspace('/spaces/projects/project-1/progress')

    await user.click(await screen.findByRole('button', { name: '提交进展' }))
    await user.type(screen.getByLabelText('进展摘要'), '已完成第二轮验证')
    await user.type(screen.getByLabelText('已完成成果（可选）'), '完成两轮实验')
    await user.type(screen.getByLabelText('下一步计划（可选）'), '准备项目评审')
    await user.click(screen.getByRole('button', { name: '保存进展' }))

    await waitFor(() => {
      expect(createProgressReport).toHaveBeenCalledWith('project-1', {
        summary: '已完成第二轮验证',
        completedResults: '完成两轮实验',
        nextSteps: '准备项目评审',
        reportedAt: expect.any(String),
      })
    })
  })

  it('shows the project meetings from the shared meeting data source', async () => {
    listMeetings.mockResolvedValue({
      data: [
        {
          id: 'meeting-1',
          title: '材料筛选周会',
          scheduledAt: '2026-07-21T02:00:00.000Z',
          status: 'PLANNED',
        },
      ],
      meta: { page: 1, pageSize: 6, total: 1 },
    })

    renderWorkspace('/spaces/projects/project-1/meetings')

    expect(await screen.findByText('材料筛选周会')).toBeInTheDocument()
    expect(listMeetings).toHaveBeenCalledWith({ projectId: 'project-1', pageSize: 6 })
    expect(screen.getByRole('link', { name: '打开会议：材料筛选周会' })).toHaveAttribute(
      'href',
      '/calendar?meetingId=meeting-1'
    )
  })

  it('edits the project objective and manual health from the project workspace', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await user.click(await screen.findByRole('button', { name: '编辑项目' }))
    await user.clear(screen.getByLabelText('项目目标'))
    await user.type(screen.getByLabelText('项目目标'), '完成耐盐材料量产验证')
    await user.click(screen.getByRole('button', { name: '保存项目' }))

    await waitFor(() => expect(updateProject).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        objective: '完成耐盐材料量产验证',
        status: 'ACTIVE',
        healthOverride: null,
      })
    ))
  })

  it('shows persisted work-item progress and archives a work item after confirmation', async () => {
    archiveTask.mockResolvedValue(undefined)
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockImplementation((options) => {
      void options.onOk?.()
      return { destroy: vi.fn(), update: vi.fn() }
    })
    const user = userEvent.setup()
    renderWorkspace('/spaces/projects/project-1/work-items')

    expect(await screen.findByLabelText('整理实验样本完成进度')).toBeInTheDocument()
    expect(screen.getByText('45%')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '删除' }))

    expect(confirmSpy).toHaveBeenCalledWith(expect.objectContaining({ title: '删除工作项？' }))
    await waitFor(() => expect(archiveTask).toHaveBeenCalledWith('task-1'))
  })

  it('uses distinct semantic colors for project risk levels', async () => {
    listRisks.mockResolvedValue({
      data: [
        { id: 'risk-low', title: '低风险', level: 'LOW', status: 'OPEN', ownerName: null },
        { id: 'risk-medium', title: '中风险', level: 'MEDIUM', status: 'MITIGATING', ownerName: null },
        { id: 'risk-high', title: '高风险', level: 'HIGH', status: 'OPEN', ownerName: null },
      ],
      meta: { page: 1, pageSize: 100, total: 3 },
    })
    renderWorkspace('/spaces/projects/project-1/risks')

    expect(await screen.findByText('低风险', { selector: '.semi-tag-content' })).toBeInTheDocument()
    expect(screen.getByText('中风险', { selector: '.semi-tag-content' })).toBeInTheDocument()
    expect(screen.getByText('高风险', { selector: '.semi-tag-content' })).toBeInTheDocument()
    expect(screen.getByText('低风险', { selector: '.semi-tag-content' }).closest('.semi-tag')).toHaveClass('semi-tag-green-light')
    expect(screen.getByText('中风险', { selector: '.semi-tag-content' }).closest('.semi-tag')).toHaveClass('semi-tag-amber-light')
    expect(screen.getByText('高风险', { selector: '.semi-tag-content' }).closest('.semi-tag')).toHaveClass('semi-tag-red-light')
  })

  it('shows project documents and opens the same document in the knowledge workspace', async () => {
    request.mockResolvedValue({
      data: [
        {
          id: 'document-1',
          title: '耐盐材料技术方案',
          type: 'DOCUMENT',
          updatedAt: '2026-07-18T08:00:00.000Z',
        },
      ],
      meta: { page: 1, pageSize: 6, total: 1 },
    })

    renderWorkspace('/spaces/projects/project-1/docs')

    expect(await screen.findByText('耐盐材料技术方案')).toBeInTheDocument()
    expect(request).toHaveBeenCalledWith('/documents?projectId=project-1&pageSize=6')
    expect(screen.getByRole('link', { name: '打开文档：耐盐材料技术方案' })).toHaveAttribute(
      'href',
      '/docs?documentId=document-1'
    )
  })

  it('shows associated partners in the project overview and opens the shared partner workspace', async () => {
    listPartners.mockResolvedValue({
      data: [
        {
          id: 'partner-1',
          name: '星海研究院',
          shortName: '星海',
          category: '高校',
          contactCount: 2,
          activeAgreementCount: 1,
          projectCount: 1,
          lastCommunicationAt: '2026-07-20T02:00:00.000Z',
          nextFollowUpAt: '2026-07-24T02:00:00.000Z',
        },
      ],
      meta: { page: 1, pageSize: 6, total: 1 },
    })

    renderWorkspace()

    expect(await screen.findByText('星海研究院')).toBeInTheDocument()
    expect(listPartners).toHaveBeenCalledWith({ projectId: 'project-1', pageSize: 6 })
    expect(screen.getByRole('link', { name: '打开合作方：星海研究院' })).toHaveAttribute(
      'href',
      '/library/governance/partners?recordId=partner-1&projectId=project-1',
    )
  })

  it('shows associated non-project R&D work in the project overview', async () => {
    listNonProjectRd.mockResolvedValue({
      data: [{ id: 'rd-1', code: 'NPR-001', title: '向量检索预研', status: 'IN_PROGRESS' }],
      meta: { page: 1, pageSize: 6, total: 1 },
    })

    renderWorkspace()

    expect(await screen.findByText('向量检索预研')).toBeInTheDocument()
    expect(listNonProjectRd).toHaveBeenCalledWith({ projectId: 'project-1', pageSize: 6 })
    expect(screen.getByRole('link', { name: '打开研发事项：向量检索预研' })).toHaveAttribute(
      'href',
      '/library/operations?tab=non-project-rd&recordId=rd-1&projectId=project-1',
    )
  })

  it('shows project team progress and links back to the employee period', async () => {
    renderWorkspace('/spaces/projects/project-1/progress')

    expect(await screen.findByRole('heading', { name: '团队进展' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '张明' })[0]).toHaveAttribute(
      'href',
      '/employees/employee-1?periodType=WEEK&periodStart=2026-07-20',
    )
    expect(screen.getAllByText('完成权限模型设计').length).toBeGreaterThan(0)
    expect(screen.getByText('联调准备')).toBeInTheDocument()
    expect(screen.getByText('依赖方接口未冻结')).toBeInTheDocument()
    expect(screen.getByText(/参与 1 人/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '打开团队概览' })
    ).toHaveAttribute('href', '/employees?tab=overview&periodType=WEEK&periodStart=2026-07-20')
    expect(screen.getByRole('heading', { name: '当前工作' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '未来计划' })).toBeInTheDocument()
    expect(await screen.findByText('安排耐盐实验复测')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '张明' }).length).toBeGreaterThan(1)
    expect(request).toHaveBeenCalledWith(
      '/employee-work-items?periodType=WEEK&periodStart=2026-07-20&projectId=project-1&page=1&pageSize=20'
    )
    expect(request).toHaveBeenCalledWith(
      '/employee-week-plans?periodType=WEEK&periodStart=2026-07-27&projectId=project-1&page=1&pageSize=20'
    )
  })

  it('fetches team progress only when the progress section is visible', async () => {
    renderWorkspace()

    await screen.findByRole('heading', { name: '耐盐材料筛选' })

    expect(request).not.toHaveBeenCalledWith(expect.stringContaining('team-progress'))
  })
})
