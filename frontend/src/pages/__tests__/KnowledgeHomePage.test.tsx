import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import KnowledgeHomePage from '../KnowledgeHomePage'

const {
  mockSearchParams,
  mockSetSearchParams,
  mockGetEnum,
  mockGetString,
  mockUpdate,
  mockListDocuments,
  mockListKnowledgeSpaces,
  mockGetDocument,
  mockCreateDocument,
  mockUpdateDocument,
  mockCreateDocumentVersion,
  mockListDocumentVersions,
  mockRestoreDocument,
  mockRestoreDocumentVersion,
  mockTrashDocument,
  mockCreateKnowledgeSpace,
} = vi.hoisted(() => ({
  mockSearchParams: new URLSearchParams(),
  mockSetSearchParams: vi.fn(),
  mockGetEnum: vi.fn((_key: string, _values: readonly string[], defaultVal: string) => defaultVal),
  mockGetString: vi.fn((_key: string) => undefined),
  mockUpdate: vi.fn(),
  mockListDocuments: vi.fn(),
  mockListKnowledgeSpaces: vi.fn(),
  mockGetDocument: vi.fn(),
  mockCreateDocument: vi.fn(),
  mockUpdateDocument: vi.fn(),
  mockCreateDocumentVersion: vi.fn(),
  mockListDocumentVersions: vi.fn(),
  mockRestoreDocument: vi.fn(),
  mockRestoreDocumentVersion: vi.fn(),
  mockTrashDocument: vi.fn(),
  mockCreateKnowledgeSpace: vi.fn(),
}))

vi.mock('@/hooks/useWorkspaceSearchParams', () => ({
  useWorkspaceSearchParams: () => ({
    searchParams: mockSearchParams,
    setSearchParams: mockSetSearchParams,
    getEnum: mockGetEnum,
    getString: mockGetString,
    update: mockUpdate,
  }),
}))

vi.mock('@/modules/workbench/api/documents', () => ({
  listDocuments: mockListDocuments,
  listKnowledgeSpaces: mockListKnowledgeSpaces,
  getDocument: mockGetDocument,
  createDocument: mockCreateDocument,
  updateDocument: mockUpdateDocument,
  createDocumentVersion: mockCreateDocumentVersion,
  listDocumentVersions: mockListDocumentVersions,
  restoreDocument: mockRestoreDocument,
  restoreDocumentVersion: mockRestoreDocumentVersion,
  trashDocument: mockTrashDocument,
  createKnowledgeSpace: mockCreateKnowledgeSpace,
}))

vi.mock('@/modules/knowledge/components/KnowledgeChatPanel', () => ({
  KnowledgeChatPanel: (props: { sessionId: string | null; onSessionCreated: (id: string) => void }) => (
    <div data-testid="knowledge-chat-panel" data-session-id={String(props.sessionId)} />
  ),
}))

vi.mock('@/modules/knowledge/components/KnowledgeSessionList', () => ({
  KnowledgeSessionList: (props: {
    activeId?: string | null
    onSelect: (s: unknown) => void
    onNew: () => void
  }) => <div data-testid="knowledge-session-list" data-active-id={String(props.activeId)} />,
}))

vi.mock('@/modules/workbench/components/extensions/AiBusinessAction', () => ({
  AiBusinessAction: (props: { buttonLabel?: string }) => (
    <button data-testid="ai-business-action">{props.buttonLabel || 'AI Action'}</button>
  ),
}))

vi.mock('@/modules/content/components/RichTextEditor', () => ({
  RichTextEditor: (props: { readOnly?: boolean }) => (
    <textarea data-testid="rich-text-editor" readOnly={props.readOnly} />
  ),
}))

vi.mock('@/modules/content/components/FileAttachments', () => ({
  FileAttachments: () => <div data-testid="file-attachments" />,
}))

vi.mock('@/components/workspace/SaveStatus', () => ({
  SaveStatus: (props: { state: string }) => <span data-testid="save-status">{props.state}</span>,
}))

vi.mock('../KnowledgeHomePage.less', () => ({}))

function renderKnowledgeHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <KnowledgeHomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('KnowledgeHomePage', () => {
  beforeEach(() => {
    // Reset URLSearchParams to empty
    Array.from(mockSearchParams.keys()).forEach((k) => mockSearchParams.delete(k))

    // Reset all mock functions
    mockSetSearchParams.mockReset()
    mockGetEnum.mockReset()
    mockGetString.mockReset()
    mockUpdate.mockReset()
    mockListDocuments.mockReset()
    mockListKnowledgeSpaces.mockReset()
    mockGetDocument.mockReset()
    mockCreateDocument.mockReset()
    mockUpdateDocument.mockReset()
    mockCreateDocumentVersion.mockReset()
    mockListDocumentVersions.mockReset()
    mockRestoreDocument.mockReset()
    mockRestoreDocumentVersion.mockReset()
    mockTrashDocument.mockReset()
    mockCreateKnowledgeSpace.mockReset()

    // Default mock implementations: getEnum reads from mockSearchParams
    mockGetEnum.mockImplementation(
      (key: string, values: readonly string[], defaultVal: string) => {
        const val = mockSearchParams.get(key)
        if (val && (values as readonly string[]).includes(val)) return val
        return defaultVal
      },
    )
    mockGetString.mockImplementation((key: string) =>
      mockSearchParams.get(key) ?? undefined,
    )

    // Default API responses
    mockListDocuments.mockResolvedValue({ data: [] })
    mockListKnowledgeSpaces.mockResolvedValue([])
  })

  it('renders document browser tab by default', async () => {
    renderKnowledgeHome()

    // Heading and tabs
    expect(screen.getByRole('heading', { name: '文档与知识库' })).toBeInTheDocument()
    expect(screen.getByText('文档浏览')).toBeInTheDocument()
    expect(screen.getByText('AI 问答')).toBeInTheDocument()

    // 全部文档 button should be active by default
    const allDocsButton = screen.getByText('全部文档')
    expect(allDocsButton).toBeInTheDocument()
    expect(allDocsButton).toHaveAttribute('data-active', 'true')

    // Directory buttons
    expect(screen.getByText('收藏')).toBeInTheDocument()
    expect(screen.getByText('回收站')).toBeInTheDocument()

    // Editor welcome state
    expect(screen.getByText('选择一个文件开始阅读')).toBeInTheDocument()

    // Wait for the documents query to resolve and show empty state
    await waitFor(() => {
      expect(screen.getByText('这里还没有文件。请上传文件，或添加本地文件夹。')).toBeInTheDocument()
    })
  })

  it('renders AI tab when selected', () => {
    mockSearchParams.set('tab', 'chat')

    renderKnowledgeHome()

    // Both tab buttons should be visible
    expect(screen.getByText('文档浏览')).toBeInTheDocument()
    expect(screen.getByText('AI 问答')).toBeInTheDocument()

    // KnowledgeSessionList and KnowledgeChatPanel should render
    expect(screen.getByTestId('knowledge-session-list')).toBeInTheDocument()
    expect(screen.getByTestId('knowledge-chat-panel')).toBeInTheDocument()

    // The chat panel receives chatSessionId (initially null)
    expect(screen.getByTestId('knowledge-chat-panel')).toHaveAttribute(
      'data-session-id',
      'null',
    )
  })

  it('switches between documents and chat tabs', () => {
    renderKnowledgeHome()

    // Default is documents tab with document browser heading visible
    expect(screen.getByRole('heading', { name: '文档与知识库' })).toBeInTheDocument()

    // Click AI 问答 tab
    fireEvent.click(screen.getByText('AI 问答'))
    expect(mockUpdate).toHaveBeenCalledWith(
      { tab: 'chat' },
      { defaults: { tab: 'documents' } },
    )
  })

  it('shows empty documents state', async () => {
    mockListDocuments.mockResolvedValue({ data: [] })

    renderKnowledgeHome()

    await waitFor(() => {
      expect(screen.getByText('这里还没有文件。请上传文件，或添加本地文件夹。')).toBeInTheDocument()
    })
  })

  it('shows document list', async () => {
    mockListDocuments.mockResolvedValue({
      data: [
        {
          id: 'doc-1',
          title: '测试文档',
          type: 'DOCUMENT' as const,
          updatedAt: '2026-01-15T08:00:00.000Z',
          isFavorite: false,
        },
        {
          id: 'doc-2',
          title: '知识页面',
          type: 'KNOWLEDGE_PAGE' as const,
          updatedAt: '2026-01-16T10:00:00.000Z',
          isFavorite: true,
        },
      ],
    })

    renderKnowledgeHome()

    expect(await screen.findByText('测试文档')).toBeInTheDocument()
    expect(screen.getByText('知识页面')).toBeInTheDocument()
  })

  it('displays knowledge spaces', async () => {
    mockListKnowledgeSpaces.mockResolvedValue([
      { id: 'space-1', name: '研发知识' },
      { id: 'space-2', name: '项目文档' },
    ])

    renderKnowledgeHome()

    expect(await screen.findByText('研发知识')).toBeInTheDocument()
    expect(screen.getByText('项目文档')).toBeInTheDocument()
  })

  it('search input is functional', async () => {
    renderKnowledgeHome()

    const searchInput = screen.getByPlaceholderText('搜索标题、正文和标签')
    expect(searchInput).toBeInTheDocument()

    fireEvent.change(searchInput, { target: { value: '测试关键词' } })
    expect(mockUpdate).toHaveBeenCalledWith({ query: '测试关键词' })
  })

  it('uses file sources instead of offering rich-text document creation', async () => {
    renderKnowledgeHome()

    expect(screen.getByRole('button', { name: '上传文件' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /新建文档/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '知识页' })).not.toBeInTheDocument()
    expect(mockCreateDocument).not.toHaveBeenCalled()
  })

  it('opens new knowledge space modal', async () => {
    renderKnowledgeHome()

    const addSpaceButton = screen.getByLabelText('新建知识空间')
    fireEvent.click(addSpaceButton)

    // Modal should appear with title and form field
    expect(screen.getByText('新建知识空间')).toBeInTheDocument()
    expect(screen.getByLabelText('空间名称')).toBeInTheDocument()

    // Form buttons should be present
    expect(screen.getByText('取消')).toBeInTheDocument()
    expect(screen.getByLabelText('保存知识空间')).toBeInTheDocument()
  })
})
