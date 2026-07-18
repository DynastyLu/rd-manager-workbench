import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ROUTES } from '@/constants/routes'
import AutomationDataPage from '../AutomationDataPage'
import KnowledgeHomePage from '../KnowledgeHomePage'
import LibraryHomePage from '../LibraryHomePage'
import MeetingsAndMaterialsPage from '../MeetingsAndMaterialsPage'

const documentApi = vi.hoisted(() => ({
  createDocument: vi.fn(),
  createDocumentVersion: vi.fn(),
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
}))

vi.mock('@/modules/workbench/api/documents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/workbench/api/documents')>()),
  ...documentApi,
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
    for (const mock of Object.values(documentApi)) mock.mockReset()
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
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    })
  })

  it('links the library to available modules and labels unavailable ones as planned', () => {
    renderPage(<LibraryHomePage />)

    expect(screen.getByRole('heading', { name: '业务库' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '申报认定' })).toHaveAttribute(
      'href',
      ROUTES.APPLICATIONS
    )
    expect(screen.getByRole('link', { name: '风险' })).toHaveAttribute(
      'href',
      ROUTES.governance('risks')
    )
    expect(screen.getByRole('link', { name: '问题' })).toHaveAttribute(
      'href',
      ROUTES.governance('issues')
    )
    expect(screen.getByRole('link', { name: '决策' })).toHaveAttribute(
      'href',
      ROUTES.governance('decisions')
    )
    expect(screen.getByRole('link', { name: '合作方' })).toHaveAttribute(
      'href',
      ROUTES.governance('partners')
    )
    expect(screen.getByText('行业情报')).toBeInTheDocument()
    expect(screen.getByText('非项目研发')).toBeInTheDocument()
    expect(screen.getAllByText('该能力正在规划中')).toHaveLength(2)
  })

  it('loads the real document and knowledge workspace instead of a planned module', async () => {
    renderPage(<KnowledgeHomePage />, '/docs?documentId=document-1')

    expect(await screen.findByRole('heading', { name: '文档与知识库' })).toBeInTheDocument()
    expect(await screen.findByText('研发知识')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('耐盐材料技术方案')).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: '文档格式工具栏' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存版本' })).toBeInTheDocument()
    expect(screen.queryByText(/规划/)).not.toBeInTheDocument()
    expect(documentApi.listDocuments).toHaveBeenCalled()
    expect(documentApi.getDocument).toHaveBeenCalledWith('document-1')
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

    expect(screen.getByRole('heading', { name: '会议与资料' })).toBeInTheDocument()
  })
})
