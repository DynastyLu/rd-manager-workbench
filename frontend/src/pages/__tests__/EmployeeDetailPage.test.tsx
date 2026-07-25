import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { employeeQueryKeys } from '@/modules/employees/queryKeys'
import EmployeeDetailPage from '../EmployeeDetailPage'

const employeesApi = vi.hoisted(() => ({
  convertEmployeeWorkItemRisk: vi.fn(),
  getEmployeeProgress: vi.fn(),
  listEmployeeWorkItems: vi.fn(),
}))

vi.mock('@/modules/employees/api', () => employeesApi)

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname + location.search}</output>
}

function renderPage(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/employees/:employeeId"
              element={
                <>
                  <EmployeeDetailPage />
                  <LocationProbe />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  }
}

const metrics = {
  workItemCount: 3,
  completedCount: 1,
  completionRate: 33,
  averageCompletionRate: 88,
  plannedHours: 30,
  actualHours: 26,
  riskCount: 2,
  blockedCount: 0,
  projectCount: 1,
  unlinkedCount: 0,
  dataComplete: true,
  missingWeeks: [] as string[],
}

const workItemLinks = {
  selfUrl: '/employee-work-items/work-1',
  employeeProgressUrl: '/employees/employee-1/progress?periodType=WEEK&periodStart=2026-07-20',
  projectProgressUrl: '/projects/project-1/team-progress?periodType=WEEK&periodStart=2026-07-20',
  taskUrl: '/projects/project-1?taskId=task-1',
  sourceBatchUrl: '/employee-work-imports/batch-1',
}

const progressFixture = {
  employee: {
    id: 'employee-1',
    displayName: '张明',
    department: '研发一组',
    roleTitle: '高级研发工程师',
    managerName: '李工',
    employmentStatus: 'ACTIVE' as const,
    weeklyCapacityHours: 40,
  },
  period: { type: 'WEEK' as const, start: '2026-07-20', end: '2026-07-26' },
  metrics,
  sourceBatchIds: ['batch-1'],
  projects: {
    data: [
      {
        projectId: 'project-1',
        projectCode: 'RD-026',
        projectName: '权限平台',
        metrics,
        sourceBatchIds: ['batch-1'],
        projectProgressUrl: '/projects/project-1/team-progress?periodType=WEEK&periodStart=2026-07-20',
        workItemsUrl: '/employee-work-items?periodType=WEEK&periodStart=2026-07-20',
      },
    ],
    total: 1,
    limit: 10,
    hasMore: false,
  },
  risks: {
    data: [
      {
        id: 'work-1',
        title: '权限模型联调',
        employeeId: 'employee-1',
        employeeName: '张明',
        projectId: 'project-1',
        projectCode: 'RD-026',
        status: 'AT_RISK' as const,
        riskText: '依赖方接口未冻结',
        sourceBatchIds: ['batch-1'],
        links: workItemLinks,
      },
      {
        id: 'work-3',
        title: '缓存方案验证',
        employeeId: 'employee-1',
        employeeName: '张明',
        projectId: 'project-2',
        projectCode: 'RD-031',
        status: 'IN_PROGRESS' as const,
        riskText: '性能指标未达标',
        sourceBatchIds: ['batch-1'],
        links: workItemLinks,
      },
    ],
    total: 2,
    limit: 10,
    hasMore: false,
  },
  links: { workItemsUrl: '/employee-work-items?periodType=WEEK&periodStart=2026-07-20' },
}

const workItemsFixture = {
  period: { type: 'WEEK' as const, start: '2026-07-20', end: '2026-07-26' },
  data: [
    {
      id: 'work-1',
      employeeId: 'employee-1',
      employeeName: '张明',
      department: '研发一组',
      importBatchId: 'batch-1',
      importVersion: 2,
      sourceRowId: 'row-1',
      sourceRowNumber: 3,
      sourceBatchIds: ['batch-1'],
      periodStart: '2026-07-20',
      periodEnd: '2026-07-26',
      title: '权限模型联调',
      planText: '完成权限模型联调',
      summaryText: '整体进度 80%',
      completionRate: 80,
      status: 'AT_RISK' as const,
      nextPlanText: '联调准备',
      riskText: '依赖方接口未冻结',
      plannedHours: 16,
      actualHours: 14,
      project: { id: 'project-1', code: 'RD-026', name: '权限平台' },
      task: { id: 'task-1', code: 'RD-026-T01', title: '权限模型设计' },
      riskId: null,
      note: null,
      links: workItemLinks,
    },
    {
      id: 'work-2',
      employeeId: 'employee-1',
      employeeName: '张明',
      department: '研发一组',
      importBatchId: 'batch-1',
      importVersion: 2,
      sourceRowId: 'row-2',
      sourceRowNumber: 4,
      sourceBatchIds: ['batch-1'],
      periodStart: '2026-07-20',
      periodEnd: '2026-07-26',
      title: '周报整理',
      planText: null,
      summaryText: null,
      completionRate: 100,
      status: 'COMPLETED' as const,
      nextPlanText: null,
      riskText: null,
      plannedHours: 8,
      actualHours: 8,
      project: null,
      task: null,
      riskId: null,
      note: null,
      links: workItemLinks,
    },
    {
      id: 'work-3',
      employeeId: 'employee-1',
      employeeName: '张明',
      department: '研发一组',
      importBatchId: 'batch-1',
      importVersion: 2,
      sourceRowId: 'row-3',
      sourceRowNumber: 5,
      sourceBatchIds: ['batch-1'],
      periodStart: '2026-07-20',
      periodEnd: '2026-07-26',
      title: '缓存方案验证',
      planText: null,
      summaryText: null,
      completionRate: 40,
      status: 'IN_PROGRESS' as const,
      nextPlanText: '补充性能基准',
      riskText: '性能指标未达标',
      plannedHours: 6,
      actualHours: 4,
      project: { id: 'project-2', code: 'RD-031', name: '数据网关' },
      task: null,
      riskId: 'risk-9',
      note: null,
      links: workItemLinks,
    },
  ],
  meta: { page: 1, pageSize: 10, total: 3 },
  sourceBatchIds: ['batch-1'],
  links: { progressUrl: '/employee-progress?periodType=WEEK&periodStart=2026-07-20' },
}

function progressForPeriod(periodStart: string) {
  const trendValues: Record<string, number | null> = {
    '2026-07-13': 70,
    '2026-07-06': null,
    '2026-06-29': 60,
  }
  if (periodStart in trendValues) {
    return {
      ...progressFixture,
      period: { type: 'WEEK' as const, start: periodStart, end: periodStart },
      metrics: { ...metrics, averageCompletionRate: trendValues[periodStart] },
    }
  }
  return progressFixture
}

describe('EmployeeDetailPage', () => {
  beforeEach(() => {
    for (const mock of Object.values(employeesApi)) mock.mockReset()
    employeesApi.getEmployeeProgress.mockImplementation((_id: string, filters: { periodStart: string }) =>
      Promise.resolve(progressForPeriod(filters.periodStart))
    )
    employeesApi.listEmployeeWorkItems.mockResolvedValue(workItemsFixture)
    employeesApi.convertEmployeeWorkItemRisk.mockResolvedValue({
      risk: {
        id: 'risk-1',
        projectId: 'project-1',
        taskId: null,
        title: '依赖方接口未冻结',
        description: null,
        status: 'OPEN' as const,
      },
      alreadyExists: false,
    })
  })

  it('switches week/month in the URL and drills from one employee work item to its project', async () => {
    const user = userEvent.setup()
    renderPage('/employees/employee-1?periodType=WEEK&periodStart=2026-07-20')

    expect(await screen.findByText('平均完成度')).toBeInTheDocument()
    expect(screen.getAllByText('88%').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: '月' }))

    expect(screen.getByTestId('location')).toHaveTextContent('periodType=MONTH')
    // Resetting to the first page goes through defaults, so the URL stays clean.
    expect(screen.getByTestId('location')).not.toHaveTextContent('page=')
    await waitFor(() =>
      expect(employeesApi.getEmployeeProgress).toHaveBeenCalledWith(
        'employee-1',
        expect.objectContaining({ periodType: 'MONTH', periodStart: '2026-07-01' })
      )
    )
    expect(screen.getByRole('link', { name: 'RD-026 权限平台' })).toHaveAttribute(
      'href',
      '/spaces/projects/project-1/overview'
    )
    expect(screen.getByRole('link', { name: 'RD-026-T01 权限模型设计' })).toHaveAttribute(
      'href',
      '/spaces/projects/project-1/work-items'
    )
  })

  it('shows profile metadata, trend, project distribution, risks and source info', async () => {
    renderPage('/employees/employee-1?periodType=WEEK&periodStart=2026-07-20')

    expect(await screen.findByRole('heading', { name: '张明' })).toBeInTheDocument()
    expect(screen.getByText('研发一组')).toBeInTheDocument()
    expect(screen.getByText('高级研发工程师')).toBeInTheDocument()
    expect(screen.getByText('李工')).toBeInTheDocument()
    expect(screen.getByText('在职')).toBeInTheDocument()

    const trend = await screen.findByRole('region', { name: '完成度趋势' })
    expect(trend).toHaveTextContent('70%')
    expect(trend).toHaveTextContent('暂无数据')

    expect(screen.getByRole('link', { name: '打开项目空间：RD-026 权限平台' })).toHaveAttribute(
      'href',
      '/spaces/projects/project-1/overview'
    )
    expect(screen.getAllByText('依赖方接口未冻结').length).toBeGreaterThan(0)
    expect(screen.getAllByText('性能指标未达标').length).toBeGreaterThan(0)
    expect(screen.getByText('batch-1')).toBeInTheDocument()
    expect(screen.getByText(/第 3 行/)).toBeInTheDocument()
  })

  it('highlights the work row referenced by the URL work item', async () => {
    renderPage('/employees/employee-1?periodType=WEEK&periodStart=2026-07-20&workItemId=work-2')

    const title = await screen.findByText('周报整理')
    expect(title.closest('tr')).toHaveClass('employee-work-table__row--focused')
  })

  it('locates a deep-linked work item on a later page and highlights it there', async () => {
    const pageTwoItem = {
      ...workItemsFixture.data[0],
      id: 'work-12',
      title: '二期联调收尾',
    }
    employeesApi.listEmployeeWorkItems.mockImplementation(({ page }: { page?: number }) =>
      Promise.resolve(
        page === 2
          ? { ...workItemsFixture, data: [pageTwoItem], meta: { page: 2, pageSize: 10, total: 12 } }
          : { ...workItemsFixture, meta: { page: 1, pageSize: 10, total: 12 } }
      )
    )
    renderPage('/employees/employee-1?periodType=WEEK&periodStart=2026-07-20&workItemId=work-12')

    const title = await screen.findByText('二期联调收尾')
    expect(title.closest('tr')).toHaveClass('employee-work-table__row--focused')
    expect(screen.getByTestId('location')).toHaveTextContent('page=2')
    expect(employeesApi.listEmployeeWorkItems).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, pageSize: 10 })
    )
  })

  it('notes that the trend is not affected by the status filter', async () => {
    renderPage('/employees/employee-1?periodType=WEEK&periodStart=2026-07-20&status=AT_RISK')

    const trend = await screen.findByRole('region', { name: '完成度趋势' })
    expect(trend).toHaveTextContent('趋势不受状态筛选影响')
  })

  it('omits the trend caption when no status filter is active', async () => {
    renderPage('/employees/employee-1?periodType=WEEK&periodStart=2026-07-20')

    const trend = await screen.findByRole('region', { name: '完成度趋势' })
    expect(trend).not.toHaveTextContent('趋势不受状态筛选影响')
  })

  it('converts a reported risk only when it has a project and no linked risk', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderPage(
      '/employees/employee-1?periodType=WEEK&periodStart=2026-07-20'
    )
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')

    await screen.findAllByText('权限模型联调')

    expect(screen.getAllByRole('button', { name: '转为项目风险' })).toHaveLength(1)
    expect(screen.getByText('已转风险')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '转为项目风险' }))

    await waitFor(() =>
      expect(employeesApi.convertEmployeeWorkItemRisk).toHaveBeenCalledWith('work-1')
    )
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: employeeQueryKeys.all })
    )
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['risks'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['project', 'project-1'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['search'] })
  })

  it('shows a retry state when the employee progress cannot be loaded', async () => {
    employeesApi.getEmployeeProgress.mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    renderPage('/employees/employee-1?periodType=WEEK&periodStart=2026-07-20')

    expect(await screen.findByText('无法读取员工进展')).toBeInTheDocument()

    employeesApi.getEmployeeProgress.mockImplementation(
      (_id: string, filters: { periodStart: string }) =>
        Promise.resolve(progressForPeriod(filters.periodStart))
    )
    await user.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByRole('heading', { name: '张明' })).toBeInTheDocument()
  })
})
