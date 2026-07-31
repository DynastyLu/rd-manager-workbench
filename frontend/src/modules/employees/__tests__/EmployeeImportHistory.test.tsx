import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmployeeWorkImportBatch } from '../types'
import { EmployeeImportHistory } from '../components/EmployeeImportHistory'

const employeesApi = vi.hoisted(() => ({
  archiveEmployeeWorkImport: vi.fn(),
  downloadEmployeeImportErrors: vi.fn(),
  downloadEmployeeImportSource: vi.fn(),
  listEmployeeWorkImports: vi.fn(),
  rebuildEmployeeWorkImportSnapshots: vi.fn(),
  restoreEmployeeWorkImport: vi.fn(),
}))

vi.mock('@/modules/employees/api', () => employeesApi)

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
    totalRows: 20,
    validRows: 20,
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

const completedBatch = makeBatch({
  id: 'batch-3',
  originalName: '第七周计划与总结.xlsx',
  status: 'COMPLETED',
  version: 3,
  snapshotStatus: 'READY',
  importedRows: 20,
  supersedesBatchId: 'batch-2',
  committedAt: '2026-07-20T09:05:00.000Z',
})

const supersededBatch = makeBatch({
  id: 'batch-2',
  originalName: '第六周计划与总结.xlsx',
  periodStart: '2026-06-29',
  periodEnd: '2026-07-05',
  status: 'SUPERSEDED',
  version: 2,
  snapshotStatus: 'READY',
  importedRows: 18,
  committedAt: '2026-07-13T09:05:00.000Z',
})

const restoredBatch = makeBatch({
  id: 'batch-4',
  originalName: '第六周计划与总结-恢复.xlsx',
  periodStart: '2026-06-29',
  periodEnd: '2026-07-05',
  status: 'COMPLETED',
  version: 4,
  snapshotStatus: 'GENERATING',
  importedRows: 18,
  restoredFromBatchId: 'batch-2',
  committedAt: '2026-07-21T10:00:00.000Z',
})

const resolvingDraft = makeBatch({
  id: 'batch-6',
  originalName: '第八周计划与总结.xlsx',
  periodStart: '2026-07-13',
  periodEnd: '2026-07-19',
  status: 'RESOLVING',
  validRows: 18,
  unresolvedRows: 2,
  hasErrors: true,
})

const failedSnapshotBatch = makeBatch({
  id: 'batch-5',
  originalName: '第五周计划与总结.xlsx',
  periodStart: '2026-06-22',
  periodEnd: '2026-06-28',
  status: 'COMPLETED',
  version: 1,
  snapshotStatus: 'FAILED',
  snapshotError: 'snapshot worker offline',
  importedRows: 16,
  committedAt: '2026-07-06T09:05:00.000Z',
})

const expiredDraft = makeBatch({
  id: 'batch-7',
  originalName: '第四周计划与总结.xlsx',
  periodStart: '2026-06-15',
  periodEnd: '2026-06-21',
  status: 'EXPIRED',
  validRows: 0,
  totalRows: 0,
})

function renderHistory(path = '/employees?tab=imports') {
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
          <EmployeeImportHistory />
        </MemoryRouter>
      </QueryClientProvider>
    ),
  }
}

function rowOf(text: string): HTMLElement {
  const cell = screen.getByText(text)
  const row = cell.closest('tr')
  if (!row) throw new Error(`No table row found for "${text}"`)
  return row
}

describe('EmployeeImportHistory', () => {
  beforeEach(() => {
    for (const mock of Object.values(employeesApi)) mock.mockReset()
  })

  it('renders batches with file, period, version, statuses, counts and lineage', async () => {
    employeesApi.listEmployeeWorkImports.mockResolvedValue({
      data: [completedBatch, supersededBatch, restoredBatch, resolvingDraft],
      meta: { page: 1, pageSize: 10, total: 4 },
      sourceBatchIds: ['batch-3', 'batch-2', 'batch-4', 'batch-6'],
    })
    const { container } = renderHistory()

    expect(await screen.findByText('第七周计划与总结.xlsx')).toBeInTheDocument()
    expect(container.querySelector<HTMLElement>('.semi-table-body table')).toHaveStyle({
      width: '1400px',
    })
    expect(employeesApi.listEmployeeWorkImports).toHaveBeenCalledWith({ page: 1, pageSize: 10 })

    const completedRow = within(rowOf('第七周计划与总结.xlsx'))
    expect(completedRow.getByText('v3')).toBeInTheDocument()
    expect(completedRow.getByText('已完成')).toBeInTheDocument()
    expect(completedRow.getByText('已生成')).toBeInTheDocument()
    expect(completedRow.getByText('共 20 行')).toBeInTheDocument()
    expect(completedRow.getByText('导入 20 行')).toBeInTheDocument()
    expect(completedRow.getByText('替换旧版本')).toBeInTheDocument()
    expect(completedRow.getByText(/2026-07-06 ~ 2026-07-12/)).toBeInTheDocument()

    const supersededRow = within(rowOf('第六周计划与总结.xlsx'))
    expect(supersededRow.getByText('v2')).toBeInTheDocument()
    expect(supersededRow.getByText('已被替换')).toBeInTheDocument()

    const draftRow = within(rowOf('第八周计划与总结.xlsx'))
    expect(draftRow.getByText('未生成')).toBeInTheDocument()
    expect(draftRow.getByText('待关联')).toBeInTheDocument()

    const restoredRow = within(rowOf('第六周计划与总结-恢复.xlsx'))
    expect(restoredRow.getByText('v4')).toBeInTheDocument()
    expect(restoredRow.getByText('由历史版本恢复')).toBeInTheDocument()
  })

  it('shows version only for completed, superseded or restored batches', async () => {
    employeesApi.listEmployeeWorkImports.mockResolvedValue({
      data: [completedBatch, supersededBatch, restoredBatch, resolvingDraft],
      meta: { page: 1, pageSize: 10, total: 4 },
      sourceBatchIds: [],
    })
    renderHistory()

    await screen.findByText('第七周计划与总结.xlsx')
    expect(screen.getByText('v2')).toBeInTheDocument()
    expect(screen.getByText('v3')).toBeInTheDocument()
    expect(screen.getByText('v4')).toBeInTheDocument()
    expect(screen.getByText('未生成')).toBeInTheDocument()
    expect(screen.getByText('由历史版本恢复')).toBeInTheDocument()
  })

  it('downloads the source workbook and the error rows', async () => {
    const createObjectURL = vi.fn(() => 'blob:file')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    employeesApi.listEmployeeWorkImports.mockResolvedValue({
      data: [resolvingDraft],
      meta: { page: 1, pageSize: 10, total: 1 },
      sourceBatchIds: [],
    })
    employeesApi.downloadEmployeeImportSource.mockResolvedValue({
      blob: new Blob(['source']),
      fileName: '第八周计划与总结.xlsx',
    })
    employeesApi.downloadEmployeeImportErrors.mockResolvedValue({
      blob: new Blob(['errors']),
      fileName: '第八周计划与总结-错误行.xlsx',
    })
    const user = userEvent.setup()
    renderHistory()

    const row = within(await screen.findByText('第八周计划与总结.xlsx').then((cell) => {
      const element = cell.closest('tr')
      if (!element) throw new Error('row not found')
      return element
    }))
    await user.click(row.getByRole('button', { name: '下载源文件' }))
    await waitFor(() =>
      expect(employeesApi.downloadEmployeeImportSource).toHaveBeenCalledWith('batch-6')
    )

    await user.click(row.getByRole('button', { name: '下载错误行' }))
    await waitFor(() =>
      expect(employeesApi.downloadEmployeeImportErrors).toHaveBeenCalledWith('batch-6')
    )
    vi.unstubAllGlobals()
  })

  it('explains that restore creates a new version and requires confirmation', async () => {
    employeesApi.listEmployeeWorkImports.mockResolvedValue({
      data: [supersededBatch],
      meta: { page: 1, pageSize: 10, total: 1 },
      sourceBatchIds: [],
    })
    employeesApi.restoreEmployeeWorkImport.mockResolvedValue(restoredBatch)
    const user = userEvent.setup()
    const { queryClient } = renderHistory()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')

    const row = within(
      await screen.findByText('第六周计划与总结.xlsx').then((cell) => {
        const element = cell.closest('tr')
        if (!element) throw new Error('row not found')
        return element
      })
    )
    await user.click(row.getByRole('button', { name: '恢复此版本' }))

    const confirmDialog = screen.getByRole('dialog', { name: '恢复该版本？' })
    expect(confirmDialog).toHaveTextContent('全新的导入版本')
    expect(employeesApi.restoreEmployeeWorkImport).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '确认恢复' }))
    await waitFor(() =>
      expect(employeesApi.restoreEmployeeWorkImport).toHaveBeenCalledWith('batch-2')
    )
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['employees'] })
    )
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['resource-load-summary'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['reports'] })
  })

  it('rebuilds failed snapshots and archives expired drafts', async () => {
    employeesApi.listEmployeeWorkImports.mockResolvedValue({
      data: [failedSnapshotBatch, expiredDraft],
      meta: { page: 1, pageSize: 10, total: 2 },
      sourceBatchIds: [],
    })
    employeesApi.rebuildEmployeeWorkImportSnapshots.mockResolvedValue(
      makeBatch({ ...failedSnapshotBatch, snapshotStatus: 'GENERATING' })
    )
    employeesApi.archiveEmployeeWorkImport.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderHistory()

    const failedRow = within(
      await screen.findByText('第五周计划与总结.xlsx').then((cell) => {
        const element = cell.closest('tr')
        if (!element) throw new Error('row not found')
        return element
      })
    )
    expect(failedRow.getByText('生成失败')).toBeInTheDocument()
    await user.click(failedRow.getByRole('button', { name: '重建快照' }))
    await waitFor(() =>
      expect(employeesApi.rebuildEmployeeWorkImportSnapshots).toHaveBeenCalledWith('batch-5')
    )

    const expiredRow = within(
      screen.getByText('第四周计划与总结.xlsx').closest('tr') as HTMLElement
    )
    await user.click(expiredRow.getByRole('button', { name: '归档' }))
    await waitFor(() =>
      expect(employeesApi.archiveEmployeeWorkImport).toHaveBeenCalledWith('batch-7')
    )
  })

  it('requests the page stored in the URL', async () => {
    employeesApi.listEmployeeWorkImports.mockResolvedValue({
      data: [],
      meta: { page: 3, pageSize: 10, total: 0 },
      sourceBatchIds: [],
    })
    renderHistory('/employees?tab=imports&page=3')

    await waitFor(() =>
      expect(employeesApi.listEmployeeWorkImports).toHaveBeenCalledWith({ page: 3, pageSize: 10 })
    )
  })
})
