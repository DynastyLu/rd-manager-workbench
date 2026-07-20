import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import IntelligenceBriefsPage from '../IntelligenceBriefsPage'

const api = vi.hoisted(() => ({
  listIntelligenceBriefs: vi.fn(),
  listIntelligenceItems: vi.fn(),
  saveIntelligenceBrief: vi.fn(),
  updateIntelligenceBrief: vi.fn(),
  archiveIntelligenceBrief: vi.fn(),
}))
vi.mock('@/modules/workbench/api/intelligence', () => api)

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <IntelligenceBriefsPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('IntelligenceBriefsPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset())
    api.listIntelligenceBriefs.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    })
    api.listIntelligenceItems.mockResolvedValue({
      data: [{ id: 'item-1', title: '芯片政策', summary: '摘要', priority: 'HIGH' }],
      meta: { page: 1, pageSize: 100, total: 1 },
    })
  })
  it('shows an honest empty state and a manual daily/weekly editor', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('尚无情报简报')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '新建简报' }))
    const dialog = screen.getByRole('dialog', { name: '简报编辑器' })
    expect(dialog).toBeInTheDocument()
    expect(dialog.querySelector('[role="combobox"]')).toBeInTheDocument()
    expect(screen.queryByText(/AI 生成|自动发送/)).not.toBeInTheDocument()
  })

  it('patches the exact brief when editing an existing entry', async () => {
    const brief = {
      id: 'brief-1', kind: 'DAILY', briefDate: '2026-07-20T00:00:00.000Z',
      title: '情报日报', introduction: null, items: [],
    }
    api.listIntelligenceBriefs.mockResolvedValue({ data: [brief], meta: { page: 1, pageSize: 20, total: 1 } })
    api.updateIntelligenceBrief.mockResolvedValue(brief)
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /情报日报/ }))
    await user.click(screen.getByRole('button', { name: '编辑与排序' }))
    await user.click(screen.getByRole('button', { name: '保存简报' }))

    expect(api.updateIntelligenceBrief).toHaveBeenCalledWith('brief-1', expect.objectContaining({
      kind: 'DAILY', briefDate: '2026-07-20', itemIds: [],
    }))
    expect(api.saveIntelligenceBrief).not.toHaveBeenCalled()
  })
})
