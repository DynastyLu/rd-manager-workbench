import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KnowledgeIndexHealth } from '../components/KnowledgeIndexHealth'

const api = vi.hoisted(() => ({
  getIndexHealth: vi.fn(),
  retryIndexHealthItem: vi.fn(),
  retryAllIndexHealth: vi.fn(),
  ignoreIndexHealthItem: vi.fn(),
}))

vi.mock('../api', () => api)

function renderHealth() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={client}>
      <KnowledgeIndexHealth />
    </QueryClientProvider>
  )
}

describe('KnowledgeIndexHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getIndexHealth.mockResolvedValue({
      items: [
        {
          documentId: 'doc-1',
          title: '研发计划',
          fileName: '研发计划.docx',
          category: 'CHUNKS_MISSING',
          reason: '提取内容尚未完成切分与索引',
        },
      ],
      counts: { CHUNKS_MISSING: 1 },
      excludedDocumentCount: 1,
      ignoredDocumentCount: 0,
    })
    api.retryIndexHealthItem.mockResolvedValue({ documentId: 'doc-1', status: 'READY' })
    api.retryAllIndexHealth.mockResolvedValue({ total: 1, succeeded: 1, failed: 0 })
    api.ignoreIndexHealthItem.mockResolvedValue(undefined)
  })

  it('shows the repair queue and can retry one failed document', async () => {
    const user = userEvent.setup()
    renderHealth()

    expect(await screen.findByRole('heading', { name: '索引健康' })).toBeInTheDocument()
    expect(await screen.findByText('研发计划.docx')).toBeInTheDocument()
    expect(screen.getByText('未切分')).toBeInTheDocument()
    expect(screen.getByText('NOVA 当前排除 1 个未完成索引的文件')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重试：研发计划.docx' }))
    await waitFor(() => expect(api.retryIndexHealthItem).toHaveBeenCalledWith('doc-1'))
  })

  it('supports retrying the whole visible repair queue and safe ignore', async () => {
    const user = userEvent.setup()
    renderHealth()

    await user.click(await screen.findByRole('button', { name: '重试全部失败项' }))
    expect(api.retryAllIndexHealth).toHaveBeenCalledWith(undefined)

    await user.click(screen.getByRole('button', { name: '忽略：研发计划.docx' }))
    expect(api.ignoreIndexHealthItem).toHaveBeenCalledWith('doc-1')
  })
})
