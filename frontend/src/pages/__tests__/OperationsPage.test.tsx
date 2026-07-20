import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import OperationsPage from '../OperationsPage'

const api = vi.hoisted(() => ({
  archiveNonProjectRd: vi.fn(),
  archiveOutcome: vi.fn(),
  createNonProjectRd: vi.fn(),
  createNonProjectTask: vi.fn(),
  createOutcome: vi.fn(),
  getNonProjectRd: vi.fn(),
  listNonProjectRd: vi.fn(),
  suggestProject: vi.fn(),
  updateNonProjectRd: vi.fn(),
  updateOutcome: vi.fn(),
}))

vi.mock('@/modules/workbench/api/operations', () => api)
vi.mock('@/modules/content/components/FileAttachments', () => ({
  FileAttachments: ({ associations }: { associations: Record<string, string> }) => (
    <output aria-label="资料归属">{JSON.stringify(associations)}</output>
  ),
}))

const item = {
  id: 'rd-1',
  code: 'NPR-001',
  kind: 'TECH_EXPLORATION',
  title: '向量检索预研',
  objective: '验证本地检索质量',
  expectedOutcome: '形成选型结论',
  ownerName: '研发主管',
  plannedStartAt: '2026-07-20T00:00:00.000Z',
  plannedEndAt: '2026-07-30T00:00:00.000Z',
  actualStartAt: null,
  actualEndAt: null,
  plannedPersonHours: 20,
  status: 'IN_PROGRESS',
  impactScope: null,
  severity: null,
  suggestedProjectName: null,
  projectId: null,
  outcomeWaivedReason: null,
  taskId: null,
  project: null,
  task: null,
  outcomes: [
    {
      id: 'outcome-1',
      title: '技术选型记录',
      summary: null,
      status: 'DRAFT',
      verifiedAt: null,
      evidenceNote: null,
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
    },
  ],
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
}

function Location() {
  return <output aria-label="当前地址">{useLocation().pathname + useLocation().search}</output>
}

function renderPage(path = '/library/operations?tab=non-project-rd') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <OperationsPage />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('OperationsPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset())
    api.listNonProjectRd.mockResolvedValue({ data: [item], meta: { page: 1, pageSize: 20, total: 1 } })
    api.getNonProjectRd.mockResolvedValue(item)
  })

  it('organises non-project work as a searchable business workspace', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: '非项目研发' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '搜索非项目研发' })).toBeInTheDocument()
    expect(await screen.findByText('向量检索预研')).toBeInTheDocument()
    expect(screen.getByText('形成选型结论')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建事项' })).toBeInTheDocument()
  })

  it('opens an exact record deep link and exposes outcomes plus task conversion', async () => {
    renderPage('/library/operations?tab=non-project-rd&recordId=rd-1')

    expect(await screen.findByRole('dialog', { name: '非项目研发详情' })).toBeInTheDocument()
    expect(api.getNonProjectRd).toHaveBeenCalledWith('rd-1')
    expect(await screen.findByText('技术选型记录')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '加入我的工作' })).toBeInTheDocument()
  })

  it('filters the directory by project and exposes item-owned materials', async () => {
    const user = userEvent.setup()
    renderPage('/library/operations?tab=non-project-rd&recordId=rd-1&projectId=project-1')

    await waitFor(() => expect(api.listNonProjectRd).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-1' })))
    await user.click(await screen.findByRole('tab', { name: '资料' }))
    expect(screen.getByLabelText('资料归属')).toHaveTextContent('"nonProjectRdItemId":"rd-1"')
  })

  it('creates an outcome and converts the item to an idempotent task', async () => {
    api.createOutcome.mockResolvedValue({ id: 'outcome-2', title: '评审结论', status: 'DRAFT' })
    api.createNonProjectTask.mockResolvedValue({
      task: { id: 'task-1', title: '推进向量检索预研' },
      alreadyExists: false,
      source: { type: 'NON_PROJECT_RD', id: 'rd-1', path: '/library/operations?recordId=rd-1' },
    })
    const user = userEvent.setup()
    renderPage('/library/operations?recordId=rd-1')

    await user.type(await screen.findByRole('textbox', { name: '成果标题' }), '评审结论')
    await user.click(screen.getByRole('button', { name: '添加成果' }))
    await waitFor(() => expect(api.createOutcome).toHaveBeenCalledWith('rd-1', { title: '评审结论' }))

    await user.click(screen.getByRole('button', { name: '加入我的工作' }))
    await waitFor(() => expect(api.createNonProjectTask).toHaveBeenCalledWith('rd-1', expect.objectContaining({ title: '推进向量检索预研' })))
    expect(await screen.findByText('已加入“我的工作”')).toBeInTheDocument()
  })

  it('updates the URL when a row is selected', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '打开：向量检索预研' }))
    expect(screen.getByLabelText('当前地址')).toHaveTextContent('recordId=rd-1')
  })
})
