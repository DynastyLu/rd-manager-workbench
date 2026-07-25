import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { selectSemiOption } from '@/test-utils/selectSemiOption'
import type { EmployeeWorkImportBatch, EmployeeWorkImportDetail } from '../types'
import { EmployeeImportWizard } from '../components/EmployeeImportWizard'

const employeesApi = vi.hoisted(() => ({
  archiveEmployeeWorkImport: vi.fn(),
  commitEmployeeWorkImport: vi.fn(),
  downloadEmployeeImportErrors: vi.fn(),
  downloadEmployeeImportSource: vi.fn(),
  downloadEmployeeWorkImportTemplate: vi.fn(),
  getEmployeeWorkImport: vi.fn(),
  listEmployees: vi.fn(),
  previewEmployeeWorkImport: vi.fn(),
  resolveEmployeeWorkImport: vi.fn(),
  uploadEmployeeWorkImport: vi.fn(),
}))

const projectsApi = vi.hoisted(() => ({
  listProjects: vi.fn(),
}))

const tasksApi = vi.hoisted(() => ({
  listTasks: vi.fn(),
}))

vi.mock('@/modules/employees/api', () => employeesApi)
vi.mock('@/modules/workbench/api/projects', () => projectsApi)
vi.mock('@/modules/workbench/api/tasks', () => tasksApi)

function makeBatch(overrides: Partial<EmployeeWorkImportBatch> = {}): EmployeeWorkImportBatch {
  return {
    id: 'batch-1',
    periodType: 'WEEK',
    periodStart: '2026-07-06',
    periodEnd: '2026-07-12',
    version: null,
    status: 'UPLOADED',
    snapshotStatus: 'NOT_STARTED',
    snapshotError: null,
    originalName: '第七周计划与总结.xlsx',
    fileHash: 'hash-1',
    templateVersion: 2,
    totalRows: 0,
    validRows: 0,
    errorRows: 0,
    unresolvedRows: 0,
    importedRows: 0,
    supersedesBatchId: null,
    restoredFromBatchId: null,
    committedAt: null,
    expiresAt: '2026-07-31T00:00:00.000Z',
    archivedAt: null,
    createdAt: '2026-07-20T08:00:00.000Z',
    updatedAt: '2026-07-20T08:00:00.000Z',
    hasErrors: false,
    ...overrides,
  }
}

const uploadedBatch = makeBatch()
const resolvingBatch = makeBatch({
  status: 'RESOLVING',
  totalRows: 20,
  validRows: 19,
  unresolvedRows: 1,
  hasErrors: true,
})
const readyBatch = makeBatch({
  status: 'READY',
  totalRows: 20,
  validRows: 20,
})
const completedBatch = makeBatch({
  status: 'COMPLETED',
  version: 3,
  totalRows: 20,
  validRows: 20,
  importedRows: 20,
  snapshotStatus: 'GENERATING',
  committedAt: '2026-07-20T09:05:00.000Z',
})

function makeRow(
  overrides: Partial<EmployeeWorkImportDetail['rows'][number]> = {}
): EmployeeWorkImportDetail['rows'][number] {
  return {
    id: 'row-3',
    rowNumber: 3,
    status: 'VALID',
    errors: [],
    rawValues: { 员工姓名: '林晓' },
    normalizedValues: {
      rowNumber: 3,
      employeeName: '林晓',
      title: '完成材料平台接口联调',
      planText: null,
      summaryText: null,
      completionRate: null,
      status: 'IN_PROGRESS',
      nextPlanText: null,
      riskText: null,
      plannedHours: 8,
      actualHours: null,
      projectCode: 'RD-2026-001',
      taskCode: null,
      note: null,
      rawValues: {},
    },
    resolvedEmployeeId: 'emp-2',
    resolvedProjectId: 'project-1',
    resolvedTaskId: null,
    keepUnlinked: false,
    workItemId: null,
    links: { sourceBatch: '/employee-work-imports/batch-1' },
    ...overrides,
  }
}

const unresolvedRow = makeRow({
  id: 'row-18',
  rowNumber: 18,
  status: 'UNRESOLVED',
  errors: [
    {
      field: '员工姓名',
      code: 'EMPLOYEE_NOT_FOUND',
      rawValue: '张名',
      reason: 'employee must exactly match an active employee',
    },
  ],
  rawValues: { 员工姓名: '张名' },
  normalizedValues: {
    rowNumber: 18,
    employeeName: '张名',
    title: '整理实验数据',
    planText: null,
    summaryText: null,
    completionRate: null,
    status: 'IN_PROGRESS',
    nextPlanText: null,
    riskText: null,
    plannedHours: 4,
    actualHours: null,
    projectCode: 'RD-2026-001',
    taskCode: null,
    note: null,
    rawValues: {},
  },
  resolvedEmployeeId: null,
  resolvedProjectId: 'project-1',
})

function makeDetail(
  batch: EmployeeWorkImportBatch,
  rows: EmployeeWorkImportDetail['rows']
): EmployeeWorkImportDetail {
  return {
    ...batch,
    sourceBatchIds: [batch.id],
    rows,
    rowMeta: { page: 1, pageSize: 200, total: rows.length },
  }
}

const resolvingDetail = makeDetail(resolvingBatch, [makeRow(), unresolvedRow])
const readyDetail = makeDetail(readyBatch, [makeRow(), makeRow({ ...unresolvedRow, status: 'VALID', errors: [], resolvedEmployeeId: 'emp-1' })])

const workbook = new File(['xlsx'], '第七周计划与总结.xlsx', {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
})

function renderWizard(onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return {
    onClose,
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <EmployeeImportWizard visible onClose={onClose} />
      </QueryClientProvider>
    ),
  }
}

describe('EmployeeImportWizard', () => {
  beforeEach(() => {
    for (const mock of Object.values(employeesApi)) mock.mockReset()
    for (const mock of Object.values(projectsApi)) mock.mockReset()
    for (const mock of Object.values(tasksApi)) mock.mockReset()
    employeesApi.listEmployees.mockResolvedValue({
      data: [
        {
          id: 'emp-1',
          displayName: '张明',
          roleTitle: '研发工程师',
          department: '研发一组',
          managerName: null,
          employmentStatus: 'ACTIVE',
          weeklyCapacityHours: 40,
          developmentGoal: null,
          notes: null,
          archivedAt: null,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
          skills: [],
        },
      ],
      meta: { page: 1, pageSize: 100, total: 1 },
    })
    projectsApi.listProjects.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 100, total: 0 },
    })
    tasksApi.listTasks.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 100, total: 0 },
    })
  })

  it('blocks commit until every employee and project error is resolved', async () => {
    employeesApi.uploadEmployeeWorkImport.mockResolvedValue(uploadedBatch)
    employeesApi.previewEmployeeWorkImport.mockResolvedValue(resolvingBatch)
    employeesApi.getEmployeeWorkImport
      .mockResolvedValueOnce(resolvingDetail)
      .mockResolvedValue(readyDetail)
    employeesApi.resolveEmployeeWorkImport.mockResolvedValue(readyBatch)
    const user = userEvent.setup()
    renderWizard()

    await user.upload(screen.getByLabelText('选择员工计划与总结 Excel'), workbook)
    expect(employeesApi.uploadEmployeeWorkImport).toHaveBeenCalledWith(workbook)
    await screen.findByText('错误 1 行')
    // The backend rejects rowsPageSize above 100, which would leave the
    // resolutions step stuck without any problem rows.
    await waitFor(() => expect(employeesApi.getEmployeeWorkImport).toHaveBeenCalled())
    const detailFilters = employeesApi.getEmployeeWorkImport.mock.calls[0]?.[1] as {
      rowsPageSize?: number
    }
    expect(detailFilters.rowsPageSize ?? 0).toBeGreaterThan(0)
    expect(detailFilters.rowsPageSize).toBeLessThanOrEqual(100)
    expect(screen.getByText('共 20 行')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认导入' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '为第 18 行选择员工' }))
    await waitFor(() =>
      expect(screen.queryByText('正在加载可选项…')).not.toBeInTheDocument()
    )
    await selectSemiOption(screen.getByLabelText('第 18 行员工'), '张明')
    await user.click(screen.getByRole('button', { name: '保存关联' }))

    await waitFor(() =>
      expect(employeesApi.resolveEmployeeWorkImport).toHaveBeenCalledWith('batch-1', {
        rows: [{ rowNumber: 18, employeeId: 'emp-1' }],
      })
    )
    expect(await screen.findByRole('button', { name: '确认导入' })).toBeEnabled()
  })

  it('confirms version replacement before committing and shows the import result', async () => {
    employeesApi.uploadEmployeeWorkImport.mockResolvedValue(uploadedBatch)
    employeesApi.previewEmployeeWorkImport.mockResolvedValue(readyBatch)
    employeesApi.getEmployeeWorkImport.mockResolvedValue(readyDetail)
    employeesApi.commitEmployeeWorkImport.mockResolvedValue(completedBatch)
    const user = userEvent.setup()
    const { onClose, queryClient } = renderWizard()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')

    await user.upload(screen.getByLabelText('选择员工计划与总结 Excel'), workbook)
    expect(await screen.findByText('错误 0 行')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '确认导入' }))
    expect(await screen.findByText('确认导入并生成新版本？')).toBeInTheDocument()
    expect(
      screen.getByText(/旧版本会被替换/)
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '确认替换并导入' }))
    await waitFor(() =>
      expect(employeesApi.commitEmployeeWorkImport).toHaveBeenCalledWith('batch-1')
    )

    expect(await screen.findByText('导入完成')).toBeInTheDocument()
    expect(screen.getByText(/成功导入 20 行/)).toBeInTheDocument()
    expect(screen.getByText(/版本 v3/)).toBeInTheDocument()
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['employees'] })

    await user.click(screen.getByRole('button', { name: '完成' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(employeesApi.archiveEmployeeWorkImport).not.toHaveBeenCalled()
  })

  it('deletes an uncommitted session only after explicit confirmation on close', async () => {
    employeesApi.uploadEmployeeWorkImport.mockResolvedValue(uploadedBatch)
    employeesApi.previewEmployeeWorkImport.mockResolvedValue(resolvingBatch)
    employeesApi.getEmployeeWorkImport.mockResolvedValue(resolvingDetail)
    employeesApi.archiveEmployeeWorkImport.mockResolvedValue(undefined)
    const user = userEvent.setup()
    const { onClose } = renderWizard()

    await user.upload(screen.getByLabelText('选择员工计划与总结 Excel'), workbook)
    await screen.findByText('错误 1 行')

    await user.click(screen.getByRole('button', { name: '取消' }))
    const confirmTitle = await screen.findByText('放弃本次导入？')
    expect(confirmTitle.closest('.semi-modal-confirm')).toHaveTextContent('还未提交')
    expect(employeesApi.archiveEmployeeWorkImport).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '删除并关闭' }))
    await waitFor(() =>
      expect(employeesApi.archiveEmployeeWorkImport).toHaveBeenCalledWith('batch-1')
    )
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('closes without deleting anything before a file is uploaded', async () => {
    const user = userEvent.setup()
    const { onClose } = renderWizard()

    await user.click(screen.getByRole('button', { name: '取消' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(employeesApi.archiveEmployeeWorkImport).not.toHaveBeenCalled()
  })

  it('downloads the import template from the file step', async () => {
    const createObjectURL = vi.fn(() => 'blob:template')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    employeesApi.downloadEmployeeWorkImportTemplate.mockResolvedValue({
      blob: new Blob(['template']),
      fileName: 'employee-work-import-template.xlsx',
    })
    const user = userEvent.setup()
    renderWizard()

    await user.click(screen.getByRole('button', { name: '下载导入模板' }))

    await waitFor(() =>
      expect(employeesApi.downloadEmployeeWorkImportTemplate).toHaveBeenCalledTimes(1)
    )
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled())
    vi.unstubAllGlobals()
  })
})
