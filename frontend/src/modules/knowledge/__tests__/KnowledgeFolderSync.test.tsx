import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KnowledgeFolderSync } from '../components/KnowledgeFolderSync'

const apiMocks = vi.hoisted(() => ({
  callOrder: [] as string[],
  listFolderWatches: vi.fn(),
  rescanFolder: vi.fn(),
  getFolderProgressSnapshot: vi.fn(),
  startFolderWatch: vi.fn(),
  stopFolderWatch: vi.fn(),
}))

vi.mock('../api', () => ({
  listFolderWatches: apiMocks.listFolderWatches,
  rescanFolder: apiMocks.rescanFolder,
  getFolderProgressSnapshot: apiMocks.getFolderProgressSnapshot,
  startFolderWatch: apiMocks.startFolderWatch,
  stopFolderWatch: apiMocks.stopFolderWatch,
}))

vi.mock('../components/KnowledgeEmbeddingStatus', () => ({
  KnowledgeEmbeddingStatus: () => null,
}))

class FakeEventSource {
  static instances: FakeEventSource[] = []

  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn()

  constructor(public readonly url: string) {
    apiMocks.callOrder.push('event-source')
    FakeEventSource.instances.push(this)
  }
}

describe('KnowledgeFolderSync', () => {
  beforeEach(() => {
    apiMocks.callOrder.length = 0
    FakeEventSource.instances.length = 0
    apiMocks.listFolderWatches.mockResolvedValue([
      {
        id: 'watch-1',
        label: '研发资料',
        folderPath: '/knowledge',
        spaceId: 'space-1',
        recursive: true,
        status: 'PAUSED',
        createdAt: '2026-07-29T00:00:00.000Z',
        space: { id: 'space-1', name: '研发资料' },
        _count: { files: 48 },
      },
    ])
    apiMocks.rescanFolder.mockImplementation(async () => {
      apiMocks.callOrder.push('rescan')
      return { started: true }
    })
    apiMocks.getFolderProgressSnapshot.mockResolvedValue({
      watchId: 'watch-1',
      phase: 'scanning',
      total: 0,
      current: 0,
      scanned: 0,
      currentFile: '正在扫描文件夹...',
      percent: 0,
    })
    vi.stubGlobal('EventSource', FakeEventSource)
  })

  function renderSync() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    return render(
      <QueryClientProvider client={queryClient}>
        <KnowledgeFolderSync />
      </QueryClientProvider>
    )
  }

  it('starts the rescan before opening the progress stream', async () => {
    const user = userEvent.setup()
    renderSync()

    await user.click(await screen.findByRole('button', { name: /扫描/ }))
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0))

    expect(apiMocks.callOrder.indexOf('rescan')).toBeLessThan(
      apiMocks.callOrder.indexOf('event-source')
    )
  })

  it('shows a live discovered-file count while the total is still unknown', async () => {
    const user = userEvent.setup()
    renderSync()

    await user.click(await screen.findByRole('button', { name: /扫描/ }))
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0))
    const eventSource = FakeEventSource.instances.at(-1)!

    act(() => {
      eventSource.onmessage?.({
        data: JSON.stringify({
          watchId: 'watch-1',
          phase: 'scanning',
          total: 0,
          current: 3,
          scanned: 3,
          currentFile: '第三个文件.docx',
          percent: 0,
        }),
      })
    })

    expect(screen.getByText('已扫描 3 个文件')).toBeInTheDocument()
    expect(screen.getByText('第三个文件.docx')).toBeInTheDocument()
  })
})
