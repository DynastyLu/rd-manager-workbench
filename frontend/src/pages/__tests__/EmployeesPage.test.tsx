import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { employeeQueryKeys } from '@/modules/employees/queryKeys'
import EmployeesPage from '../EmployeesPage'

const employeesApi = vi.hoisted(() => ({
  archiveEmployee: vi.fn(),
  createEmployee: vi.fn(),
  listEmployees: vi.fn(),
  updateEmployee: vi.fn(),
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

describe('EmployeesPage', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    for (const mock of Object.values(employeesApi)) mock.mockReset()
    employeesApi.listEmployees.mockResolvedValue({
      data: [employee],
      meta: { page: 1, pageSize: 20, total: 1 },
    })
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

  it('keeps unfinished employee workspace tabs honest and URL-backed', async () => {
    const user = userEvent.setup()
    renderEmployees('/employees?tab=overview&periodType=MONTH&periodStart=2026-07-01')

    expect(await screen.findByText('团队进展看板将在后续阶段接入')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '工作明细' }))

    expect(screen.getByText('员工工作明细将在后续阶段接入')).toBeInTheDocument()
    expect(screen.getByLabelText('当前员工路径')).toHaveTextContent(
      '/employees?tab=work-items&periodType=MONTH&periodStart=2026-07-01'
    )
  })
})
