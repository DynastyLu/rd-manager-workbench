import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { employeeQueryKeys } from '@/modules/employees/queryKeys'
import EmployeesPage from '../EmployeesPage'

const employeesApi = vi.hoisted(() => ({
  archiveEmployee: vi.fn(),
  archiveEmployeeWorkImport: vi.fn(),
  commitEmployeeWorkImport: vi.fn(),
  createEmployee: vi.fn(),
  downloadEmployeeImportErrors: vi.fn(),
  downloadEmployeeImportSource: vi.fn(),
  downloadEmployeeWorkImportTemplate: vi.fn(),
  exportEmployeeWorkItems: vi.fn(),
  getEmployeeWorkImport: vi.fn(),
  getTeamProgress: vi.fn(),
  listEmployeeWorkImports: vi.fn(),
  listEmployeeWorkItems: vi.fn(),
  listEmployees: vi.fn(),
  previewEmployeeWorkImport: vi.fn(),
  rebuildEmployeeWorkImportSnapshots: vi.fn(),
  resolveEmployeeWorkImport: vi.fn(),
  restoreEmployeeWorkImport: vi.fn(),
  updateEmployee: vi.fn(),
  uploadEmployeeWorkImport: vi.fn(),
}))

vi.mock('@/modules/employees/api', () => employeesApi)

const employee = {
  id: 'employee-1',
  displayName: '林晓',
  roleTitle: '高级研发工程师',
  department: '研发一组',
  managerName: '张工',
  employmentStatus: 'ACTIVE' as const,
  weeklyCapacityHours: 40,
  developmentGoal: '承担材料平台技术负责人',
  notes: '重点培养',
  archivedAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  skills: [
    {
      id: 'skill-1',
      resourceId: 'employee-1',
      name: '材料分析',
      level: 'PROFICIENT' as const,
      evidence: null,
      assessedAt: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
  ],
}

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="当前员工路径">{location.pathname + location.search}</output>
}

function ExternalSearchNavigation() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate('/employees?tab=directory&query=周岚&page=3')}>
      模拟外部搜索导航
    </button>
  )
}

function renderEmployees(path = '/employees?tab=directory') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <EmployeesPage />
          <LocationProbe />
          <ExternalSearchNavigation />
        </MemoryRouter>
      </QueryClientProvider>
    ),
  }
}

const teamMetrics = {
  workItemCount: 4,
  completedCount: 2,
  completionRate: null,
  averageCompletionRate: 88,
  plannedHours: 40,
  actualHours: 36,
  riskCount: 1,
  blockedCount: 1,
  projectCount: 1,
  unlinkedCount: 0,
  dataComplete: false,
  missingWeeks: ['2026-07-13'],
}

const teamProgressFixture = {
  period: { type: 'WEEK' as const, start: '2026-07-20', end: '2026-07-26' },
  metrics: teamMetrics,
  sourceBatchIds: ['batch-1'],
  employees: {
    data: [
      {
        employeeId: 'employee-1',
        displayName: '林晓',
        department: '研发一组',
        roleTitle: '高级研发工程师',
        metrics: { ...teamMetrics, completionRate: 50, dataComplete: true, missingWeeks: [] },
        sourceBatchIds: ['batch-1'],
        employeeProgressUrl: '/employees/employee-1/progress?periodType=WEEK&periodStart=2026-07-20',
        workItemsUrl: '/employee-work-items?periodType=WEEK&periodStart=2026-07-20',
      },
    ],
    total: 1,
    limit: 10,
    hasMore: false,
  },
  projects: {
    data: [
      {
        projectId: 'project-1',
        projectCode: 'RD-026',
        projectName: '权限平台',
        participantCount: 3,
        metrics: { ...teamMetrics, averageCompletionRate: 75 },
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
        employeeName: '林晓',
        projectId: 'project-1',
        projectCode: 'RD-026',
        status: 'AT_RISK' as const,
        riskText: '依赖方接口未冻结',
        sourceBatchIds: ['batch-1'],
        links: {
          selfUrl: '/employee-work-items/work-1',
          employeeProgressUrl: '/employees/employee-1/progress?periodType=WEEK&periodStart=2026-07-20',
          sourceBatchUrl: '/employee-work-imports/batch-1',
        },
      },
    ],
    total: 1,
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
      employeeName: '林晓',
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
      links: {
        selfUrl: '/employee-work-items/work-1',
        employeeProgressUrl: '/employees/employee-1/progress?periodType=WEEK&periodStart=2026-07-20',
        sourceBatchUrl: '/employee-work-imports/batch-1',
      },
    },
    {
      id: 'work-2',
      employeeId: 'employee-1',
      employeeName: '林晓',
      department: '研发一组',
      importBatchId: 'batch-1',
      importVersion: 2,
      sourceRowId: 'row-2',
      sourceRowNumber: 4,
      sourceBatchIds: ['batch-1'],
      periodStart: '2026-07-20',
      periodEnd: '2026-07-26',
      title: '未填报工时的任务',
      planText: null,
      summaryText: null,
      completionRate: null,
      status: 'NOT_STARTED' as const,
      nextPlanText: null,
      riskText: null,
      plannedHours: null,
      actualHours: null,
      project: null,
      task: null,
      riskId: null,
      note: null,
      links: {
        selfUrl: '/employee-work-items/work-2',
        employeeProgressUrl: '/employees/employee-1/progress?periodType=WEEK&periodStart=2026-07-20',
        sourceBatchUrl: '/employee-work-imports/batch-1',
      },
    },
    {
      id: 'work-3',
      employeeId: 'employee-1',
      employeeName: '林晓',
      department: '研发一组',
      importBatchId: 'batch-1',
      importVersion: 2,
      sourceRowId: 'row-3',
      sourceRowNumber: 5,
      sourceBatchIds: ['batch-1'],
      periodStart: '2026-07-20',
      periodEnd: '2026-07-26',
      title: '零工时快速任务',
      planText: null,
      summaryText: null,
      completionRate: 100,
      status: 'COMPLETED' as const,
      nextPlanText: null,
      riskText: null,
      plannedHours: 0,
      actualHours: 0,
      project: null,
      task: null,
      riskId: null,
      note: null,
      links: {
        selfUrl: '/employee-work-items/work-3',
        employeeProgressUrl: '/employees/employee-1/progress?periodType=WEEK&periodStart=2026-07-20',
        sourceBatchUrl: '/employee-work-imports/batch-1',
      },
    },
  ],
  meta: { page: 1, pageSize: 20, total: 1 },
  sourceBatchIds: ['batch-1'],
  links: { progressUrl: '/employee-progress?periodType=WEEK&periodStart=2026-07-20' },
}

describe('EmployeesPage', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    for (const mock of Object.values(employeesApi)) mock.mockReset()
    employeesApi.listEmployees.mockResolvedValue({
      data: [employee],
      meta: { page: 1, pageSize: 20, total: 1 },
    })
    employeesApi.getTeamProgress.mockResolvedValue(teamProgressFixture)
    employeesApi.listEmployeeWorkItems.mockResolvedValue(workItemsFixture)
    employeesApi.exportEmployeeWorkItems.mockResolvedValue(undefined)
  })

  it('loads the directory from URL filters and exposes profile detail actions', async () => {
    renderEmployees(
      '/employees?tab=directory&query=%E6%9E%97%E6%99%93&department=%E7%A0%94%E5%8F%91%E4%B8%80%E7%BB%84&employmentStatus=ACTIVE'
    )

    expect(await screen.findByText('林晓')).toBeInTheDocument()
    expect(employeesApi.listEmployees).toHaveBeenCalledWith({
      q: '林晓',
      department: '研发一组',
      employmentStatus: 'ACTIVE',
      page: 1,
      pageSize: 20,
    })
    expect(screen.getAllByText('高级研发工程师')).toHaveLength(2)
    expect(screen.getByText('张工')).toBeInTheDocument()
    expect(screen.getByText('材料分析')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '部门' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '在职状态' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('搜索姓名、岗位或部门')).toBeInTheDocument()
    const profileLinks = screen.getAllByRole('link', { name: '查看林晓档案' })
    expect(profileLinks).toHaveLength(2)
    profileLinks.forEach((link) => expect(link).toHaveAttribute('href', '/employees/employee-1'))
  })

  it('persists search and employment filters in the URL and requests explicit pages', async () => {
    employeesApi.listEmployees.mockImplementation(({ page }: { page?: number }) =>
      Promise.resolve({
        data: [{ ...employee, displayName: page === 2 ? '周岚' : '林晓' }],
        meta: { page: page ?? 1, pageSize: 20, total: 21 },
      })
    )
    const user = userEvent.setup()
    renderEmployees('/employees?tab=directory&employmentStatus=ON_LEAVE')

    expect(await screen.findByText('全部部门，可输入任意部门')).toBeInTheDocument()
    await user.type(await screen.findByRole('textbox', { name: '搜索员工' }), '周')
    await waitFor(() =>
      expect(employeesApi.listEmployees).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: '周' })
      )
    )
    await waitFor(() =>
      expect(screen.getByLabelText('当前员工路径')).toHaveTextContent(
        '/employees?tab=directory&employmentStatus=ON_LEAVE&query=%E5%91%A8'
      )
    )
    await user.click(screen.getByText('2'))

    expect(await screen.findByText('周岚')).toBeInTheDocument()
    expect(employeesApi.listEmployees).toHaveBeenLastCalledWith({
      q: '周',
      department: undefined,
      employmentStatus: 'ON_LEAVE',
      page: 2,
      pageSize: 20,
    })
  })

  it('debounces a trimmed multi-character search into one final request and URL update', async () => {
    vi.useFakeTimers()
    try {
      renderEmployees('/employees?tab=directory&page=2')
      await act(async () => Promise.resolve())

      const searchInput = screen.getByRole('textbox', { name: '搜索员工' })
      fireEvent.change(searchInput, { target: { value: '  周 岚  ' } })

      expect(searchInput).toHaveValue('  周 岚  ')
      expect(employeesApi.listEmployees).toHaveBeenCalledTimes(1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(299)
      })
      expect(employeesApi.listEmployees).toHaveBeenCalledTimes(1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
      expect(employeesApi.listEmployees).toHaveBeenCalledTimes(2)
      expect(employeesApi.listEmployees).toHaveBeenLastCalledWith({
        q: '周 岚',
        department: undefined,
        employmentStatus: undefined,
        page: 1,
        pageSize: 20,
      })
      expect(screen.getByLabelText('当前员工路径')).toHaveTextContent(
        '/employees?tab=directory&query=%E5%91%A8+%E5%B2%9A'
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('synchronizes an external URL search change without writing the previous draft back', async () => {
    const user = userEvent.setup()
    renderEmployees('/employees?tab=directory&query=林晓&page=2')

    const searchInput = await screen.findByRole('textbox', { name: '搜索员工' })
    expect(searchInput).toHaveValue('林晓')
    await user.click(screen.getByRole('button', { name: '模拟外部搜索导航' }))

    await waitFor(() => expect(searchInput).toHaveValue('周岚'))
    await waitFor(() =>
      expect(employeesApi.listEmployees).toHaveBeenLastCalledWith({
        q: '周岚',
        department: undefined,
        employmentStatus: undefined,
        page: 3,
        pageSize: 20,
      })
    )
    await new Promise((resolve) => window.setTimeout(resolve, 350))

    expect(employeesApi.listEmployees).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('当前员工路径')).toHaveTextContent(
      '/employees?tab=directory&query=周岚&page=3'
    )
  })

  it('marks only the required name field invalid and clears its error when edited', async () => {
    const user = userEvent.setup()
    renderEmployees()

    await user.click(await screen.findByRole('button', { name: '新建员工' }))
    const createDialog = screen.getByRole('dialog', { name: '新建员工' })
    const nameInput = within(createDialog).getByRole('textbox', { name: '姓名' })
    expect(nameInput).toBeRequired()
    expect(nameInput).toHaveAttribute('aria-required', 'true')

    await user.click(within(createDialog).getByRole('button', { name: '保存员工档案' }))

    const alert = await within(createDialog).findByRole('alert')
    expect(alert).toHaveTextContent('请填写员工姓名')
    expect(nameInput).toHaveAttribute('aria-invalid', 'true')
    expect(nameInput).toHaveAttribute('aria-describedby', alert.id)

    await user.type(nameInput, '陈雨')
    expect(within(createDialog).queryByRole('alert')).not.toBeInTheDocument()
    expect(nameInput).not.toHaveAttribute('aria-invalid')
    expect(nameInput).not.toHaveAttribute('aria-describedby')
  })

  it('binds capacity validation to the capacity input instead of the name input', async () => {
    employeesApi.listEmployees.mockResolvedValue({
      data: [{ ...employee, weeklyCapacityHours: 169 }],
      meta: { page: 1, pageSize: 20, total: 1 },
    })
    const user = userEvent.setup()
    renderEmployees()

    await user.click(await screen.findByRole('button', { name: '编辑林晓' }))
    const editDialog = screen.getByRole('dialog', { name: '编辑员工档案' })
    const nameInput = within(editDialog).getByRole('textbox', { name: '姓名' })
    const capacityInput = within(editDialog).getByRole('spinbutton', {
      name: '每周可用工时',
    })
    await user.click(within(editDialog).getByRole('button', { name: '保存员工档案' }))

    const alert = await within(editDialog).findByRole('alert')
    expect(alert).toHaveTextContent('每周可用工时需在 0 到 168 小时之间')
    expect(capacityInput).toHaveAttribute('aria-invalid', 'true')
    expect(capacityInput).toHaveAttribute('aria-describedby', alert.id)
    expect(nameInput).not.toHaveAttribute('aria-invalid')
    expect(nameInput).not.toHaveAttribute('aria-describedby')
  })

  it('announces a generic request error without marking a specific field invalid', async () => {
    employeesApi.createEmployee.mockRejectedValue(new Error('员工编号冲突'))
    const user = userEvent.setup()
    renderEmployees()

    await user.click(await screen.findByRole('button', { name: '新建员工' }))
    const createDialog = screen.getByRole('dialog', { name: '新建员工' })
    const nameInput = within(createDialog).getByRole('textbox', { name: '姓名' })
    const capacityInput = within(createDialog).getByRole('spinbutton', {
      name: '每周可用工时',
    })
    await user.type(nameInput, '陈雨')
    await user.click(within(createDialog).getByRole('button', { name: '保存员工档案' }))

    expect(await within(createDialog).findByRole('alert')).toHaveTextContent('员工编号冲突')
    expect(nameInput).not.toHaveAttribute('aria-invalid')
    expect(nameInput).not.toHaveAttribute('aria-describedby')
    expect(capacityInput).not.toHaveAttribute('aria-invalid')
    expect(capacityInput).not.toHaveAttribute('aria-describedby')
  })

  it('creates and edits employees with the shared profile form', async () => {
    employeesApi.createEmployee.mockResolvedValue({ ...employee, id: 'employee-2' })
    employeesApi.updateEmployee.mockResolvedValue({
      ...employee,
      roleTitle: '研发负责人',
    })
    const user = userEvent.setup()
    const { queryClient } = renderEmployees()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(await screen.findByRole('button', { name: '新建员工' }))
    const createDialog = screen.getByRole('dialog', { name: '新建员工' })
    await user.type(within(createDialog).getByRole('textbox', { name: '姓名' }), '陈雨')
    await user.type(within(createDialog).getByRole('textbox', { name: '部门' }), '研发二组')
    await user.type(within(createDialog).getByRole('textbox', { name: '岗位' }), '研发工程师')
    await user.click(within(createDialog).getByRole('button', { name: '保存员工档案' }))

    await waitFor(() =>
      expect(employeesApi.createEmployee).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: '陈雨',
          department: '研发二组',
          roleTitle: '研发工程师',
          employmentStatus: 'ACTIVE',
          weeklyCapacityHours: 40,
        })
      )
    )

    await user.click(screen.getByRole('button', { name: '编辑林晓' }))
    const editDialog = screen.getByRole('dialog', { name: '编辑员工档案' })
    const departmentInput = within(editDialog).getByRole('textbox', { name: '部门' })
    const roleInput = within(editDialog).getByRole('textbox', { name: '岗位' })
    await user.clear(departmentInput)
    await user.clear(roleInput)
    await user.click(within(editDialog).getByRole('button', { name: '保存员工档案' }))

    await waitFor(() =>
      expect(employeesApi.updateEmployee).toHaveBeenCalledWith(
        'employee-1',
        expect.objectContaining({
          displayName: '林晓',
          department: '',
          roleTitle: '',
        })
      )
    )
    expect(employeesApi.listEmployees.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(invalidateQueries).toHaveBeenCalledTimes(2)
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: employeeQueryKeys.all,
    })
  })

  it('announces the employee directory loading state', async () => {
    employeesApi.listEmployees.mockReturnValue(new Promise(() => undefined))

    renderEmployees()

    expect(await screen.findByText('正在加载员工目录')).toBeInTheDocument()
  })

  it('requires explicit confirmation before archiving an employee', async () => {
    employeesApi.archiveEmployee.mockResolvedValue(undefined)
    const user = userEvent.setup()
    const { queryClient } = renderEmployees()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(await screen.findByRole('button', { name: '归档林晓' }))
    expect(screen.getByRole('dialog', { name: '归档员工？' })).toHaveTextContent(
      '归档后林晓将不再出现在员工目录'
    )
    await user.click(screen.getByRole('button', { name: '确认归档' }))

    await waitFor(() => expect(employeesApi.archiveEmployee).toHaveBeenCalledWith('employee-1'))
    expect(employeesApi.listEmployees.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: employeeQueryKeys.all,
    })
  })

  it('shows request failure, retry and empty states without rendering stale rows', async () => {
    employeesApi.listEmployees
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ data: [], meta: { page: 1, pageSize: 20, total: 0 } })
    const user = userEvent.setup()
    renderEmployees()

    expect(await screen.findByText('无法读取员工目录')).toBeInTheDocument()
    expect(screen.queryByText('林晓')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByText('还没有符合条件的员工')).toBeInTheDocument()
  })

  it('serves the overview tab with team metrics, a missing-week warning and drill-through links', async () => {
    renderEmployees('/employees?tab=overview&periodType=WEEK&periodStart=2026-07-20')

    expect(await screen.findByText('平均完成度')).toBeInTheDocument()
    expect(employeesApi.getTeamProgress).toHaveBeenCalledWith({
      periodType: 'WEEK',
      periodStart: '2026-07-20',
      department: undefined,
      projectId: undefined,
      status: undefined,
    })
    expect(screen.getAllByText('88%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('暂无数据').length).toBeGreaterThan(0)
    expect(screen.getByText(/2026-07-13/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '林晓' })).toHaveAttribute(
      'href',
      '/employees/employee-1?periodType=WEEK&periodStart=2026-07-20'
    )
    expect(screen.getByRole('link', { name: 'RD-026 权限平台' })).toHaveAttribute(
      'href',
      '/spaces/projects/project-1/overview'
    )
    expect(screen.getByText('参与 3 人')).toBeInTheDocument()
    expect(screen.getAllByText('权限模型联调').length).toBeGreaterThan(0)
    expect(screen.getByText('依赖方接口未冻结')).toBeInTheDocument()
  })

  it('keeps overview filters in the URL and re-queries team progress when the period switches', async () => {
    const user = userEvent.setup()
    renderEmployees('/employees?tab=overview&periodType=WEEK&periodStart=2026-07-20')

    await screen.findByRole('link', { name: '林晓' })
    await user.click(screen.getByRole('button', { name: '月' }))

    expect(screen.getByLabelText('当前员工路径')).toHaveTextContent('periodType=MONTH')
    await waitFor(() =>
      expect(employeesApi.getTeamProgress).toHaveBeenLastCalledWith(
        expect.objectContaining({ periodType: 'MONTH', periodStart: '2026-07-01' })
      )
    )
  })

  it('serves the work-items tab with filterable traceable rows and export', async () => {
    const createObjectURL = vi.fn(() => 'blob:export')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const exportedFile = {
      blob: new Blob(['work-items']),
      fileName: '员工工作明细-2026-07-20.xlsx',
    }
    employeesApi.exportEmployeeWorkItems.mockResolvedValue(exportedFile)
    const user = userEvent.setup()
    renderEmployees('/employees?tab=work-items&periodType=WEEK&periodStart=2026-07-20')

    expect(await screen.findByText('权限模型联调')).toBeInTheDocument()
    expect(employeesApi.listEmployeeWorkItems).toHaveBeenCalledWith({
      periodType: 'WEEK',
      periodStart: '2026-07-20',
      department: undefined,
      projectId: undefined,
      status: undefined,
      employeeId: undefined,
      page: 1,
      pageSize: 20,
    })
    expect(screen.getByRole('link', { name: 'RD-026 权限平台' })).toHaveAttribute(
      'href',
      '/spaces/projects/project-1/overview'
    )
    expect(screen.getByText(/第 3 行/)).toBeInTheDocument()
    expect(screen.getByText('16 / 14')).toBeInTheDocument()
    // Unreported hours stay distinguishable from real zeros.
    const unreportedRow = screen.getByText('未填报工时的任务').closest('tr')
    expect(unreportedRow).not.toBeNull()
    expect(within(unreportedRow as HTMLElement).getAllByText('暂无数据')).toHaveLength(2)
    expect(screen.getByText('0 / 0')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '导出当前筛选' }))

    await waitFor(() =>
      expect(employeesApi.exportEmployeeWorkItems).toHaveBeenCalledWith({
        periodType: 'WEEK',
        periodStart: '2026-07-20',
        department: undefined,
        projectId: undefined,
        status: undefined,
        employeeId: undefined,
      })
    )
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(exportedFile.blob))
  })

  it('keeps the active project filter present in the work-items project options', async () => {
    const user = userEvent.setup()
    renderEmployees(
      '/employees?tab=work-items&periodType=WEEK&periodStart=2026-07-20&projectId=project-9'
    )

    expect(await screen.findByText('权限模型联调')).toBeInTheDocument()
    expect(employeesApi.listEmployeeWorkItems).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-9' })
    )

    await user.click(screen.getByRole('combobox', { name: '项目' }))

    expect(await screen.findByRole('option', { name: /project-9/ })).toBeInTheDocument()
  })

  it('serves the imports tab with import history and the wizard entry', async () => {
    employeesApi.listEmployeeWorkImports.mockResolvedValue({
      data: [
        {
          id: 'batch-3',
          periodType: 'WEEK' as const,
          periodStart: '2026-07-06',
          periodEnd: '2026-07-12',
          version: 3,
          status: 'COMPLETED' as const,
          snapshotStatus: 'READY' as const,
          snapshotError: null,
          originalName: '第七周计划与总结.xlsx',
          fileHash: 'hash-3',
          templateVersion: 2,
          totalRows: 20,
          validRows: 20,
          errorRows: 0,
          unresolvedRows: 0,
          importedRows: 20,
          supersedesBatchId: null,
          restoredFromBatchId: null,
          committedAt: '2026-07-20T09:05:00.000Z',
          expiresAt: '2026-07-31T00:00:00.000Z',
          archivedAt: null,
          createdAt: '2026-07-20T08:00:00.000Z',
          updatedAt: '2026-07-20T09:05:00.000Z',
          hasErrors: false,
        },
      ],
      meta: { page: 1, pageSize: 10, total: 1 },
      sourceBatchIds: ['batch-3'],
    })
    const user = userEvent.setup()
    renderEmployees('/employees?tab=imports')

    expect(await screen.findByText('第七周计划与总结.xlsx')).toBeInTheDocument()
    expect(employeesApi.listEmployeeWorkImports).toHaveBeenCalledWith({ page: 1, pageSize: 10 })
    expect(screen.getByText('v3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '导入工作计划' }))

    expect(await screen.findByLabelText('选择员工计划与总结 Excel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下载导入模板' })).toBeInTheDocument()
    expect(employeesApi.uploadEmployeeWorkImport).not.toHaveBeenCalled()
  })
})
