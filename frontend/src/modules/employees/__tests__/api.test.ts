import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/http'
import {
  archiveEmployee,
  archiveEmployeeWorkImport,
  cancelEmployeeWeekPlan,
  commitEmployeeWorkImport,
  convertEmployeeWeekPlanToTask,
  convertEmployeeWorkItemRisk,
  createEmployee,
  downloadEmployeeImportErrors,
  downloadEmployeeImportSource,
  downloadEmployeeWorkImportTemplate,
  exportEmployeeWorkItems,
  getEmployee,
  getEmployeeProgress,
  getEmployeeWorkImport,
  getEmployeeWorkItem,
  getEmployeeWeekPlan,
  getProjectTeamProgress,
  getTeamProgress,
  listEmployeeWorkImports,
  listEmployeeWorkItems,
  listEmployeeWeekPlans,
  matchEmployeeWeekPlan,
  listEmployees,
  previewEmployeeWorkImport,
  rebuildEmployeeWorkImportSnapshots,
  resolveEmployeeWorkImport,
  restoreEmployeeWorkImport,
  unmatchEmployeeWeekPlan,
  updateEmployee,
  updateEmployeeWorkItem,
  updateEmployeeWeekPlan,
  uploadEmployeeWorkImport,
} from '../api'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return { ...actual, request }
})

describe('employee workspace API', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    request.mockReset()
    request.mockResolvedValue({})
  })

  it('serializes employee, progress, work-item, and import filters without empty values', async () => {
    await listEmployees({
      q: ' 张 明 ',
      department: '研发 / 一部',
      employmentStatus: 'ACTIVE',
      page: 2,
      pageSize: 50,
    })
    await getTeamProgress({
      periodType: 'WEEK',
      periodStart: '2026-07-20',
      department: '研发 / 一部',
      projectId: '',
      status: 'AT_RISK',
    })
    await listEmployeeWorkItems({
      periodType: 'MONTH',
      periodStart: '2026-07-01',
      employeeId: 'employee / 1',
      workDirection: '平台研发',
      workKind: 'PROJECT',
      projectId: 'project / 1',
      taskId: 'task / 1',
      dueDateFrom: '2026-07-01',
      dueDateTo: '2026-07-31',
      riskOnly: true,
      page: 3,
      pageSize: 20,
    })
    await listEmployeeWorkImports({
      periodType: 'WEEK',
      periodStart: '2026-07-20',
      status: 'COMPLETED',
      page: 1,
      pageSize: 20,
    })

    expect(request.mock.calls).toEqual([
      [
        '/employees?q=%E5%BC%A0+%E6%98%8E&department=%E7%A0%94%E5%8F%91+%2F+%E4%B8%80%E9%83%A8&employmentStatus=ACTIVE&page=2&pageSize=50',
      ],
      [
        '/employee-progress?periodType=WEEK&periodStart=2026-07-20&department=%E7%A0%94%E5%8F%91+%2F+%E4%B8%80%E9%83%A8&status=AT_RISK',
      ],
      [
        '/employee-work-items?periodType=MONTH&periodStart=2026-07-01&employeeId=employee+%2F+1&workDirection=%E5%B9%B3%E5%8F%B0%E7%A0%94%E5%8F%91&workKind=PROJECT&projectId=project+%2F+1&taskId=task+%2F+1&dueDateFrom=2026-07-01&dueDateTo=2026-07-31&riskOnly=true&page=3&pageSize=20',
      ],
      [
        '/employee-work-imports?periodType=WEEK&periodStart=2026-07-20&status=COMPLETED&page=1&pageSize=20',
      ],
    ])
  })

  it('encodes every employee, work-item, project, and import resource path', async () => {
    const progress = { periodType: 'WEEK', periodStart: '2026-07-20' } as const
    await getEmployee('employee / 1')
    await updateEmployee('employee / 1', { roleTitle: '高级工程师' })
    await archiveEmployee('employee / 1')
    await getEmployeeProgress('employee / 1', progress)
    await getEmployeeWorkItem('work / 1')
    await updateEmployeeWorkItem('work / 1', {
      workKind: 'NON_PROJECT',
      projectId: null,
      taskId: null,
      plannedHours: 8,
      actualHours: 6.5,
      riskText: null,
    })
    await getProjectTeamProgress('project / 1', progress)
    await getEmployeeWorkImport('batch / 1', { rowsPage: 2, rowsPageSize: 50 })
    await resolveEmployeeWorkImport('batch / 1', {
      rows: [{ rowNumber: 18, employeeId: 'employee / 1' }],
    })
    await commitEmployeeWorkImport('batch / 1')
    await rebuildEmployeeWorkImportSnapshots('batch / 1')
    await restoreEmployeeWorkImport('batch / 1')
    await archiveEmployeeWorkImport('batch / 1')
    await convertEmployeeWorkItemRisk('work / 1')

    expect(request.mock.calls).toEqual([
      ['/employees/employee%20%2F%201'],
      [
        '/employees/employee%20%2F%201',
        { method: 'PATCH', body: JSON.stringify({ roleTitle: '高级工程师' }) },
      ],
      ['/employees/employee%20%2F%201', { method: 'DELETE' }],
      ['/employees/employee%20%2F%201/progress?periodType=WEEK&periodStart=2026-07-20'],
      ['/employee-work-items/work%20%2F%201'],
      [
        '/employee-work-items/work%20%2F%201',
        {
          method: 'PATCH',
          body: JSON.stringify({
            workKind: 'NON_PROJECT',
            projectId: null,
            taskId: null,
            plannedHours: 8,
            actualHours: 6.5,
            riskText: null,
          }),
        },
      ],
      ['/projects/project%20%2F%201/team-progress?periodType=WEEK&periodStart=2026-07-20'],
      ['/employee-work-imports/batch%20%2F%201?rowsPage=2&rowsPageSize=50'],
      [
        '/employee-work-imports/batch%20%2F%201/resolutions',
        {
          method: 'PATCH',
          body: JSON.stringify({
            rows: [{ rowNumber: 18, employeeId: 'employee / 1' }],
          }),
        },
      ],
      ['/employee-work-imports/batch%20%2F%201/commit', { method: 'POST' }],
      ['/employee-work-imports/batch%20%2F%201/rebuild-snapshots', { method: 'POST' }],
      ['/employee-work-imports/batch%20%2F%201/restore', { method: 'POST' }],
      ['/employee-work-imports/batch%20%2F%201', { method: 'DELETE' }],
      ['/employee-work-items/work%20%2F%201/convert-risk', { method: 'POST' }],
    ])
  })

  it('queries week plans and sends bounded plan actions to encoded resources', async () => {
    await listEmployeeWeekPlans({
      periodType: 'WEEK',
      periodStart: '2026-07-27',
      employeeId: 'employee / 1',
      department: '研发 一组',
      projectId: 'project / 1',
      workDirection: '平台研发',
      priority: 'HIGH',
      dueDateFrom: '2026-07-28',
      dueDateTo: '2026-07-31',
      carryStatus: 'PLANNED',
      page: 2,
      pageSize: 20,
    })
    await getEmployeeWeekPlan('plan / 1')
    await updateEmployeeWeekPlan('plan / 1', {
      workKind: 'PROJECT',
      projectId: 'project-1',
      taskId: null,
      plannedCompletionAt: '2026-07-31',
      priority: 'URGENT',
      collaborationText: '需要测试协作',
    })
    await cancelEmployeeWeekPlan('plan / 1', '范围调整')
    await matchEmployeeWeekPlan('plan / 1', 'work / 1')
    await unmatchEmployeeWeekPlan('plan / 1')
    await convertEmployeeWeekPlanToTask('plan / 1')

    expect(request.mock.calls).toEqual([
      [
        '/employee-week-plans?periodType=WEEK&periodStart=2026-07-27&employeeId=employee+%2F+1&department=%E7%A0%94%E5%8F%91+%E4%B8%80%E7%BB%84&projectId=project+%2F+1&workDirection=%E5%B9%B3%E5%8F%B0%E7%A0%94%E5%8F%91&priority=HIGH&dueDateFrom=2026-07-28&dueDateTo=2026-07-31&carryStatus=PLANNED&page=2&pageSize=20',
      ],
      ['/employee-week-plans/plan%20%2F%201'],
      [
        '/employee-week-plans/plan%20%2F%201',
        {
          method: 'PATCH',
          body: JSON.stringify({
            workKind: 'PROJECT',
            projectId: 'project-1',
            taskId: null,
            plannedCompletionAt: '2026-07-31',
            priority: 'URGENT',
            collaborationText: '需要测试协作',
          }),
        },
      ],
      [
        '/employee-week-plans/plan%20%2F%201/cancel',
        { method: 'POST', body: JSON.stringify({ reason: '范围调整' }) },
      ],
      [
        '/employee-week-plans/plan%20%2F%201/match',
        { method: 'POST', body: JSON.stringify({ workItemId: 'work / 1' }) },
      ],
      ['/employee-week-plans/plan%20%2F%201/unmatch', { method: 'POST' }],
      ['/employee-week-plans/plan%20%2F%201/convert-to-task', { method: 'POST' }],
    ])
  })

  it('uploads one workbook with FormData and previews with an explicit empty JSON body', async () => {
    const file = new File(['xlsx'], '周报.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    await uploadEmployeeWorkImport(file)
    await previewEmployeeWorkImport('batch / 1')

    expect(request).toHaveBeenNthCalledWith(
      1,
      '/employee-work-imports',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) })
    )
    const body = request.mock.calls[0]?.[1]?.body as FormData
    expect(body.get('file')).toBe(file)
    expect(request).toHaveBeenNthCalledWith(2, '/employee-work-imports/batch%20%2F%201/preview', {
      method: 'PATCH',
      body: JSON.stringify({}),
    })
  })

  it('submits V2 bulk association rows with row ids and completion fields', async () => {
    await resolveEmployeeWorkImport('batch / 1', {
      rows: [
        {
          rowId: 'row / 1',
          workKind: 'PROJECT',
          projectId: 'project-1',
          taskId: 'task-1',
          plannedHours: 12.5,
          actualHours: 9,
          riskDecision: 'EDIT',
          riskText: '依赖接口延期',
        },
        {
          rowId: 'row-2',
          workKind: 'NON_PROJECT',
          projectId: null,
          taskId: null,
          plannedHours: null,
          actualHours: null,
          riskDecision: 'REMOVE',
        },
      ],
    })

    expect(request).toHaveBeenCalledWith('/employee-work-imports/batch%20%2F%201/resolutions', {
      method: 'PATCH',
      body: JSON.stringify({
        rows: [
          {
            rowId: 'row / 1',
            workKind: 'PROJECT',
            projectId: 'project-1',
            taskId: 'task-1',
            plannedHours: 12.5,
            actualHours: 9,
            riskDecision: 'EDIT',
            riskText: '依赖接口延期',
          },
          {
            rowId: 'row-2',
            workKind: 'NON_PROJECT',
            projectId: null,
            taskId: null,
            plannedHours: null,
            actualHours: null,
            riskDecision: 'REMOVE',
          },
        ],
      }),
    })
  })

  it('uses the JSON employee create contract', async () => {
    await createEmployee({
      displayName: '张明',
      department: '研发部',
      employmentStatus: 'ACTIVE',
      weeklyCapacityHours: 40,
    })

    expect(request).toHaveBeenCalledWith('/employees', {
      method: 'POST',
      body: JSON.stringify({
        displayName: '张明',
        department: '研发部',
        employmentStatus: 'ACTIVE',
        weeklyCapacityHours: 40,
      }),
    })
  })

  it('downloads template, source, errors, and filtered exports through the real binary client', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response('xlsx', {
        status: 200,
        headers: { 'Content-Disposition': 'attachment; filename="employees.xlsx"' },
      })
    })

    await downloadEmployeeWorkImportTemplate('2026-07-27')
    await downloadEmployeeImportSource('batch / 1')
    await downloadEmployeeImportErrors('batch / 1')
    await exportEmployeeWorkItems(
      {
        periodType: 'WEEK',
        periodStart: '2026-07-20',
        employeeId: 'employee / 1',
        status: 'BLOCKED',
      },
      'xlsx'
    )

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://127.0.0.1:4311/api/employee-work-imports/template?version=2&periodStart=2026-07-27',
      'http://127.0.0.1:4311/api/employee-work-imports/batch%20%2F%201/source',
      'http://127.0.0.1:4311/api/employee-work-imports/batch%20%2F%201/errors',
      'http://127.0.0.1:4311/api/employee-work-items/export?periodType=WEEK&periodStart=2026-07-20&employeeId=employee+%2F+1&status=BLOCKED&format=xlsx',
    ])
  })

  it('surfaces a structured 404 from an employee download', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: { code: 'EMPLOYEE_IMPORT_NOT_FOUND', message: '导入批次不存在' },
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    )

    await expect(downloadEmployeeImportSource('batch-404')).rejects.toMatchObject<ApiError>({
      status: 404,
      code: 'EMPLOYEE_IMPORT_NOT_FOUND',
      message: '导入批次不存在',
    })
  })

  it('surfaces a normalized network error from an employee download', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('connection refused'))

    await expect(downloadEmployeeImportErrors('batch-1')).rejects.toMatchObject<ApiError>({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'connection refused',
    })
  })
})
