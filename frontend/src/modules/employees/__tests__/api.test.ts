import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/http'
import {
  archiveEmployee,
  archiveEmployeeWorkImport,
  commitEmployeeWorkImport,
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
  getProjectTeamProgress,
  getTeamProgress,
  listEmployeeWorkImports,
  listEmployeeWorkItems,
  listEmployees,
  previewEmployeeWorkImport,
  rebuildEmployeeWorkImportSnapshots,
  resolveEmployeeWorkImport,
  restoreEmployeeWorkImport,
  updateEmployee,
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
        '/employee-work-items?periodType=MONTH&periodStart=2026-07-01&employeeId=employee+%2F+1&page=3&pageSize=20',
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

    await downloadEmployeeWorkImportTemplate()
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
      'http://127.0.0.1:4311/api/employee-work-imports/template',
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
