import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { KnowledgeEmbeddingStatus } from '../components/KnowledgeEmbeddingStatus'

vi.mock('../api', () => ({
  getEmbeddingStatus: vi.fn().mockResolvedValue({
    state: 'UNAVAILABLE',
    ready: false,
    modelId: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    dimension: 384,
    lastError: null,
  }),
  prepareEmbeddingModel: vi.fn(),
  triggerReindex: vi.fn(),
}))

describe('KnowledgeEmbeddingStatus', () => {
  it('explains that full-text search works and offers explicit local model preparation', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <KnowledgeEmbeddingStatus />
      </QueryClientProvider>,
    )

    expect(await screen.findByText(/全文检索已可用/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下载并启用本地语义模型' })).toBeInTheDocument()
  })
})
