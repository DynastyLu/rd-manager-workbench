import { useEffect, useRef, useState } from 'react'
import { Spin } from '@douyinfe/semi-ui'
import { IconFile } from '@douyinfe/semi-icons'

import { authenticatedFetch } from '@/lib/http'

export function KnowledgeDocxViewer({
  sourceUrl,
}: {
  sourceUrl: string
}) {
  const documentHost = useRef<HTMLDivElement>(null)
  const styleHost = useRef<HTMLDivElement>(null)
  const [renderState, setRenderState] = useState<{
    sourceUrl: string
    status: 'loading' | 'ready' | 'error'
    message: string
  }>({ sourceUrl: '', status: 'loading', message: '' })

  useEffect(() => {
    const controller = new AbortController()
    const renderDocument = async () => {
      try {
        const response = await authenticatedFetch(sourceUrl, { signal: controller.signal })
        if (!response.ok) throw new Error(`原文件读取失败（${response.status}）`)
        const content = await response.arrayBuffer()
        if (controller.signal.aborted || !documentHost.current || !styleHost.current) return
        const { renderAsync } = await import('docx-preview')
        if (controller.signal.aborted || !documentHost.current || !styleHost.current) return
        documentHost.current.replaceChildren()
        styleHost.current.replaceChildren()
        await renderAsync(content, documentHost.current, styleHost.current, {
          className: 'knowledge-docx',
          inWrapper: true,
          breakPages: true,
          ignoreFonts: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          useBase64URL: true,
        })
        if (!controller.signal.aborted) {
          setRenderState({ sourceUrl, status: 'ready', message: '' })
        }
      } catch (error) {
        if (controller.signal.aborted) return
        setRenderState({
          sourceUrl,
          status: 'error',
          message: error instanceof Error ? error.message : 'Word 文档读取失败',
        })
      }
    }
    void renderDocument()
    return () => controller.abort()
  }, [sourceUrl])

  const activeState = renderState.sourceUrl === sourceUrl ? renderState : {
    sourceUrl,
    status: 'loading' as const,
    message: '',
  }

  return (
    <section className="knowledge-docx-viewer" aria-label="Word 文档排版预览">
      <div ref={styleHost} />
      {activeState.status === 'loading' ? (
        <div className="knowledge-file-viewer__loading knowledge-docx-viewer__status">
          <Spin /> 正在按 Word 原版式载入全部内容…
        </div>
      ) : null}
      {activeState.status === 'error' ? (
        <div className="knowledge-file-viewer__fallback knowledge-docx-viewer__status">
          <IconFile />
          <strong>无法读取 Word 文档版式</strong>
          <span>{activeState.message}</span>
          <span>原文件仍可下载或用本机 Word 打开。</span>
        </div>
      ) : null}
      <div ref={documentHost} className="knowledge-docx-viewer__document" />
    </section>
  )
}
