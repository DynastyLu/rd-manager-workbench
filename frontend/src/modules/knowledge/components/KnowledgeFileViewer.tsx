import { useEffect, useMemo, useState } from 'react'
import { Spin, Tag } from '@douyinfe/semi-ui'
import { IconDownload, IconFile } from '@douyinfe/semi-icons'

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

const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
])

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

export function KnowledgeFileViewer({ document }: { document: KnowledgeFileDocument }) {
  const [text, setText] = useState<string | null>(null)
  const [textError, setTextError] = useState<string | null>(null)
  const mimeType = (document.mimeType || 'application/octet-stream').split(';')[0].toLowerCase()
  const fileName = document.originalName || '未命名文件'
  const sourceUrl = `${apiBaseUrl()}/knowledge/documents/${encodeURIComponent(document.id)}/source`
  const previewUrl = `${apiBaseUrl()}/knowledge/documents/${encodeURIComponent(document.id)}/preview`
  const downloadUrl = `${sourceUrl}?download=1`
  const isText = TEXT_MIME_TYPES.has(mimeType)
  const isImage = mimeType.startsWith('image/')
  const isOfficeOrPdf = useMemo(
    () => mimeType === 'application/pdf' || /\.(docx?|xlsx?|pptx?|odt|ods|odp)$/i.test(fileName),
    [fileName, mimeType],
  )

  useEffect(() => {
    if (!isText) {
      setText(null)
      setTextError(null)
      return
    }
    const controller = new AbortController()
    setText(null)
    setTextError(null)
    void fetch(previewUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`预览读取失败（${response.status}）`)
        return response.text()
      })
      .then(setText)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setTextError(error instanceof Error ? error.message : '预览读取失败')
      })
    return () => controller.abort()
  }, [isText, previewUrl])

  return (
    <section className="knowledge-file-viewer" aria-label="原文件阅读器">
      <header className="knowledge-file-viewer__toolbar">
        <div>
          <IconFile />
          <span title={fileName}>{fileName}</span>
          <Tag size="small" color={document.previewStatus === 'FAILED' ? 'red' : 'blue'}>
            预览：{processingLabel(document.previewStatus)}
          </Tag>
          <Tag size="small" color={document.indexStatus === 'FAILED' ? 'red' : 'green'}>
            检索：{processingLabel(document.indexStatus)}
          </Tag>
        </div>
        <a
          className="knowledge-file-viewer__download"
          aria-label="下载原文件"
          href={downloadUrl}
          target="_blank"
          rel="noreferrer"
        >
          <IconDownload /> 下载原文件
        </a>
      </header>

      {document.processingError ? (
        <div className="knowledge-file-viewer__warning">{document.processingError}</div>
      ) : null}

      {isText ? (
        textError ? (
          <div className="knowledge-file-viewer__fallback">{textError}，可下载原文件查看。</div>
        ) : text === null ? (
          <div className="knowledge-file-viewer__loading"><Spin /> 正在加载文件内容…</div>
        ) : (
          <pre className="knowledge-file-viewer__text">{text}</pre>
        )
      ) : isImage ? (
        <div className="knowledge-file-viewer__image">
          <img src={previewUrl} alt={fileName} />
        </div>
      ) : isOfficeOrPdf ? (
        <iframe
          title={`${fileName} 在线预览`}
          src={previewUrl}
          className="knowledge-file-viewer__frame"
          sandbox="allow-same-origin"
        />
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
