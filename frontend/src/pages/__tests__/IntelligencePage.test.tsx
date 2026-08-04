import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import IntelligencePage from '../IntelligencePage'

const api = vi.hoisted(() => ({
  listIntelligenceTopics: vi.fn(),
  listIntelligenceSources: vi.fn(),
  listIntelligencePlans: vi.fn(),
  listIntelligenceRuns: vi.fn(),
  listIntelligenceItems: vi.fn(),
  getIntelligenceItem: vi.fn(),
  createIntelligenceItem: vi.fn(),
  createIntelligenceTopic: vi.fn(),
  createIntelligenceSource: vi.fn(),
  createIntelligencePlan: vi.fn(),
  recordIntelligenceRun: vi.fn(),
  archiveIntelligenceItem: vi.fn(),
  convertIntelligenceItem: vi.fn(),
  updateIntelligenceItem: vi.fn(),
  updateIntelligenceTopic: vi.fn(),
  updateIntelligenceSource: vi.fn(),
  updateIntelligencePlan: vi.fn(),
  archiveIntelligenceTopic: vi.fn(),
  archiveIntelligenceSource: vi.fn(),
  archiveIntelligencePlan: vi.fn(),
}))
vi.mock('@/modules/workbench/api/intelligence', () => api)

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <IntelligencePage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('IntelligencePage', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset())
    const empty = { data: [], meta: { page: 1, pageSize: 20, total: 0 } }
    api.listIntelligenceTopics.mockResolvedValue(empty)
    api.listIntelligenceSources.mockResolvedValue(empty)
    api.listIntelligencePlans.mockResolvedValue(empty)
    api.listIntelligenceRuns.mockResolvedValue(empty)
    api.listIntelligenceItems.mockResolvedValue({
      ...empty,
      data: [
        {
          id: 'item-1',
          title: '大模型监管新规',
          summary: '政策窗口即将关闭',
          priority: 'HIGH',
          status: 'NEW',
          canonicalUrl: 'https://example.com/policy',
          publishedAt: null,
          occurrences: [
            { id: 'occ-1', source: { id: 'source-1', name: '政策数据库', kind: 'DATABASE' } },
          ],
          topics: [],
          projects: [],
          conversions: [],
        },
      ],
    })
    api.getIntelligenceItem.mockResolvedValue({
      id: 'item-1',
      title: '大模型监管新规',
      summary: '政策窗口即将关闭',
      priority: 'HIGH',
      status: 'NEW',
      canonicalUrl: 'https://example.com/policy',
      publishedAt: null,
      occurrences: [
        { id: 'occ-1', source: { id: 'source-1', name: '政策数据库', kind: 'DATABASE' } },
      ],
      topics: [],
      projects: [],
      conversions: [],
    })
  })

  it('presents a Feishu-style four-part intelligence workspace with real cards', async () => {
    renderPage()
    expect(screen.getByRole('tab', { name: '情报卡' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '主题' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '来源' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '采集计划' })).toBeInTheDocument()
    expect(await screen.findByText('大模型监管新规')).toBeInTheDocument()
    expect(screen.getByText('政策数据库')).toBeInTheDocument()
  })

  it('opens the card detail and exposes all four conversion actions', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '打开：大模型监管新规' }))
    expect(await screen.findByText('情报卡详情')).toBeInTheDocument()
    for (const name of ['转为任务', '转为风险', '转为会议议题', '转为知识页'])
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
  })

  it('ingests structured entries from a manual collection run', async () => {
    api.listIntelligencePlans.mockResolvedValue({
      data: [{
        id: 'plan-1', name: '政策采集', enabled: true, frequency: 'MANUAL',
        runAtLocalTime: null, source: { id: 'source-1', name: '政策数据库', kind: 'DATABASE' },
      }],
      meta: { page: 1, pageSize: 20, total: 1 },
    })
    api.recordIntelligenceRun.mockResolvedValue({ id: 'run-1' })
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: '采集计划' }))
    await user.click(await screen.findByRole('button', { name: '录入采集结果' }))
    const input = screen.getByRole('textbox', { name: '采集条目 JSON' })
    fireEvent.change(input, { target: { value: JSON.stringify([{ title: '政策更新', canonicalUrl: 'https://example.com/a' }]) } })
    await user.click(screen.getByRole('button', { name: '保存并入库' }))

    expect(api.recordIntelligenceRun).toHaveBeenCalledWith('plan-1', {
      status: 'SUCCEEDED',
      inputSummary: '人工采集完成',
      items: [{ title: '政策更新', canonicalUrl: 'https://example.com/a' }],
    })
  })
})
