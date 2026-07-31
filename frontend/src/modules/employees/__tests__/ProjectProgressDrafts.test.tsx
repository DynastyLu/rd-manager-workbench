import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectProgressDrafts } from '../components/ProjectProgressDrafts'

const employeesApi = vi.hoisted(() => ({
  adoptProjectProgressDraft: vi.fn(),
  generateProjectProgressDrafts: vi.fn(),
  ignoreProjectProgressDraft: vi.fn(),
  listProjectProgressDrafts: vi.fn(),
}))

vi.mock('../api', () => employeesApi)

function renderDrafts() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={client}>
      <ProjectProgressDrafts projectId="project-1" sourceBatchId="batch-2" />
    </QueryClientProvider>
  )
}

const draft = {
  id: 'draft-1',
  projectId: 'project-1',
  sourceBatchId: 'batch-2',
  sourceVersion: 2,
  periodStartAt: '2026-07-20T00:00:00.000Z',
  periodEndAt: '2026-07-26T00:00:00.000Z',
  contentFingerprint: 'fingerprint',
  content: {
    completed: [
      {
        sourceId: 'work-1',
        employeeId: 'employee-1',
        employeeName: '李四',
        text: '权限模型已合入',
      },
    ],
    nextPlans: [],
    blockers: [],
    risks: [],
    hours: { planned: 16, actual: 14, nextPlanned: 8, missingCount: 0 },
    unlinkedRows: [{ sourceId: 'row-8', rowNumber: 8, employeeName: '王五', title: '未关联事项' }],
  },
  summary: '研发平台 2026-07-20 至 2026-07-26 周进展',
  completedResults: '李四：权限模型已合入',
  nextSteps: null,
  blockers: null,
  riskSummary: null,
  hoursSummary: '本周计划 16h，实际 14h；下周计划 8h',
  unlinkedRowCount: 1,
  status: 'PENDING',
  adoptedReportId: null,
  adoptedAt: null,
  ignoredAt: null,
  invalidatedAt: null,
  invalidationReason: null,
  createdAt: '2026-07-29T08:00:00.000Z',
  updatedAt: '2026-07-29T08:00:00.000Z',
  project: { id: 'project-1', code: 'RD-026', name: '研发平台' },
  sourceBatch: {
    id: 'batch-2',
    version: 2,
    periodStartAt: '2026-07-20T00:00:00.000Z',
    periodEndAt: '2026-07-26T00:00:00.000Z',
    restoredFromBatchId: null,
  },
}

describe('ProjectProgressDrafts', () => {
  beforeEach(() => {
    employeesApi.adoptProjectProgressDraft.mockReset()
    employeesApi.generateProjectProgressDrafts.mockReset()
    employeesApi.ignoreProjectProgressDraft.mockReset()
    employeesApi.listProjectProgressDrafts.mockReset()
    employeesApi.listProjectProgressDrafts.mockResolvedValue([draft])
    employeesApi.adoptProjectProgressDraft.mockResolvedValue({
      draft: { ...draft, status: 'ADOPTED' },
      report: { id: 'report-1' },
      alreadyAdopted: false,
    })
    employeesApi.ignoreProjectProgressDraft.mockResolvedValue({
      ...draft,
      status: 'IGNORED',
    })
    employeesApi.generateProjectProgressDrafts.mockResolvedValue([])
  })

  it('shows every project as a stacked folder and expands the hovered folder', async () => {
    const secondDraft = {
      ...draft,
      id: 'draft-2',
      projectId: 'project-2',
      summary: '材料平台本周进展',
      project: { id: 'project-2', code: 'RD-027', name: '材料平台' },
    }
    const olderDraft = {
      ...draft,
      id: 'draft-old',
      sourceBatchId: 'batch-old',
      sourceVersion: 1,
      summary: '研发平台历史进展',
      status: 'INVALIDATED',
    }
    employeesApi.listProjectProgressDrafts.mockResolvedValue([olderDraft, draft, secondDraft])
    const user = userEvent.setup()

    renderDrafts()

    const firstFolder = await screen.findByRole('button', { name: '研发平台项目文件夹' })
    const secondFolder = screen.getByRole('button', { name: '材料平台项目文件夹' })
    expect(screen.getAllByRole('button', { name: '研发平台项目文件夹' })).toHaveLength(1)
    expect(screen.getByText('1 个历史版本')).toBeInTheDocument()
    expect(screen.getByText('研发平台 2026-07-20 至 2026-07-26 周进展')).toBeInTheDocument()
    expect(screen.queryByText('研发平台历史进展')).not.toBeInTheDocument()
    expect(firstFolder).toHaveAttribute('aria-expanded', 'false')
    expect(secondFolder).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('来源：批次 batch-2 · 版本 2')).not.toBeInTheDocument()

    await user.hover(firstFolder)
    expect(firstFolder).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('来源：批次 batch-2 · 版本 2')).toBeInTheDocument()

    await user.unhover(firstFolder)
    expect(firstFolder).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows source traceability, deterministic sections, and unlinked rows after opening a folder', async () => {
    const user = userEvent.setup()
    renderDrafts()

    await user.click(await screen.findByRole('button', { name: '研发平台项目文件夹' }))
    expect(await screen.findByText('研发平台 2026-07-20 至 2026-07-26 周进展')).toBeInTheDocument()
    expect(screen.getByText('来源：批次 batch-2 · 版本 2')).toBeInTheDocument()
    expect(screen.getByText('李四：权限模型已合入')).toBeInTheDocument()
    expect(screen.getByText('1 行未关联数据')).toBeInTheDocument()
    expect(screen.getByText('第 8 行 · 王五 · 未关联事项')).toBeInTheDocument()
  })

  it('adopts once with explicit optional risk and task choices', async () => {
    renderDrafts()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '研发平台项目文件夹' }))
    await screen.findByText('研发平台 2026-07-20 至 2026-07-26 周进展')

    await user.click(screen.getByLabelText('同时创建风险'))
    await user.click(screen.getByLabelText('同时创建任务'))
    await user.click(screen.getByRole('button', { name: '采纳为正式进展' }))

    await waitFor(() =>
      expect(employeesApi.adoptProjectProgressDraft).toHaveBeenCalledWith('draft-1', {
        createRisks: true,
        createTasks: true,
      })
    )
  })

  it('hides publish actions when canPublish is false', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ProjectProgressDrafts projectId="project-1" sourceBatchId="batch-2" canPublish={false} />
      </QueryClientProvider>
    )

    await user.click(await screen.findByRole('button', { name: '研发平台项目文件夹' }))
    await screen.findByText('研发平台 2026-07-20 至 2026-07-26 周进展')

    expect(screen.queryByRole('button', { name: '采纳为正式进展' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '忽略' })).not.toBeInTheDocument()
  })

  it('shows publish actions by default', async () => {
    const user = userEvent.setup()
    renderDrafts()

    await user.click(await screen.findByRole('button', { name: '研发平台项目文件夹' }))
    await screen.findByText('研发平台 2026-07-20 至 2026-07-26 周进展')

    expect(screen.getByRole('button', { name: '采纳为正式进展' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '忽略' })).toBeInTheDocument()
  })
})
