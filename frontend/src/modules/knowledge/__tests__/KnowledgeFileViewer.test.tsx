import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KnowledgeFileViewer } from '../components/KnowledgeFileViewer'

describe('KnowledgeFileViewer', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('loads a legacy Office preview as a validated blob instead of embedding the API response directly', async () => {
    const previewBlob = new Blob(['pdf-content'], { type: 'application/pdf' })
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
      .mockReturnValue('http://localhost/validated-office-preview')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/pdf' }),
      blob: async () => previewBlob,
    } as Response)))
    render(
      <KnowledgeFileViewer
        document={{
          id: 'document-1',
          originalName: '研发计划.doc',
          mimeType: 'application/msword',
          sourceKind: 'UPLOAD',
          previewStatus: 'READY',
          indexStatus: 'READY',
          processingError: null,
          plainText: '抽取文本仅用于检索',
        }}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTitle('研发计划.doc 在线预览')).toHaveAttribute(
        'src',
        'http://localhost/validated-office-preview',
      )
    })
    expect(createObjectURL).toHaveBeenCalledWith(previewBlob)
    expect(screen.getByRole('link', { name: '下载原文件' })).toHaveAttribute(
      'href',
      expect.stringContaining('/knowledge/documents/document-1/source?download=1'),
    )
    expect(screen.queryByText('抽取文本仅用于检索')).not.toBeInTheDocument()
  })

  it('renders an Excel file as a workbook with sheet tabs and complete cell content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        fileName: '采购意向申请表.xls',
        sheets: [
          {
            name: '表1 采购意向项目',
            rowCount: 2,
            columnCount: 3,
            rows: [
              ['采购单位名称', '采购项目名称', '预算金额'],
              ['兰州大学生命科学学院', 'X 射线辐照仪', '150'],
            ],
            columnWidths: [24, 28, 14],
            rowHeights: [30, 52],
            merges: [],
          },
          {
            name: '表2 品目编码',
            rowCount: 2,
            columnCount: 2,
            rows: [
              ['品目编码', '品目名称'],
              ['A032011', '医用 X 线设备'],
            ],
            columnWidths: [18, 30],
            rowHeights: [],
            merges: [],
          },
        ],
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })))

    render(
      <KnowledgeFileViewer
        document={{
          id: 'spreadsheet-1',
          originalName: '采购意向申请表.xls',
          mimeType: 'application/vnd.ms-excel',
          sourceKind: 'LOCAL_FILE',
          previewStatus: 'READY',
          indexStatus: 'READY',
          processingError: null,
          plainText: '',
        }}
      />,
    )

    expect(await screen.findByRole('tab', { name: '表1 采购意向项目' })).toBeInTheDocument()
    expect(screen.getByText('兰州大学生命科学学院')).toBeInTheDocument()
    expect(screen.getByText('X 射线辐照仪')).toBeInTheDocument()
    expect(screen.queryByTitle('采购意向申请表.xls 在线预览')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'B2：X 射线辐照仪' }))
    expect(screen.getByLabelText('单元格完整内容')).toHaveTextContent('X 射线辐照仪')

    await userEvent.click(screen.getByRole('tab', { name: '表2 品目编码' }))
    expect(screen.getByText('A032011')).toBeInTheDocument()
    expect(screen.getByText('医用 X 线设备')).toBeInTheDocument()
  })

  it('renders DOCX from the original package instead of converting it to PDF', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response)))

    render(
      <KnowledgeFileViewer
        document={{
          id: 'docx-1',
          originalName: '研发计划.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          sourceKind: 'UPLOAD',
          previewStatus: 'READY',
          indexStatus: 'READY',
          processingError: null,
          plainText: '',
        }}
      />,
    )

    expect(await screen.findByLabelText('Word 文档排版预览')).toBeInTheDocument()
    expect(screen.queryByTitle('研发计划.docx 在线预览')).not.toBeInTheDocument()
  })

  it('shows a friendly fallback when Office preview generation is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: false,
      error: {
        message: '未检测到 LibreOffice，Office 文件仍可下载，但暂时无法生成保真 PDF 预览。',
      },
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })))

    render(
      <KnowledgeFileViewer
        document={{
          id: 'document-1',
          originalName: '旧版研发计划.doc',
          mimeType: 'application/msword',
          sourceKind: 'UPLOAD',
          previewStatus: 'PENDING',
          indexStatus: 'READY',
          processingError: null,
          plainText: '',
        }}
      />,
    )

    expect(await screen.findByText(
      '未检测到 LibreOffice，Office 文件仍可下载，但暂时无法生成保真 PDF 预览。',
    )).toBeInTheDocument()
    expect(screen.queryByTitle('旧版研发计划.doc 在线预览')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '下载原文件' })).toBeInTheDocument()
  })

  it('uses the narrow Electron bridge to open watched local files', async () => {
    const openOriginal = vi.fn(async () => ({ opened: true }))
    window.rdWorkbenchDesktop = {
      onNotificationClicked: () => () => undefined,
      knowledge: { openOriginal },
    }
    render(
      <KnowledgeFileViewer
        document={{
          id: 'local-document-1',
          originalName: '本地周报.md',
          mimeType: 'text/markdown',
          sourceKind: 'LOCAL_FILE',
          previewStatus: 'READY',
          indexStatus: 'READY',
          processingError: null,
          plainText: '',
        }}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '用本机应用打开' }))

    expect(openOriginal).toHaveBeenCalledWith('local-document-1')
    window.rdWorkbenchDesktop = undefined
  })
})
