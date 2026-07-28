import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal, Skeleton, Tag, Toast } from '@douyinfe/semi-ui'
import {
  IconChevronRight,
  IconComment,
  IconDelete,
  IconFile,
  IconFolder,
  IconPlus,
  IconSearch,
  IconStar,
  IconUpload,
} from '@douyinfe/semi-icons'
import {
  createKnowledgeSpace,
  getDocument,
  listDocuments,
  listKnowledgeSpaces,
  restoreDocument,
  trashDocument,
  updateDocument,
  type ContentDocument,
  type ContentDocumentStatus,
  type ContentDocumentType,
} from '@/modules/workbench/api/documents'
import { FileAttachments } from '@/modules/content/components/FileAttachments'
import { SaveStatus } from '@/components/workspace/SaveStatus'
import { useWorkspaceSearchParams } from '@/hooks/useWorkspaceSearchParams'
import { KnowledgeAssistantWorkspace } from '@/modules/knowledge/components/KnowledgeAssistantWorkspace'
import { KnowledgeFolderSync } from '@/modules/knowledge/components/KnowledgeFolderSync'
import { KnowledgeFileViewer } from '@/modules/knowledge/components/KnowledgeFileViewer'
import './KnowledgeHomePage.less'

type DirectoryView = 'all' | 'favorites' | 'trash'
type DocumentDraft = {
  documentId: string
  title: string
  tags: string[]
  dirty: boolean
  revision: number
}

type SaveDocumentRequest = {
  documentId: string
  revision: number
  payload: Partial<ContentDocument>
}

const TYPE_LABELS: Record<ContentDocumentType, string> = {
  DOCUMENT: '文档',
  KNOWLEDGE_PAGE: '知识页',
  MEETING_MINUTES: '会议纪要',
}

const EMPTY_TAGS: string[] = []

/** Detect whether content looks like CSV/TSV tabular data */
function looksLikeTable(text: string): boolean {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return false;
  const commaLines = lines.filter((l) => l.includes(','));
  if (commaLines.length < lines.length * 0.6) return false;
  const colCounts = commaLines.map((l) => l.split(',').length);
  const freq = new Map<number, number>();
  for (const c of colCounts) freq.set(c, (freq.get(c) ?? 0) + 1);
  let mode = 0; let maxFreq = 0;
  for (const [k, v] of freq) { if (v > maxFreq) { maxFreq = v; mode = k; } }
  return mode >= 3 && colCounts.filter((c) => c === mode).length >= colCounts.length * 0.5;
}

/** Parse CSV lines into a 2D array (handles Chinese commas too) */
function parseTable(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = (lines[0] ?? '').split(',').map((h: string) => h.trim());
  const rows = lines.slice(1).map((l) => l.split(',').map((c: string) => c.trim()));
  return { headers, rows };
}

function DocumentPreview({ content }: { content: string }) {
  if (!content || !content.trim()) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#8f959e' }}>
        暂无内容。此文件的文本未能提取，可能是图片型 PDF 或加密文件。
      </div>
    );
  }

  // Remove sheet separators added by XLSX extraction for cleaner display
  const cleanContent = content.replace(/^=== .* ===$/gm, '').trim();

  if (looksLikeTable(cleanContent)) {
    const { headers, rows } = parseTable(cleanContent);
    return (
      <div className="kb-preview-table-wrap">
        <table className="kb-preview-table">
          <thead>
            <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
        <style>{`
          .kb-preview-table-wrap {
            overflow: auto; max-height: calc(100vh - 320px);
            border: 1px solid #e5e6eb; border-radius: 8px; background: #fff;
          }
          .kb-preview-table {
            width: 100%; border-collapse: collapse; font-size: 13px;
          }
          .kb-preview-table th {
            position: sticky; top: 0; z-index: 1;
            background: #f5f6f8; color: #4e5969; font-weight: 600;
            padding: 8px 12px; text-align: left; border-bottom: 2px solid #e5e6eb;
            white-space: nowrap;
          }
          .kb-preview-table td {
            padding: 6px 12px; border-bottom: 1px solid #f0f1f3;
            color: #1f2b3d; max-width: 300px; overflow: hidden; text-overflow: ellipsis;
          }
          .kb-preview-table tr:hover td { background: #f8f9fd; }
        `}</style>
      </div>
    );
  }

  // Plain text view
  return (
    <div style={{
      padding: 24, minHeight: 200, fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      background: '#fff', borderRadius: 8, border: '1px solid #e5e6eb',
      overflow: 'auto', maxHeight: 'calc(100vh - 320px)', color: '#1f2b3d',
    }}>
      {cleanContent || '暂无内容'}
    </div>
  );
}

export default function KnowledgeHomePage() {
  const urlState = useWorkspaceSearchParams()
  const { searchParams, setSearchParams } = urlState
  const queryClient = useQueryClient()
  const selectedDocumentId = searchParams.get('documentId') ?? ''
  const focusedFileId = searchParams.get('fileId')?.trim() || undefined
  const projectId = searchParams.get('projectId') ?? undefined
  const partnerId = searchParams.get('partnerId')?.trim() || undefined
  const citationPage = Number(searchParams.get('citationPage')) || undefined
  const citationLocation = searchParams.get('citationLocation') || undefined
  const directoryView = urlState.getEnum(
    'directory',
    ['all', 'favorites', 'trash'] as const,
    'all',
  ) as DirectoryView
  const spaceId = urlState.getString('spaceId') || undefined
  const query = urlState.getString('query')
  const selectDirectory = (value: DirectoryView, selectedSpaceId?: string) => urlState.update(
    { directory: value, spaceId: selectedSpaceId },
    { defaults: { directory: 'all' } },
  )
  const setQuery = (value: string) => urlState.update({ query: value })
  const [draft, setDraft] = useState<DocumentDraft | null>(null)
  const [spaceModalOpen, setSpaceModalOpen] = useState(false)
  const [spaceName, setSpaceName] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const activeTab = urlState.getEnum('tab', ['documents', 'chat', 'folders'] as const, 'documents')
  const [chatSessionId, setChatSessionId] = useState<string | null>(null)
  const selectTab = (t: string) => urlState.update({ tab: t }, { defaults: { tab: 'documents' } })


  const spacesQuery = useQuery({ queryKey: ['knowledge-spaces'], queryFn: listKnowledgeSpaces })
  const status: ContentDocumentStatus = directoryView === 'trash' ? 'TRASHED' : 'ACTIVE'
  const documentsQuery = useQuery({
    queryKey: ['documents', { status, spaceId, projectId, query }],
    queryFn: () => listDocuments({ status, spaceId, projectId, query, pageSize: 100 }),
  })
  const documentQuery = useQuery({
    queryKey: ['document', selectedDocumentId],
    queryFn: () => getDocument(selectedDocumentId),
    enabled: Boolean(selectedDocumentId),
    refetchInterval: (queryState) => {
      const document = queryState.state.data
      return document && (
        document.indexStatus === 'PENDING'
        || document.indexStatus === 'PROCESSING'
        || document.previewStatus === 'PENDING'
        || document.previewStatus === 'PROCESSING'
      ) ? 1200 : false
    },
  })

  const visibleDocuments = useMemo(() => {
    const documents = documentsQuery.data?.data ?? []
    return directoryView === 'favorites'
      ? documents.filter((document) => document.isFavorite)
      : documents
  }, [directoryView, documentsQuery.data])

  const activeDraft: DocumentDraft | null =
    draft?.documentId === selectedDocumentId
      ? draft
      : documentQuery.data
        ? {
            documentId: documentQuery.data.id,
            title: documentQuery.data.title,
            tags: documentQuery.data.tags,
            dirty: false,
            revision: 0,
          }
        : null
  const title = activeDraft?.title ?? ''
  const tags = activeDraft?.tags ?? EMPTY_TAGS
  const dirty = activeDraft?.dirty ?? false

  const createSpaceMutation = useMutation({
    mutationFn: () => createKnowledgeSpace({ name: spaceName.trim() }),
    onSuccess: (space) => {
      selectDirectory('all', space.id)
      setSpaceName('')
      setSpaceModalOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['knowledge-spaces'] })
    },
    onError: () => Toast.error('新建知识空间失败。'),
  })

  const { mutate: saveDocument, isPending: isSaving, isError: saveError } = useMutation({
    mutationFn: ({ documentId, payload }: SaveDocumentRequest) =>
      updateDocument(documentId, payload),
    onSuccess: (_, request) => {
      setDraft((current) =>
        current?.documentId === request.documentId && current.revision === request.revision
          ? { ...current, dirty: false }
          : current
      )
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      void queryClient.invalidateQueries({ queryKey: ['document', request.documentId] })
    },
    onError: () => Toast.error('自动保存失败，内容仍保留在当前页面。'),
  })

  useEffect(() => {
    if (!dirty || !selectedDocumentId || directoryView === 'trash') return
    const revision = activeDraft?.revision ?? 0
    const timeout = window.setTimeout(() => saveDocument({
      documentId: selectedDocumentId,
      revision,
      payload: { title, tags },
    }), 900)
    return () => window.clearTimeout(timeout)
  }, [activeDraft?.revision, directoryView, dirty, saveDocument, selectedDocumentId, tags, title])

  function updateDraft(changes: Partial<Pick<DocumentDraft, 'title' | 'tags'>>) {
    setDraft((current) => {
      const base = current?.documentId === selectedDocumentId ? current : activeDraft
      if (!base) return current
      return { ...base, ...changes, dirty: true, revision: base.revision + 1 }
    })
  }

  function saveDocumentOverrides(overrides: Partial<ContentDocument>) {
    if (!selectedDocumentId) return
    saveDocument({
      documentId: selectedDocumentId,
      revision: activeDraft?.revision ?? 0,
      payload: { title, tags, ...overrides },
    })
  }

  const trashMutation = useMutation({
    mutationFn: () => trashDocument(selectedDocumentId),
    onSuccess: () => {
      setDraft(null)
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        next.delete('documentId')
        return next
      })
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
  })
  const restoreMutation = useMutation({
    mutationFn: () => restoreDocument(selectedDocumentId),
    onSuccess: () => {
      setDraft(null)
      urlState.update({ directory: 'all' }, { defaults: { directory: 'all' } })
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      void queryClient.invalidateQueries({ queryKey: ['document', selectedDocumentId] })
    },
  })

  const uploadMutation = useMutation({
    mutationFn: async (uploadFile: File) => {
      const form = new FormData()
      form.append('file', uploadFile)
      const apiBase = import.meta.env.DEV ? 'http://127.0.0.1:4311/api' : ''
      const resp = await fetch(`${apiBase}/knowledge/documents/upload`, { method: 'POST', body: form })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({})) as { error?: { message?: string } }
        throw new Error(body.error?.message || 'Upload failed')
      }
      const body = await resp.json() as {
        success: boolean
        data: {
          title: string
          documentId: string
          originalName: string
          processing: { preview: string; index: string }
        }
      }
      return body.data
    },
    onSuccess: (result) => {
      // Backend already created the document and triggered indexing.
      // Just refresh the list and navigate to the new document.
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      void queryClient.invalidateQueries({ queryKey: ['knowledge-index-status'] })
      Toast.success(`原文件已保存，正在建立检索索引：${result.title}`)
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        next.set('documentId', result.documentId)
        return next
      })
    },
    onError: () => { Toast.error('文件上传失败，请确认本地服务已启动。'); },
  })

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadFile = event.target.files?.[0]
    if (!uploadFile) return
    uploadMutation.mutate(uploadFile)
    event.target.value = ''
  }

  function openDocument(id: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('documentId', id)
      return next
    })
  }

  if (activeTab === 'folders') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e6eb', padding: '0 20px', background: '#fff' }}>
          <button onClick={() => selectTab('documents')} style={{
            padding: '12px 20px', border: 0, background: 'none', cursor: 'pointer',
            color: '#4e5969', fontSize: 14, borderBottom: '2px solid transparent',
          }}>文档浏览</button>
          <button onClick={() => selectTab('chat')} style={{
            padding: '12px 20px', border: 0, background: 'none', cursor: 'pointer',
            color: '#4e5969', fontSize: 14, borderBottom: '2px solid transparent',
          }}>AI 问答</button>
          <button data-active style={{
            padding: '12px 20px', border: 0, background: 'none', cursor: 'pointer',
            color: '#1456f0', fontSize: 14, fontWeight: 600,
            borderBottom: '2px solid #1456f0',
          }}>本地文件夹</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
          <KnowledgeFolderSync />
        </div>
      </div>
    );
  }

  if (activeTab === 'chat') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e6eb', padding: '0 20px', background: '#fff' }}>
          <button onClick={() => selectTab('documents')} style={{
            padding: '12px 20px', border: 0, background: 'none', cursor: 'pointer',
            color: '#4e5969', fontSize: 14, borderBottom: '2px solid transparent',
          }}>文档浏览</button>
          <button data-active style={{
            padding: '12px 20px', border: 0, background: 'none', cursor: 'pointer',
            color: '#1456f0', fontSize: 14, fontWeight: 600,
            borderBottom: '2px solid #1456f0',
          }}>AI 问答</button>
          <button onClick={() => selectTab('folders')} style={{
            padding: '12px 20px', border: 0, background: 'none', cursor: 'pointer',
            color: '#4e5969', fontSize: 14, borderBottom: '2px solid transparent',
          }}>本地文件夹</button>
        </div>
        <div className="knowledge-workspace--chat">
          <KnowledgeAssistantWorkspace
            sessionId={chatSessionId}
            onSessionChange={setChatSessionId}
            projectId={projectId}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="knowledge-workspace">
      <aside className="knowledge-workspace__directory" aria-label="文档目录">
        <h1>文档与知识库</h1>
        <button data-active onClick={() => selectTab('documents')}><IconFile /> 文档浏览</button>
        <button onClick={() => selectTab('chat')}><IconComment /> AI 问答</button>
        <button onClick={() => selectTab('folders')}><IconFolder /> 本地文件夹</button>
        <button data-active={directoryView === 'all' && !spaceId} onClick={() => selectDirectory('all')}><IconFile /> 全部文档</button>
        <button data-active={directoryView === 'favorites'} onClick={() => selectDirectory('favorites')}><IconStar /> 收藏</button>
        <button data-active={directoryView === 'trash'} onClick={() => selectDirectory('trash')}><IconDelete /> 回收站</button>
        <div className="knowledge-workspace__space-title">
          <span>知识空间</span>
          <button type="button" aria-label="新建知识空间" onClick={() => setSpaceModalOpen(true)}><IconPlus /></button>
        </div>
        {spacesQuery.isPending ? <Skeleton.Paragraph rows={2} /> : null}
        {spacesQuery.data?.map((space) => (
          <button key={space.id} data-active={space.id === spaceId} onClick={() => selectDirectory('all', space.id)}>
            <IconFolder /> {space.name}
          </button>
        ))}
      </aside>

      <section className="knowledge-workspace__list" aria-label="文档列表">
        <header>
          <div className="knowledge-workspace__search"><IconSearch /><input aria-label="搜索文档" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、正文和标签" /></div>
          <div>
            <input ref={fileInputRef} type="file" accept=".txt,.md,.docx,.pdf,.html,.htm,.xlsx,.xls,.csv,.json" style={{ display: 'none' }} onChange={handleFileUpload} />
            <Button aria-label="上传文件" icon={<IconUpload />} onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
              {uploadMutation.isPending ? '导入中...' : '上传文件'}
            </Button>
          </div>
        </header>
        {documentsQuery.isPending ? <Skeleton.Paragraph rows={6} /> : null}
        {documentsQuery.isError ? <div className="knowledge-workspace__state">无法读取文档，<button onClick={() => void documentsQuery.refetch()}>重试</button></div> : null}
        {!documentsQuery.isPending && !visibleDocuments.length ? <div className="knowledge-workspace__state">这里还没有文件。请上传文件，或添加本地文件夹。</div> : null}
        <ul>
          {visibleDocuments.map((document) => (
            <li key={document.id}>
              <button data-active={document.id === selectedDocumentId} onClick={() => openDocument(document.id)}>
                <span className="knowledge-workspace__document-icon">{document.type === 'KNOWLEDGE_PAGE' ? '知' : document.type === 'MEETING_MINUTES' ? '纪' : '文'}</span>
                <span><strong>{document.title}</strong><small>{TYPE_LABELS[document.type]} · {new Date(document.updatedAt).toLocaleString('zh-CN')}</small></span>
                {document.isFavorite ? <IconStar aria-label="已收藏" /> : <IconChevronRight />}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="knowledge-workspace__editor" aria-label="文件预览">
        {!selectedDocumentId ? (
          partnerId ? (
            <div className="knowledge-workspace__partner-materials">
              <header>
                <IconFile />
                <div>
                  <h2>合作方资料</h2>
                  <p>这里的附件与当前合作方直接关联，上传后可从合作方详情再次打开。</p>
                </div>
              </header>
              <FileAttachments associations={{ partnerId }} focusedFileId={focusedFileId} />
            </div>
          ) : (
            <div className="knowledge-workspace__welcome"><IconFile /><h2>选择一个文件开始阅读</h2><p>上传文件或添加本地文件夹后，可以在这里按原格式预览并用于搜索与问答。</p></div>
          )
        ) : documentQuery.isPending ? (
          <Skeleton.Paragraph rows={10} />
        ) : documentQuery.isError ? (
          <div className="knowledge-workspace__welcome"><h2>无法打开文档</h2><Button onClick={() => void documentQuery.refetch()}>重试</Button></div>
        ) : documentQuery.data ? (
          <>
            <header className="knowledge-workspace__editor-header">
              <div>
                <input
                  aria-label="文档标题"
                  value={title}
                  readOnly={directoryView === 'trash'}
                  onChange={(event) => updateDraft({ title: event.target.value })}
                />
                <SaveStatus state={saveError ? 'error' : isSaving ? 'saving' : dirty ? 'dirty' : 'saved'} />
              </div>
              <div>
                <Tag>{TYPE_LABELS[documentQuery.data.type]}</Tag>
                {directoryView === 'trash' ? (
                  <Button onClick={() => restoreMutation.mutate()}>恢复</Button>
                ) : (
                  <>
                    <Button aria-label={documentQuery.data.isFavorite ? '取消收藏' : '收藏'} icon={<IconStar />} onClick={() => saveDocumentOverrides({ isFavorite: !documentQuery.data.isFavorite })}>{documentQuery.data.isFavorite ? '取消收藏' : '收藏'}</Button>
                    <Button aria-label="移入回收站" type="danger" icon={<IconDelete />} onClick={() => trashMutation.mutate()}>移入回收站</Button>
                  </>
                )}
              </div>
            </header>
            <div className="knowledge-workspace__tags">
              <span>标签</span>
              <input
                aria-label="文档标签"
                value={tags.join('，')}
                readOnly={directoryView === 'trash'}
                onChange={(event) => updateDraft({ tags: event.target.value.split(/[，,]/).map((item) => item.trim()).filter(Boolean) })}
                placeholder="用逗号分隔标签"
              />
            </div>
            {documentQuery.data.sourceKind === 'UPLOAD' || documentQuery.data.sourceKind === 'LOCAL_FILE' ? (
              <KnowledgeFileViewer
                document={documentQuery.data}
                citationPage={citationPage}
                citationLocation={citationLocation}
              />
            ) : (
              <DocumentPreview content={documentQuery.data.plainText || ''} />
            )}
            <FileAttachments
              associations={{
                documentId: documentQuery.data.id,
              }}
              focusedFileId={focusedFileId}
            />
          </>
        ) : null}
      </section>

      <Modal
        title="新建知识空间"
        visible={spaceModalOpen}
        onCancel={() => { setSpaceModalOpen(false); setSpaceName('') }}
        footer={(
          <div className="workspace-modal-footer">
            <Button onClick={() => { setSpaceModalOpen(false); setSpaceName('') }}>取消</Button>
            <Button
              htmlType="submit"
              form="knowledge-space-form"
              aria-label="保存知识空间"
              theme="solid"
              type="primary"
              disabled={!spaceName.trim()}
              loading={createSpaceMutation.isPending}
            >
              保存
            </Button>
          </div>
        )}
        width={420}
      >
        <form
          id="knowledge-space-form"
          className="knowledge-workspace__space-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (spaceName.trim()) createSpaceMutation.mutate()
          }}
        >
          <label htmlFor="knowledge-space-name">空间名称</label>
          <Input id="knowledge-space-name" aria-label="空间名称" value={spaceName} onChange={setSpaceName} placeholder="例如：研发知识" />
        </form>
      </Modal>
    </div>
  )
}
