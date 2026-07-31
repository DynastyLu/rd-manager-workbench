import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KnowledgeEmbeddingStatus } from '../components/KnowledgeEmbeddingStatus'

const api = vi.hoisted(() => ({
  getEmbeddingStatus: vi.fn(),
  prepareEmbeddingModel: vi.fn(),
  triggerReindex: vi.fn(),
}))

vi.mock('../api', () => api)

const unavailableStatus = {
  state: 'UNAVAILABLE' as const,
  ready: false,
  modelId: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
  dimension: 384,
  runtime: null,
  lastError: null,
  reindex: null,
}

function renderStatus() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={client}>
      <KnowledgeEmbeddingStatus />
    </QueryClientProvider>,
  )
}

describe('KnowledgeEmbeddingStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getEmbeddingStatus.mockResolvedValue(unavailableStatus)
    api.prepareEmbeddingModel.mockResolvedValue({
      ...unavailableStatus,
      state: 'READY',
      ready: true,
      runtime: 'native',
      reindexJobId: 'job-1',
    })
    api.triggerReindex.mockResolvedValue({ jobId: 'job-2' })
  })

  it('labels the setting as local semantic retrieval and explains its purpose and full-text fallback', async () => {
    renderStatus()

    expect(
      await screen.findByRole('heading', { name: '启用本地语义检索' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/近义表达和自然语言问题/)).toBeInTheDocument()
    expect(screen.getByText(/全文检索始终可用/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '启用本地语义检索' }),
    ).toBeInTheDocument()
  })

  it.each([
    ['DOWNLOADING', '正在下载模型'],
    ['LOADING', '正在加载模型'],
  ] as const)('shows the %s lifecycle state', async (state, label) => {
    api.getEmbeddingStatus.mockResolvedValue({
      ...unavailableStatus,
      state,
    })

    renderStatus()

    expect(await screen.findByText(label)).toBeInTheDocument()
  })

  it('offers a retry after failure without starting a duplicate client-side reindex', async () => {
    api.getEmbeddingStatus.mockResolvedValue({
      ...unavailableStatus,
      state: 'ERROR',
      lastError: '本地语义模型尚未准备或运行库不可用，请启用后重试。',
    })
    const user = userEvent.setup()
    renderStatus()

    await user.click(await screen.findByRole('button', { name: '重试启用' }))

    expect(api.prepareEmbeddingModel).toHaveBeenCalledTimes(1)
    expect(api.triggerReindex).not.toHaveBeenCalled()
  })

  it('does not offer enable actions before the status request completes', () => {
    api.getEmbeddingStatus.mockReturnValue(new Promise(() => undefined))

    renderStatus()

    expect(screen.getByRole('status')).toHaveTextContent('正在读取本地检索状态')
    expect(
      screen.queryByRole('button', { name: '启用本地语义检索' }),
    ).not.toBeInTheDocument()
  })

  it('shows a retryable service error without exposing backend paths', async () => {
    api.getEmbeddingStatus.mockRejectedValue(new Error('service offline'))

    renderStatus()

    expect(await screen.findByText('无法读取本地检索状态')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '启用本地语义检索' }),
    ).not.toBeInTheDocument()
  })

  it('sanitizes path-like model errors before rendering them', async () => {
    api.getEmbeddingStatus.mockResolvedValue({
      ...unavailableStatus,
      state: 'ERROR',
      lastError: 'Cannot load /Users/example/project/node_modules/runtime. Require stack: ...',
    })

    renderStatus()

    expect(
      await screen.findByText('本地语义检索暂时不可用，请重试；全文检索仍可正常使用。'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Users\/example/)).not.toBeInTheDocument()
  })

  it('shows automatic reindex progress and prevents a duplicate reindex while it is running', async () => {
    api.getEmbeddingStatus.mockResolvedValue({
      ...unavailableStatus,
      state: 'READY',
      ready: true,
      runtime: 'wasm',
      reindex: {
        indexedDocuments: 3,
        totalDocuments: 10,
        totalChunks: 24,
        complete: false,
        latestJob: {
          id: 'job-1',
          status: 'RUNNING',
          processedFiles: 3,
          totalFiles: 10,
        },
      },
    })
    renderStatus()

    expect(await screen.findByText('正在重新索引 3/10')).toBeInTheDocument()
    expect(screen.getByText('WASM 兼容模式')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新索引' })).toBeDisabled()
  })

  it('allows a manual reindex after the automatic job is no longer running', async () => {
    api.getEmbeddingStatus.mockResolvedValue({
      ...unavailableStatus,
      state: 'READY',
      ready: true,
      runtime: 'native',
      reindex: {
        indexedDocuments: 10,
        totalDocuments: 10,
        totalChunks: 42,
        complete: true,
        latestJob: {
          id: 'job-1',
          status: 'SUCCEEDED',
          processedFiles: 10,
          totalFiles: 10,
        },
      },
    })
    const user = userEvent.setup()
    renderStatus()

    await screen.findByText('原生运行模式')
    await user.click(screen.getByRole('button', { name: '重新索引' }))
    expect(api.triggerReindex).toHaveBeenCalledTimes(1)
  })

  it('warns when the model works for this session but could not be persisted locally', async () => {
    api.getEmbeddingStatus.mockResolvedValue({
      ...unavailableStatus,
      state: 'READY',
      ready: true,
      runtime: 'wasm',
      persistence: {
        state: 'DEGRADED',
        durable: false,
        message: '模型本次可用，但未能持久化到本机；重启后可能需要重新下载。',
      },
    })

    renderStatus()

    expect(
      await screen.findByText('模型本次可用，但未能持久化到本机；重启后可能需要重新下载。'),
    ).toHaveAttribute('role', 'alert')
    expect(screen.getByText('本地语义检索已启用')).toBeInTheDocument()
  })
})
