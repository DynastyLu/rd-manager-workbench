import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KnowledgeSessionList } from '../components/KnowledgeSessionList'
import type { KnowledgeSession } from '../types'

const { listSessions, archiveSession, updateSession } = vi.hoisted(() => ({
  listSessions: vi.fn(),
  archiveSession: vi.fn(),
  updateSession: vi.fn(),
}))

vi.mock('../api', () => ({ listSessions, archiveSession, updateSession }))

vi.mock('../components/KnowledgeEmbeddingStatus', () => ({
  KnowledgeEmbeddingStatus: () => <div data-testid="embedding-settings">本地语义检索设置</div>,
}))

vi.mock('@douyinfe/semi-ui', () => ({
  Button: ({ children, onClick, icon: _icon, ...props }: Record<string, unknown>) => (
    <button onClick={onClick as () => void} {...props}>
      {children as React.ReactNode}
    </button>
  ),
  Input: ({
    value,
    onChange,
    prefix: _prefix,
    showClear: _showClear,
    ...props
  }: Record<string, unknown>) => (
    <input
      value={value as string}
      onChange={(event) => (onChange as (value: string) => void)(event.target.value)}
      {...props}
    />
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  Modal: {
    confirm: ({ onOk }: { onOk?: () => unknown }) => onOk?.(),
  },
  Toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@douyinfe/semi-icons', () => ({
  IconPlus: () => null,
  IconComment: () => null,
  IconDelete: () => null,
  IconEdit: () => null,
  IconFile: () => null,
  IconFolder: () => null,
  IconMore: () => null,
  IconSearch: () => null,
  IconStar: () => null,
}))

function makeSession(overrides: Partial<KnowledgeSession> = {}): KnowledgeSession {
  return {
    id: '1',
    title: 'Test Session',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

interface RenderOptions {
  activeId?: string | null
  onSelect?: (s: KnowledgeSession) => void
  onNew?: () => void
  onOpenHistory?: () => void
}

function renderComponent(options: RenderOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const onSelect = options.onSelect ?? vi.fn()
  const onNew = options.onNew ?? vi.fn()
  const onOpenHistory = options.onOpenHistory ?? vi.fn()

  const result = render(
    <QueryClientProvider client={queryClient}>
      <KnowledgeSessionList
        activeId={options.activeId ?? null}
        onSelect={onSelect}
        onNew={onNew}
        onOpenHistory={onOpenHistory}
      />
    </QueryClientProvider>
  )

  return { ...result, onSelect, onNew, onOpenHistory }
}

describe('KnowledgeSessionList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders sessions from API', async () => {
    const sessions = [
      makeSession({ id: '1', title: 'First Session' }),
      makeSession({ id: '2', title: 'Second Session' }),
    ]
    listSessions.mockResolvedValue(sessions)

    renderComponent()

    expect(await screen.findByText('First Session')).toBeInTheDocument()
    expect(screen.getByText('Second Session')).toBeInTheDocument()
    expect(screen.getByText('对话')).toBeInTheDocument()
    expect(screen.queryByText('2026/1/1')).not.toBeInTheDocument()
  })

  it('separates pinned conversations from regular conversations', async () => {
    listSessions.mockResolvedValue([
      makeSession({ id: 'pinned', title: 'Pinned Session', isPinned: true }),
      makeSession({ id: 'regular', title: 'Regular Session', isPinned: false }),
    ])

    renderComponent()

    expect(await screen.findByText('已置顶')).toBeInTheDocument()
    expect(screen.getByText('Pinned Session')).toBeInTheDocument()
    expect(screen.getByText('Regular Session')).toBeInTheDocument()
  })

  it('renders every regular conversation in the scrollable sidebar', async () => {
    listSessions.mockResolvedValue(
      Array.from({ length: 14 }, (_, index) =>
        makeSession({
          id: `session-${index + 1}`,
          title: `历史会话 ${index + 1}`,
        })
      )
    )

    renderComponent()

    expect(await screen.findByText('历史会话 1')).toBeInTheDocument()
    expect(screen.getByText('历史会话 14')).toBeInTheDocument()
  })

  it('loads the next cursor page without repeating pinned conversations', async () => {
    listSessions
      .mockResolvedValueOnce({
        pinned: [makeSession({ id: 'pinned', title: 'Pinned Once', isPinned: true })],
        items: [makeSession({ id: 'first', title: 'First Page' })],
        nextCursor: 'opaque-next',
      })
      .mockResolvedValueOnce({
        pinned: [makeSession({ id: 'pinned', title: 'Pinned Once', isPinned: true })],
        items: [makeSession({ id: 'second', title: 'Second Page' })],
        nextCursor: null,
      })

    renderComponent()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: '加载更多对话' }))

    expect(await screen.findByText('Second Page')).toBeInTheDocument()
    expect(screen.getAllByText('Pinned Once')).toHaveLength(1)
    expect(listSessions).toHaveBeenNthCalledWith(2, undefined, 'opaque-next')
  })

  it('highlights the active session with the active class', async () => {
    const sessions = [
      makeSession({ id: '1', title: 'Active Session' }),
      makeSession({ id: '2', title: 'Inactive Session' }),
    ]
    listSessions.mockResolvedValue(sessions)

    renderComponent({ activeId: '1' })

    await screen.findByText('Active Session')

    const items = document.querySelectorAll('.kb-chat-session-item')
    expect(items).toHaveLength(2)
    expect(items[0].className).toContain('kb-chat-session-item--active')
    expect(items[1].className).not.toContain('kb-chat-session-item--active')
  })

  it('clicking a session calls onSelect with the session', async () => {
    const session = makeSession({ id: 'click-1', title: 'Click Me' })
    listSessions.mockResolvedValue([session])
    const onSelect = vi.fn()

    renderComponent({ onSelect })

    const user = userEvent.setup()
    await user.click(await screen.findByText('Click Me'))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(session)
  })

  it('clicking the new button calls onNew', async () => {
    listSessions.mockResolvedValue([])
    const onNew = vi.fn()

    renderComponent({ onNew })

    const user = userEvent.setup()
    await user.click(screen.getByText('新建对话'))

    expect(onNew).toHaveBeenCalledTimes(1)
  })

  it('opens the full history management page from the optional management action', async () => {
    listSessions.mockResolvedValue([makeSession({ id: 'history-1', title: '历史会话一' })])
    const onOpenHistory = vi.fn()

    renderComponent({ onOpenHistory })

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '管理全部对话' }))

    expect(onOpenHistory).toHaveBeenCalledTimes(1)
  })

  it('marks the plus icon so hover animation can target only the icon', async () => {
    listSessions.mockResolvedValue([])

    renderComponent()

    expect(document.querySelector('.knowledge-assistant__new-session-icon')).toBeInTheDocument()
  })

  it('opens local retrieval settings from the NOVA sidebar', async () => {
    listSessions.mockResolvedValue([])
    renderComponent()

    const user = userEvent.setup()
    expect(screen.queryByTestId('embedding-settings')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '本地检索设置' }))

    expect(screen.getByTestId('embedding-settings')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'NOVA 本地检索设置' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('embedding-settings')).not.toBeInTheDocument()
  })

  it('deleting a session calls archiveSession with the session id', async () => {
    const session = makeSession({ id: 'del-1', title: 'Deletable' })
    listSessions.mockResolvedValue([session])
    archiveSession.mockResolvedValue(undefined)

    renderComponent()

    await screen.findByText('Deletable')

    const user = userEvent.setup()
    await user.click(screen.getByLabelText('更多操作：Deletable'))
    await user.click(screen.getByRole('menuitem', { name: '删除' }))

    await waitFor(() => {
      expect(archiveSession).toHaveBeenCalledWith('del-1')
    })
  })

  it('deleting the active session calls onNew', async () => {
    const session = makeSession({ id: 'active-1', title: 'Active One' })
    listSessions.mockResolvedValue([session])
    archiveSession.mockResolvedValue(undefined)
    const onNew = vi.fn()

    renderComponent({ activeId: 'active-1', onNew })

    await screen.findByText('Active One')

    const user = userEvent.setup()
    await user.click(screen.getByLabelText('更多操作：Active One'))
    await user.click(screen.getByRole('menuitem', { name: '删除' }))

    await waitFor(() => {
      expect(onNew).toHaveBeenCalledTimes(1)
    })
  })

  it('renders no sessions gracefully when API returns empty array', async () => {
    listSessions.mockResolvedValue([])

    renderComponent()

    // NOVA brand and new button are always visible
    expect(screen.getByLabelText('NOVA 知识助手')).toBeInTheDocument()
    expect(screen.getByText('NOVA')).toBeInTheDocument()
    expect(screen.getByText('知识助手')).toBeInTheDocument()
    expect(document.querySelector('.knowledge-assistant__sessions-logo')).not.toHaveTextContent(
      'AI'
    )
    expect(screen.getByText('新建对话')).toBeInTheDocument()

    // No session items are rendered after loading completes
    await waitFor(() => {
      const items = document.querySelectorAll('.kb-chat-session-item')
      expect(items.length).toBe(0)
    })
  })
})
