import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Modal } from '@douyinfe/semi-ui'
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
  mockPermanentlyDeleteDocument,
  mockClearDocumentTrash,
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
  mockPermanentlyDeleteDocument: vi.fn(),
  mockClearDocumentTrash: vi.fn(),
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
  permanentlyDeleteDocument: mockPermanentlyDeleteDocument,
  clearDocumentTrash: mockClearDocumentTrash,
  createKnowledgeSpace: mockCreateKnowledgeSpace,
}))

vi.mock('@/modules/knowledge/components/KnowledgeChatPanel', () => ({
  KnowledgeChatPanel: (props: {
    sessionId: string | null
    onSessionCreated: (id: string) => void
  }) => <div data-testid="knowledge-chat-panel" data-session-id={String(props.sessionId)} />,
}))

vi.mock('@/modules/knowledge/components/KnowledgeSessionList', () => ({
  KnowledgeSessionList: (props: {
    activeId?: string | null
    onSelect: (s: unknown) => void
    onNew: () => void
    onNavigate?: (tab: 'documents' | 'folders') => void
  }) => (
    <div data-testid="knowledge-session-list" data-active-id={String(props.activeId)}>
      <span>AI 问答</span>
      <button type="button" onClick={() => props.onNavigate?.('documents')}>
        文档浏览
      </button>
      <button type="button" onClick={() => props.onNavigate?.('folders')}>
        本地文件夹
      </button>
    </div>
  ),
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
    </QueryClientProvider>
  )
}

describe('KnowledgeHomePage', () => {
  beforeEach(() => {
    Modal.destroyAll()
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
    mockPermanentlyDeleteDocument.mockReset()
    mockClearDocumentTrash.mockReset()
    mockCreateKnowledgeSpace.mockReset()

    // Default mock implementations: getEnum reads from mockSearchParams
    mockGetEnum.mockImplementation((key: string, values: readonly string[], defaultVal: string) => {
      const val = mockSearchParams.get(key)
      if (val && (values as readonly string[]).includes(val)) return val
      return defaultVal
    })
    mockGetString.mockImplementation((key: string) => mockSearchParams.get(key) ?? undefined)

    // Default API responses
    mockListDocuments.mockResolvedValue({ data: [] })
    mockListKnowledgeSpaces.mockResolvedValue([])
    mockRestoreDocument.mockResolvedValue({})
    mockPermanentlyDeleteDocument.mockResolvedValue(undefined)
    mockClearDocumentTrash.mockResolvedValue({ deleted: 0 })
  })

  it('renders document browser tab by default', async () => {
    renderKnowledgeHome()

    // Workspace tabs
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
    expect(screen.getByTestId('knowledge-chat-panel')).toHaveAttribute('data-session-id', 'null')
  })

  it('switches between documents and chat tabs', () => {
    renderKnowledgeHome()

    // Default is documents tab
    expect(screen.getByText('文档浏览')).toBeInTheDocument()

    // Click AI 问答 tab
    fireEvent.click(screen.getByText('AI 问答'))
    expect(mockUpdate).toHaveBeenCalledWith({ tab: 'chat' }, { defaults: { tab: 'documents' } })
  })

  it('clears the selected document when switching directories', () => {
    mockSearchParams.set('documentId', 'active-document')
    mockGetDocument.mockResolvedValue({
      id: 'active-document',
      title: '当前文档',
      type: 'DOCUMENT',
      tags: [],
      status: 'ACTIVE',
    })

    renderKnowledgeHome()

    fireEvent.click(screen.getByRole('button', { name: /回收站/ }))

    expect(mockUpdate).toHaveBeenCalledWith(
      { directory: 'trash', spaceId: undefined, documentId: null },
      { defaults: { directory: 'all' } },
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

  it('renders recycle-bin controls and hides upload actions', async () => {
    mockSearchParams.set('directory', 'trash')
    mockListDocuments.mockResolvedValue({
      data: [
        {
          id: 'trash-1',
          title: '已删除的项目资料',
          type: 'DOCUMENT',
          updatedAt: '2026-07-28T08:00:00.000Z',
          isFavorite: false,
          status: 'TRASHED',
        },
      ],
    })

    renderKnowledgeHome()

    expect(await screen.findByText('已删除的项目资料')).toBeInTheDocument()
    expect(screen.getByText('1 项')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清空回收站' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '上传文件' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '选择已删除的项目资料' })).toBeInTheDocument()
  })

  it('shows a read-only recycle-bin detail without attachment upload', async () => {
    mockSearchParams.set('directory', 'trash')
    mockSearchParams.set('documentId', 'trash-1')
    const trashedDocument = {
      id: 'trash-1',
      title: '已删除的项目资料',
      type: 'DOCUMENT' as const,
      content: {},
      plainText: '不应在回收站中继续编辑',
      tags: ['项目资料'],
      isFavorite: false,
      status: 'TRASHED' as const,
      spaceId: null,
      parentId: null,
      projectId: null,
      meetingId: null,
      sourceKind: 'UPLOAD' as const,
      originalName: '项目资料.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: 100,
      sourceSha256: null,
      previewStatus: 'READY' as const,
      previewStorageKey: null,
      previewMimeType: null,
      indexStatus: 'READY' as const,
      processingError: null,
      indexedAt: null,
      trashedAt: '2026-07-28T08:00:00.000Z',
      createdAt: '2026-07-20T08:00:00.000Z',
      updatedAt: '2026-07-28T08:00:00.000Z',
    }
    mockListDocuments.mockResolvedValue({ data: [trashedDocument] })
    mockGetDocument.mockResolvedValue(trashedDocument)

    renderKnowledgeHome()

    expect(await screen.findByRole('heading', { name: '已删除的项目资料' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '恢复文档' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '永久删除文档' })).toBeInTheDocument()
    expect(screen.queryByTestId('file-attachments')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('文档标题')).not.toBeInTheDocument()
    expect(screen.getByText('恢复后可继续预览和编辑')).toBeInTheDocument()
  })

  it('permanently deletes a document after confirmation', async () => {
    mockSearchParams.set('directory', 'trash')
    mockSearchParams.set('documentId', 'trash-1')
    const trashedDocument = {
      id: 'trash-1',
      title: '待永久删除',
      type: 'DOCUMENT' as const,
      content: {},
      plainText: '',
      tags: [],
      isFavorite: false,
      status: 'TRASHED' as const,
      spaceId: null,
      parentId: null,
      projectId: null,
      meetingId: null,
      sourceKind: 'UPLOAD' as const,
      originalName: '待删除.docx',
      mimeType: null,
      fileSize: null,
      sourceSha256: null,
      previewStatus: 'MISSING' as const,
      previewStorageKey: null,
      previewMimeType: null,
      indexStatus: 'MISSING' as const,
      processingError: null,
      indexedAt: null,
      trashedAt: '2026-07-28T08:00:00.000Z',
      createdAt: '2026-07-20T08:00:00.000Z',
      updatedAt: '2026-07-28T08:00:00.000Z',
    }
    mockListDocuments.mockResolvedValue({ data: [trashedDocument] })
    mockGetDocument.mockResolvedValue(trashedDocument)
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockImplementation((options) => {
      void options.onOk?.()
      return { destroy: vi.fn(), update: vi.fn() }
    })

    renderKnowledgeHome()

    fireEvent.click(await screen.findByRole('button', { name: '永久删除文档' }))

    expect(confirmSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: '永久删除文档？',
      okText: '永久删除',
    }))
    await waitFor(() => expect(mockPermanentlyDeleteDocument).toHaveBeenCalledWith('trash-1'))
    confirmSpy.mockRestore()
  })

  it('restores selected recycle-bin documents in batch', async () => {
    mockSearchParams.set('directory', 'trash')
    mockListDocuments.mockResolvedValue({
      data: [
        {
          id: 'trash-1',
          title: '待恢复文档',
          type: 'DOCUMENT',
          updatedAt: '2026-07-28T08:00:00.000Z',
          isFavorite: false,
          status: 'TRASHED',
        },
      ],
    })

    renderKnowledgeHome()

    fireEvent.click(await screen.findByRole('checkbox', { name: '选择待恢复文档' }))
    fireEvent.click(screen.getByRole('button', { name: '批量恢复' }))

    await waitFor(() => expect(mockRestoreDocument).toHaveBeenCalledWith('trash-1'))
  })

  it('clears the recycle bin after a destructive confirmation', async () => {
    mockSearchParams.set('directory', 'trash')
    mockListDocuments.mockResolvedValue({
      data: [
        {
          id: 'trash-1',
          title: '待清空文档',
          type: 'DOCUMENT',
          updatedAt: '2026-07-28T08:00:00.000Z',
          isFavorite: false,
          status: 'TRASHED',
        },
      ],
    })
    mockClearDocumentTrash.mockResolvedValue({ deleted: 1 })
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockImplementation((options) => {
      void options.onOk?.()
      return { destroy: vi.fn(), update: vi.fn() }
    })

    renderKnowledgeHome()

    const clearButton = await screen.findByRole('button', { name: '清空回收站' })
    await waitFor(() => expect(clearButton).toBeEnabled())
    fireEvent.click(clearButton)

    expect(confirmSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: '清空回收站？',
      okText: '清空回收站',
    }))
    await waitFor(() => expect(mockClearDocumentTrash).toHaveBeenCalledTimes(1))
    confirmSpy.mockRestore()
  })
})
