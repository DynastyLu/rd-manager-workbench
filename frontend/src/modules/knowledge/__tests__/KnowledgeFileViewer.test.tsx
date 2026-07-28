import { render, screen } from '@testing-library/react'
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
})
