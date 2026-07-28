import { useEffect, useState } from 'react'
import { Spin, Tag, Toast } from '@douyinfe/semi-ui'
import { IconDownload, IconExternalOpen, IconFile } from '@douyinfe/semi-icons'
import { KnowledgeMarkdown } from './KnowledgeMarkdown'
import { KnowledgeSpreadsheetViewer } from './KnowledgeSpreadsheetViewer'
import { KnowledgeDocxViewer } from './KnowledgeDocxViewer'
import { resolveKnowledgeViewerKind } from '../viewer-kind'

type ProcessingStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'PARTIAL' | 'FAILED' | 'MISSING'

export type KnowledgeFileDocument = {
  id: string
  originalName: string | null
  mimeType: string | null
  sourceKind: 'UPLOAD' | 'LOCAL_FILE' | 'LEGACY'
  previewStatus: ProcessingStatus
  indexStatus: ProcessingStatus
  processingError: string | null
  plainText: string
}

function apiBaseUrl() {
  return window.__APP_CONFIG__?.apiBaseUrl?.replace(/\/$/, '') || 'http://127.0.0.1:4311/api'
}

function processingLabel(status: ProcessingStatus) {
  const labels: Record<ProcessingStatus, string> = {
    PENDING: '等待处理',
    PROCESSING: '处理中',
    READY: '已就绪',
    PARTIAL: '部分可用',
    FAILED: '处理失败',
    MISSING: '原文件缺失',
  }
  return labels[status]
}

async function previewErrorMessage(response: Response): Promise<string> {
  const fallback = `预览生成失败（${response.status}）`
  if (!response.headers.get('content-type')?.includes('application/json')) return fallback
  try {
    const body = await response.json() as {
      message?: string
      error?: string | { message?: string }
    }
    if (typeof body.error === 'object' && body.error?.message) return body.error.message
    if (body.message) return body.message
    if (typeof body.error === 'string') return body.error
  } catch {
    // Keep the stable fallback when an error body is malformed.
  }
  return fallback
}

function readerLabel(kind: ReturnType<typeof resolveKnowledgeViewerKind>): string {
  const labels = {
    pdf: 'PDF 原文件',
    docx: 'Word 原版式',
    'office-pdf': '兼容预览',
    spreadsheet: 'Excel 工作簿',
    markdown: 'Markdown',
    json: 'JSON',
    html: 'HTML',
    image: '图片原文件',
    text: '文本原文件',
    unsupported: '暂不支持',
  } as const
  return labels[kind]
}

function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

export function KnowledgeFileViewer({
  document,
  citationPage,
  citationLocation,
}: {
  document: KnowledgeFileDocument
  citationPage?: number
  citationLocation?: string
}) {
  const [textPreview, setTextPreview] = useState<{
    url: string
    text: string | null
    error: string | null
  }>({ url: '', text: null, error: null })
  const [binaryPreview, setBinaryPreview] = useState<{
    url: string
    objectUrl: string | null
    error: string | null
  }>({ url: '', objectUrl: null, error: null })
  const mimeType = (document.mimeType || 'application/octet-stream')
    .split(';')[0]
    ?.toLowerCase() || 'application/octet-stream'
  const fileName = document.originalName || '未命名文件'
  const sourceUrl = `${apiBaseUrl()}/knowledge/documents/${encodeURIComponent(document.id)}/source`
  const previewUrl = `${apiBaseUrl()}/knowledge/documents/${encodeURIComponent(document.id)}/preview`
  const downloadUrl = `${sourceUrl}?download=1`
  const viewerKind = resolveKnowledgeViewerKind(fileName, mimeType)
  const isTextual = ['text', 'markdown', 'json', 'html'].includes(viewerKind)
  const usesPdfReader = viewerKind === 'pdf' || viewerKind === 'office-pdf'
  const desktopKnowledge = window.rdWorkbenchDesktop?.knowledge
  const canOpenLocally = document.sourceKind === 'LOCAL_FILE'
    && desktopKnowledge !== undefined

  useEffect(() => {
    if (!isTextual) return
    const controller = new AbortController()
    void fetch(sourceUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`预览读取失败（${response.status}）`)
        return response.text()
      })
      .then((text) => setTextPreview({ url: sourceUrl, text, error: null }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setTextPreview({
          url: sourceUrl,
          text: null,
          error: error instanceof Error ? error.message : '预览读取失败',
        })
      })
    return () => controller.abort()
  }, [isTextual, sourceUrl])
  const activeText = textPreview.url === sourceUrl ? textPreview.text : null
  const activeTextError = textPreview.url === sourceUrl ? textPreview.error : null

  useEffect(() => {
    if (!usesPdfReader) return
    const controller = new AbortController()
    let objectUrl: string | null = null
    void fetch(previewUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await previewErrorMessage(response))
        const blob = await response.blob()
        if (blob.type !== 'application/pdf') {
          throw new Error('预览服务未返回有效的 PDF 文件')
        }
        objectUrl = URL.createObjectURL(blob)
        setBinaryPreview({ url: previewUrl, objectUrl, error: null })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setBinaryPreview({
          url: previewUrl,
          objectUrl: null,
          error: error instanceof Error ? error.message : '预览生成失败',
        })
      })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [usesPdfReader, previewUrl])
  const activeBinaryUrl = binaryPreview.url === previewUrl ? binaryPreview.objectUrl : null
  const activeBinaryError = binaryPreview.url === previewUrl ? binaryPreview.error : null
  const positionedBinaryUrl = activeBinaryUrl && citationPage
    ? `${activeBinaryUrl}#page=${citationPage}`
    : activeBinaryUrl

  return (
    <section className="knowledge-file-viewer" aria-label="原文件阅读器">
      <header className="knowledge-file-viewer__toolbar">
        <div>
          <IconFile />
          <span title={fileName}>{fileName}</span>
          <Tag size="small" color={viewerKind === 'unsupported' ? 'grey' : 'blue'}>
            阅读：{readerLabel(viewerKind)}
          </Tag>
          <Tag size="small" color={document.indexStatus === 'FAILED' ? 'red' : 'green'}>
            检索：{processingLabel(document.indexStatus)}
          </Tag>
        </div>
        <div>
          {canOpenLocally ? (
            <button
              type="button"
              className="knowledge-file-viewer__download"
              aria-label="用本机应用打开"
              onClick={() => {
                void desktopKnowledge?.openOriginal(document.id)
                  .then((result) => {
                    if (!result.opened) Toast.error(result.error || '无法用本机应用打开文件')
                  })
                  .catch(() => Toast.error('本地文件已移动或无法访问，请重新同步目录'))
              }}
            >
              <IconExternalOpen /> 用本机应用打开
            </button>
          ) : null}
          <a
            className="knowledge-file-viewer__download"
            aria-label="下载原文件"
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
          >
            <IconDownload /> 下载原文件
          </a>
        </div>
      </header>

      {document.processingError && viewerKind === 'office-pdf' ? (
        <div className="knowledge-file-viewer__warning">{document.processingError}</div>
      ) : null}
      {citationLocation || citationPage ? (
        <div className="knowledge-file-viewer__citation-location">
          已从问答引用定位到：{citationLocation || `第 ${citationPage} 页`}
        </div>
      ) : null}

      {viewerKind === 'spreadsheet' ? (
        <KnowledgeSpreadsheetViewer documentId={document.id} fileName={fileName} />
      ) : viewerKind === 'docx' ? (
        <KnowledgeDocxViewer sourceUrl={sourceUrl} />
      ) : isTextual ? (
        activeTextError ? (
          <div className="knowledge-file-viewer__fallback">{activeTextError}，可下载原文件查看。</div>
        ) : activeText === null ? (
          <div className="knowledge-file-viewer__loading"><Spin /> 正在加载文件内容…</div>
        ) : viewerKind === 'markdown' ? (
          <article className="knowledge-file-viewer__rich-text">
            <KnowledgeMarkdown text={activeText} />
          </article>
        ) : viewerKind === 'html' ? (
          <iframe
            title={`${fileName} HTML 内容预览`}
            srcDoc={activeText}
            sandbox=""
            className="knowledge-file-viewer__frame knowledge-file-viewer__frame--document"
          />
        ) : (
          <pre className="knowledge-file-viewer__text">
            {viewerKind === 'json' ? formatJson(activeText) : activeText}
          </pre>
        )
      ) : viewerKind === 'image' ? (
        <div className="knowledge-file-viewer__image">
          <img src={sourceUrl} alt={fileName} />
        </div>
      ) : usesPdfReader ? (
        activeBinaryError ? (
          <div className="knowledge-file-viewer__fallback">
            <IconFile />
            <strong>暂时无法在线预览</strong>
            <span>{activeBinaryError}</span>
            <span>原文件没有损坏，仍可下载或使用本机应用打开。</span>
          </div>
        ) : positionedBinaryUrl ? (
          <iframe
            title={`${fileName} 在线预览`}
            src={positionedBinaryUrl}
            className="knowledge-file-viewer__frame"
          />
        ) : (
          <div className="knowledge-file-viewer__loading"><Spin /> 正在生成文件预览…</div>
        )
      ) : (
        <div className="knowledge-file-viewer__fallback">
          <IconFile />
          <strong>此格式暂不支持在线预览</strong>
          <span>原文件已安全保存，可以下载后用本机应用打开。</span>
        </div>
      )}
    </section>
  )
}
