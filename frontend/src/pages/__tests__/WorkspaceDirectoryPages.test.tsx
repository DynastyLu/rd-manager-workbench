import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AutomationDataPage from '../AutomationDataPage'
import KnowledgeHomePage from '../KnowledgeHomePage'
import LibraryHomePage from '../LibraryHomePage'
import MeetingsAndMaterialsPage from '../MeetingsAndMaterialsPage'

const documentApi = vi.hoisted(() => ({
  createDocument: vi.fn(),
  createDocumentVersion: vi.fn(),
  createKnowledgeSpace: vi.fn(),
  getDocument: vi.fn(),
  listDocuments: vi.fn(),
  listDocumentVersions: vi.fn(),
  listFiles: vi.fn(),
  listKnowledgeSpaces: vi.fn(),
  restoreDocument: vi.fn(),
  restoreDocumentVersion: vi.fn(),
  trashDocument: vi.fn(),
  updateDocument: vi.fn(),
  uploadFile: vi.fn(),
  uploadFileVersion: vi.fn(),
}))

const baseApi = vi.hoisted(() => ({
  createBaseField: vi.fn(),
  createBaseRecord: vi.fn(),
  createBaseTable: vi.fn(),
  createBaseView: vi.fn(),
  deleteBaseView: vi.fn(),
  listBaseRecords: vi.fn(),
  listBaseWorkspaces: vi.fn(),
  updateBaseRecord: vi.fn(),
  updateBaseView: vi.fn(),
}))

vi.mock('@/modules/workbench/api/documents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/workbench/api/documents')>()),
  ...documentApi,
}))

vi.mock('@/modules/base/api', () => baseApi)
vi.mock('@/modules/workbench/components/extensions/AiBusinessAction', () => ({
  AiBusinessAction: ({ buttonLabel, objectId }: { buttonLabel: string; objectId?: string }) => (
    <button type="button" data-object-id={objectId}>{buttonLabel}</button>
  ),
}))

function renderPage(page: React.ReactNode, path = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('workspace directory pages', () => {
  beforeEach(() => {
    vi.useRealTimers()
    for (const mock of Object.values(documentApi)) mock.mockReset()
    for (const mock of Object.values(baseApi)) mock.mockReset()
    baseApi.listBaseWorkspaces.mockResolvedValue([{
      id: 'workspace-1',
      name: '研发工作台',
      description: null,
      sequence: 0,
      tables: [{
        id: 'table-projects',
        workspaceId: 'workspace-1',
        name: '项目台账',
        description: null,
        source: 'PROJECTS',
        icon: null,
        sequence: 0,
        fields: [{ id: 'field-name', tableId: 'table-projects', key: 'name', name: '项目名称', type: 'TEXT', config: {}, isPrimary: true, isRequired: true, sequence: 0 }],
        views: [{ id: 'view-grid', tableId: 'table-projects', name: '表格', type: 'GRID', config: {}, isDefault: true, sequence: 0 }],
      }],
    }])
    baseApi.listBaseRecords.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 100, total: 0 } })
    documentApi.listKnowledgeSpaces.mockResolvedValue([
      { id: 'space-1', name: '研发知识', description: null, sequence: 0 },
    ])
    documentApi.listDocuments.mockResolvedValue({
      data: [
        {
          id: 'document-1',
          title: '耐盐材料技术方案',
          type: 'DOCUMENT',
          tags: ['材料'],
          isFavorite: true,
          status: 'ACTIVE',
          updatedAt: '2026-07-18T08:00:00.000Z',
        },
      ],
      meta: { page: 1, pageSize: 50, total: 1 },
    })
    documentApi.getDocument.mockResolvedValue({
      id: 'document-1',
      title: '耐盐材料技术方案',
      type: 'DOCUMENT',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      plainText: '',
      tags: ['材料'],
      isFavorite: true,
      status: 'ACTIVE',
      spaceId: 'space-1',
      parentId: null,
      projectId: 'project-1',
      meetingId: null,
      createdAt: '2026-07-18T08:00:00.000Z',
      updatedAt: '2026-07-18T08:00:00.000Z',
    })
    documentApi.listDocumentVersions.mockResolvedValue([])
    documentApi.listFiles.mockResolvedValue({
      data: [
        {
          id: 'file-1',
          name: '技术方案.pdf',
          status: 'ACTIVE',
          documentId: 'document-1',
          projectId: null,
          meetingId: null,
          versions: [{ id: 'version-1', versionNumber: 1, originalName: '技术方案.pdf', mimeType: 'application/pdf', size: 2048, sha256: 'hash' }],
        },
      ],
      meta: { page: 1, pageSize: 20, total: 1 },
    })
  })

  it('opens the real multidimensional base workspace instead of the old business-card directory', async () => {
    renderPage(<LibraryHomePage />)

    expect(await screen.findByRole('heading', { name: '研发工作台' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '项目台账' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '业务库' })).not.toBeInTheDocument()
  })

  it('loads the real document and knowledge workspace instead of a planned module', async () => {
    renderPage(<KnowledgeHomePage />, '/docs?documentId=document-1')

    expect(await screen.findByText('研发知识')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('耐盐材料技术方案')).toBeInTheDocument()
    expect(screen.queryByRole('toolbar', { name: '文档格式工具栏' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: '文件预览' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存版本' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'AI 生成摘要' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /AI 问答/ })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '上传新版本' })).toBeInTheDocument()
    expect(screen.queryByText(/规划/)).not.toBeInTheDocument()
    expect(documentApi.listDocuments).toHaveBeenCalled()
    expect(documentApi.getDocument).toHaveBeenCalledWith('document-1')
  })

  it('does not mark a newer knowledge draft as saved when an older request finishes', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined
    let resolveSecond: ((value: unknown) => void) | undefined
    documentApi.updateDocument
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve }))
    renderPage(<KnowledgeHomePage />, '/docs?documentId=document-1')

    const title = await screen.findByDisplayValue('耐盐材料技术方案')
    vi.useFakeTimers()
    fireEvent.change(title, { target: { value: '第一次编辑' } })
    await act(() => vi.advanceTimersByTimeAsync(900))
    expect(documentApi.updateDocument).toHaveBeenCalledTimes(1)

    fireEvent.change(title, { target: { value: '第二次编辑' } })
    await act(() => vi.advanceTimersByTimeAsync(900))
    expect(documentApi.updateDocument).toHaveBeenCalledTimes(2)

    await act(async () => resolveFirst?.({ id: 'document-1' }))
    expect(screen.getByDisplayValue('第二次编辑')).toBeInTheDocument()
    expect(screen.queryByText('已保存')).not.toBeInTheDocument()

    await act(async () => resolveSecond?.({ id: 'document-1' }))
    vi.useRealTimers()
    await waitFor(() => expect(screen.getByText('已保存')).toBeInTheDocument())
  })

  it('opens a partner-scoped material workspace and forwards the association to attachments', async () => {
    renderPage(<KnowledgeHomePage />, '/docs?partnerId=partner-1')

    expect(await screen.findByRole('heading', { name: '合作方资料' })).toBeInTheDocument()
    expect(documentApi.listFiles).toHaveBeenCalledWith({ partnerId: 'partner-1' })
  })

  it('creates a real knowledge space from the directory', async () => {
    const user = userEvent.setup()
    documentApi.createKnowledgeSpace.mockResolvedValue({
      id: 'space-2',
      name: '团队规范',
      description: null,
      sequence: 1,
    })
    renderPage(<KnowledgeHomePage />, '/docs')

    await user.click(await screen.findByRole('button', { name: '新建知识空间' }))
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('空间名称'), '团队规范')
    await user.click(screen.getByRole('button', { name: '保存知识空间' }))

    expect(documentApi.createKnowledgeSpace).toHaveBeenCalledWith({ name: '团队规范' })
  })

  it('lists every planned automation and data module without requesting an API', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    renderPage(<AutomationDataPage />)

    for (const module of [
      '提醒',
      '全局搜索',
      'Excel/CSV 导入导出',
      '备份恢复',
      '审计',
      'AI',
      '外部集成',
      'LAN',
    ]) {
      expect(screen.getByText(module)).toBeInTheDocument()
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('makes the meetings route a meetings and materials directory', () => {
    renderPage(<MeetingsAndMaterialsPage />)

    expect(screen.getByRole('region', { name: '会议模块' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建会议' })).toBeInTheDocument()
  })
})
