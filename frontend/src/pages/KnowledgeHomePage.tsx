import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Modal, Skeleton, Tag, Toast } from '@douyinfe/semi-ui'
import {
  IconChevronRight,
  IconDelete,
  IconFile,
  IconFolder,
  IconPlus,
  IconSave,
  IconSearch,
  IconStar,
} from '@douyinfe/semi-icons'
import { useSearchParams } from 'react-router-dom'
import {
  createDocument,
  createDocumentVersion,
  getDocument,
  listDocuments,
  listDocumentVersions,
  listKnowledgeSpaces,
  restoreDocument,
  restoreDocumentVersion,
  trashDocument,
  updateDocument,
  type ContentDocument,
  type ContentDocumentStatus,
  type ContentDocumentType,
} from '@/modules/workbench/api/documents'
import { RichTextEditor } from '@/modules/content/components/RichTextEditor'
import { FileAttachments } from '@/modules/content/components/FileAttachments'
import './KnowledgeHomePage.less'

type DirectoryView = 'all' | 'favorites' | 'trash'
type DocumentDraft = {
  documentId: string
  title: string
  content: Record<string, unknown>
  plainText: string
  tags: string[]
  dirty: boolean
}

const TYPE_LABELS: Record<ContentDocumentType, string> = {
  DOCUMENT: '文档',
  KNOWLEDGE_PAGE: '知识页',
  MEETING_MINUTES: '会议纪要',
}

const EMPTY_CONTENT = { type: 'doc', content: [{ type: 'paragraph' }] }
const EMPTY_TAGS: string[] = []

export default function KnowledgeHomePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const selectedDocumentId = searchParams.get('documentId') ?? ''
  const projectId = searchParams.get('projectId') ?? undefined
  const requestedCreate = searchParams.get('create')
  const [directoryView, setDirectoryView] = useState<DirectoryView>('all')
  const [spaceId, setSpaceId] = useState<string | undefined>()
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<DocumentDraft | null>(null)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const handledCreate = useRef<string | null>(null)

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
  })
  const versionsQuery = useQuery({
    queryKey: ['document-versions', selectedDocumentId],
    queryFn: () => listDocumentVersions(selectedDocumentId),
    enabled: Boolean(selectedDocumentId && versionsOpen),
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
            content: Object.keys(documentQuery.data.content ?? {}).length
              ? documentQuery.data.content
              : EMPTY_CONTENT,
            plainText: documentQuery.data.plainText,
            tags: documentQuery.data.tags,
            dirty: false,
          }
        : null
  const title = activeDraft?.title ?? ''
  const content = activeDraft?.content ?? EMPTY_CONTENT
  const plainText = activeDraft?.plainText ?? ''
  const tags = activeDraft?.tags ?? EMPTY_TAGS
  const dirty = activeDraft?.dirty ?? false

  const createMutation = useMutation({
    mutationFn: (type: ContentDocumentType) =>
      createDocument({
        title: type === 'KNOWLEDGE_PAGE' ? '未命名知识页' : '未命名文档',
        type,
        ...(projectId ? { projectId } : {}),
        ...(spaceId ? { spaceId } : {}),
        content: EMPTY_CONTENT,
        plainText: '',
      }),
    onSuccess: (document) => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        next.set('documentId', document.id)
        next.delete('create')
        return next
      })
    },
    onError: () => Toast.error('新建文档失败，请确认本地服务已启动。'),
  })

  useEffect(() => {
    if (!requestedCreate || handledCreate.current === requestedCreate) return
    handledCreate.current = requestedCreate
    createMutation.mutate(requestedCreate === 'knowledge' ? 'KNOWLEDGE_PAGE' : 'DOCUMENT')
  }, [createMutation, requestedCreate])

  const { mutate: saveDocument, isPending: isSaving } = useMutation({
    mutationFn: (overrides: Partial<ContentDocument> = {}) =>
      updateDocument(selectedDocumentId, {
        title,
        content,
        plainText,
        tags,
        ...overrides,
      }),
    onSuccess: () => {
      setDraft((current) =>
        current?.documentId === selectedDocumentId ? { ...current, dirty: false } : current
      )
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      void queryClient.invalidateQueries({ queryKey: ['document', selectedDocumentId] })
    },
    onError: () => Toast.error('自动保存失败，内容仍保留在当前页面。'),
  })

  useEffect(() => {
    if (!dirty || !selectedDocumentId || directoryView === 'trash') return
    const timeout = window.setTimeout(() => saveDocument({}), 900)
    return () => window.clearTimeout(timeout)
  }, [content, directoryView, dirty, plainText, saveDocument, selectedDocumentId, tags, title])

  const versionMutation = useMutation({
    mutationFn: () => createDocumentVersion(selectedDocumentId),
    onSuccess: () => {
      Toast.success('已保存一个只读版本。')
      void queryClient.invalidateQueries({ queryKey: ['document-versions', selectedDocumentId] })
    },
  })
  const restoreVersionMutation = useMutation({
    mutationFn: (versionId: string) => restoreDocumentVersion(selectedDocumentId, versionId),
    onSuccess: () => {
      setDraft(null)
      setVersionsOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['document', selectedDocumentId] })
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
  })
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
      setDirectoryView('all')
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      void queryClient.invalidateQueries({ queryKey: ['document', selectedDocumentId] })
    },
  })

  function openDocument(id: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('documentId', id)
      return next
    })
  }

  return (
    <div className="knowledge-workspace">
      <aside className="knowledge-workspace__directory" aria-label="文档目录">
        <h1>文档与知识库</h1>
        <button data-active={directoryView === 'all' && !spaceId} onClick={() => { setDirectoryView('all'); setSpaceId(undefined) }}><IconFile /> 全部文档</button>
        <button data-active={directoryView === 'favorites'} onClick={() => { setDirectoryView('favorites'); setSpaceId(undefined) }}><IconStar /> 收藏</button>
        <button data-active={directoryView === 'trash'} onClick={() => { setDirectoryView('trash'); setSpaceId(undefined) }}><IconDelete /> 回收站</button>
        <div className="knowledge-workspace__space-title"><span>知识空间</span><IconPlus /></div>
        {spacesQuery.isPending ? <Skeleton.Paragraph rows={2} /> : null}
        {spacesQuery.data?.map((space) => (
          <button key={space.id} data-active={space.id === spaceId} onClick={() => { setDirectoryView('all'); setSpaceId(space.id) }}>
            <IconFolder /> {space.name}
          </button>
        ))}
      </aside>

      <section className="knowledge-workspace__list" aria-label="文档列表">
        <header>
          <div className="knowledge-workspace__search"><IconSearch /><input aria-label="搜索文档" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、正文和标签" /></div>
          <div>
            <Button icon={<IconPlus />} onClick={() => createMutation.mutate('DOCUMENT')}>新建文档</Button>
            <Button icon={<IconPlus />} onClick={() => createMutation.mutate('KNOWLEDGE_PAGE')}>知识页</Button>
          </div>
        </header>
        {documentsQuery.isPending ? <Skeleton.Paragraph rows={6} /> : null}
        {documentsQuery.isError ? <div className="knowledge-workspace__state">无法读取文档，<button onClick={() => void documentsQuery.refetch()}>重试</button></div> : null}
        {!documentsQuery.isPending && !visibleDocuments.length ? <div className="knowledge-workspace__state">这里还没有内容。新建文档开始记录。</div> : null}
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

      <main className="knowledge-workspace__editor">
        {!selectedDocumentId ? (
          <div className="knowledge-workspace__welcome"><IconFile /><h2>选择或新建一篇文档</h2><p>项目方案、会议纪要和知识页都保存在同一处，并可关联原始对象。</p></div>
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
                  onChange={(event) => activeDraft && setDraft({ ...activeDraft, title: event.target.value, dirty: true })}
                />
                <span>{isSaving ? '正在保存…' : dirty ? '等待自动保存' : '已保存'}</span>
              </div>
              <div>
                <Tag>{TYPE_LABELS[documentQuery.data.type]}</Tag>
                {directoryView === 'trash' ? (
                  <Button onClick={() => restoreMutation.mutate()}>恢复</Button>
                ) : (
                  <>
                    <Button aria-label={documentQuery.data.isFavorite ? '取消收藏' : '收藏'} icon={<IconStar />} onClick={() => saveDocument({ isFavorite: !documentQuery.data.isFavorite })}>{documentQuery.data.isFavorite ? '取消收藏' : '收藏'}</Button>
                    <Button aria-label="保存版本" icon={<IconSave />} onClick={() => versionMutation.mutate()} loading={versionMutation.isPending}>保存版本</Button>
                    <Button onClick={() => setVersionsOpen(true)}>版本记录</Button>
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
                onChange={(event) => activeDraft && setDraft({ ...activeDraft, tags: event.target.value.split(/[，,]/).map((item) => item.trim()).filter(Boolean), dirty: true })}
                placeholder="用逗号分隔标签"
              />
            </div>
            <RichTextEditor
              value={content}
              readOnly={directoryView === 'trash'}
              onChange={(nextContent, nextPlainText) => activeDraft && setDraft({ ...activeDraft, content: nextContent, plainText: nextPlainText, dirty: true })}
            />
            <FileAttachments associations={{ documentId: documentQuery.data.id }} />
          </>
        ) : null}
      </main>

      <Modal title="版本记录" visible={versionsOpen} onCancel={() => setVersionsOpen(false)} footer={null} width={560}>
        {versionsQuery.isPending ? <Skeleton.Paragraph rows={4} /> : null}
        {!versionsQuery.isPending && !versionsQuery.data?.length ? <p>还没有显式保存的版本。</p> : null}
        <ol className="knowledge-workspace__versions">
          {versionsQuery.data?.map((version) => (
            <li key={version.id}><div><strong>版本 {version.versionNumber}</strong><span>{new Date(version.createdAt).toLocaleString('zh-CN')}</span></div><Button onClick={() => restoreVersionMutation.mutate(version.id)}>恢复此版本</Button></li>
          ))}
        </ol>
      </Modal>
    </div>
  )
}
