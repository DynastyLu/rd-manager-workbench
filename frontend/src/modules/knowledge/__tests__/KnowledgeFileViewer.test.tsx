import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KnowledgeFileViewer } from '../components/KnowledgeFileViewer'

describe('KnowledgeFileViewer', () => {
  it('uses the knowledge preview and original download endpoints for uploaded Office files', () => {
    render(
      <KnowledgeFileViewer
        document={{
          id: 'document-1',
          originalName: '研发计划.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          sourceKind: 'UPLOAD',
          previewStatus: 'READY',
          indexStatus: 'READY',
          processingError: null,
          plainText: '抽取文本仅用于检索',
        }}
      />,
    )

    expect(screen.getByTitle('研发计划.docx 在线预览')).toHaveAttribute(
      'src',
      expect.stringContaining('/knowledge/documents/document-1/preview'),
    )
    expect(screen.getByRole('link', { name: '下载原文件' })).toHaveAttribute(
      'href',
      expect.stringContaining('/knowledge/documents/document-1/source?download=1'),
    )
    expect(screen.queryByText('抽取文本仅用于检索')).not.toBeInTheDocument()
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
