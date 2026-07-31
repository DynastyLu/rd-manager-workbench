import { useEffect, useState } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal, Toast } from '@douyinfe/semi-ui'
import {
  IconComment,
  IconDelete,
  IconEdit,
  IconFile,
  IconFolder,
  IconMore,
  IconPlus,
  IconStar,
} from '@douyinfe/semi-icons'
import { archiveSession, listSessions, updateSession } from '../api'
import { knowledgeQueryKeys } from '../queryKeys'
import type { KnowledgeCursorPage, KnowledgeSession } from '../types'
import { KnowledgeEmbeddingStatus } from './KnowledgeEmbeddingStatus'
import { NovaBot } from './NovaBot'

interface Props {
  activeId?: string | null
  onSelect: (session: KnowledgeSession) => void
  onNew: () => void
  onOpenHistory?: () => void
  onNavigate?: (tab: 'documents' | 'folders') => void
}

function isKnowledgeSession(value: unknown): value is KnowledgeSession {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string' &&
    typeof (value as { title?: unknown }).title === 'string'
  )
}

function normalizeSessionPage(page: unknown): KnowledgeCursorPage<KnowledgeSession> {
  if (Array.isArray(page)) {
    const sessions = page.filter(isKnowledgeSession)
    return {
      pinned: sessions.filter((session) => session.isPinned),
      items: sessions.filter((session) => !session.isPinned),
      nextCursor: null,
    }
  }
  if (
    typeof page === 'object' &&
    page !== null &&
    Array.isArray((page as { pinned?: unknown }).pinned) &&
    Array.isArray((page as { items?: unknown }).items)
  ) {
    const candidate = page as {
      pinned: unknown[]
      items: unknown[]
      nextCursor?: unknown
    }
    return {
      pinned: candidate.pinned.filter(isKnowledgeSession),
      items: candidate.items.filter(isKnowledgeSession),
      nextCursor: typeof candidate.nextCursor === 'string' ? candidate.nextCursor : null,
    }
  }
  return { pinned: [], items: [], nextCursor: null }
}

export function KnowledgeSessionList({
  activeId,
  onSelect,
  onNew,
  onOpenHistory,
  onNavigate,
}: Props) {
  const queryClient = useQueryClient()
  const [menuId, setMenuId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [retrievalSettingsOpen, setRetrievalSettingsOpen] = useState(false)

  useEffect(() => {
    if (!retrievalSettingsOpen) return undefined
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRetrievalSettingsOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [retrievalSettingsOpen])

  const sessionsQuery = useInfiniteQuery({
    queryKey: knowledgeQueryKeys.sessionList(''),
    queryFn: ({ pageParam }) => listSessions(undefined, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      Array.isArray(lastPage) ? undefined : lastPage.nextCursor ?? undefined,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateSession>[1] }) =>
      updateSession(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.sessions })
    },
    onError: () => Toast.error('更新对话失败，请稍后重试'),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveSession(id),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.sessions })
      if (id === activeId) onNew()
      Toast.success('对话已移入回收状态')
    },
    onError: () => Toast.error('删除对话失败'),
  })

  const confirmDelete = (event: React.MouseEvent, session: KnowledgeSession) => {
    event.stopPropagation()
    Modal.confirm({
      title: '删除这条对话？',
      content: '对话将从历史记录中移除，已有知识文件不会受影响。',
      okText: '删除',
      okType: 'danger',
      onOk: () => archiveMutation.mutateAsync(session.id),
    })
  }

  const saveTitle = (session: KnowledgeSession) => {
    const title = draftTitle.trim()
    setEditingId(null)
    if (!title || title === session.title) return
    updateMutation.mutate({ id: session.id, input: { title } })
  }

  const pages = sessionsQuery.data?.pages ?? []
  const normalizedPages = pages.map(normalizeSessionPage)
  const uniqueById = (sessions: KnowledgeSession[]) => [
    ...new Map(sessions.map((session) => [session.id, session])).values(),
  ]
  const pinnedSessions = uniqueById(normalizedPages.flatMap((page) => page.pinned))
  const regularSessions = uniqueById(normalizedPages.flatMap((page) => page.items))
  const allSessions = [...pinnedSessions, ...regularSessions]

  const renderSession = (session: KnowledgeSession) => (
    <div
      key={session.id}
      className={`knowledge-assistant__session kb-chat-session-item${
        session.id === activeId
          ? ' knowledge-assistant__session--active kb-chat-session-item--active'
          : ''
      }`}
      role="button"
      tabIndex={0}
      onClick={() => {
        setMenuId(null)
        onSelect(session)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect(session)
      }}
    >
      <div className="knowledge-assistant__session-main">
        {editingId === session.id ? (
          <Input
            value={draftTitle}
            onChange={setDraftTitle}
            onClick={(event) => event.stopPropagation()}
            onBlur={() => saveTitle(session)}
            onEnterPress={() => saveTitle(session)}
          />
        ) : (
          <span title={session.title}>{session.title}</span>
        )}
      </div>
      <div className="knowledge-assistant__session-actions">
        <Button
          aria-label={`更多操作：${session.title}`}
          icon={<IconMore />}
          theme="borderless"
          onClick={(event) => {
            event.stopPropagation()
            setMenuId((current) => (current === session.id ? null : session.id))
          }}
        />
        {menuId === session.id ? (
          <div
            className="knowledge-assistant__session-menu"
            role="menu"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuId(null)
                updateMutation.mutate({
                  id: session.id,
                  input: { isPinned: !session.isPinned },
                })
              }}
            >
              <IconStar />
              {session.isPinned ? '取消置顶' : '置顶'}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuId(null)
                setEditingId(session.id)
                setDraftTitle(session.title)
              }}
            >
              <IconEdit />
              重命名
            </button>
            <button
              type="button"
              role="menuitem"
              className="is-danger"
              onClick={(event) => {
                setMenuId(null)
                confirmDelete(event, session)
              }}
            >
              <IconDelete />
              删除
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )

  return (
    <aside className="knowledge-assistant__sessions kb-chat-sidebar" aria-label="AI 对话历史">
      <div className="knowledge-assistant__sessions-header">
        <NovaBot compact label="NOVA 知识助手" />
        <div className="knowledge-assistant__sessions-title">
          <strong>NOVA</strong>
          <small>知识助手</small>
        </div>
      </div>
      <Button
        className="knowledge-assistant__new-session"
        aria-label="新建对话"
        theme="light"
        onClick={onNew}
      >
        <span className="knowledge-assistant__new-session-label">
          <span className="knowledge-assistant__new-session-icon">
            <IconPlus />
          </span>
          <span>新建对话</span>
        </span>
        <kbd>⌘ N</kbd>
      </Button>

      <nav className="knowledge-assistant__local-nav" aria-label="知识库功能">
        <button type="button" data-active="true">
          <IconComment />
          AI 问答
        </button>
        <button type="button" onClick={() => onNavigate?.('documents')}>
          <IconFile />
          文档浏览
        </button>
        <button type="button" onClick={() => onNavigate?.('folders')}>
          <IconFolder />
          本地文件夹
        </button>
      </nav>

      <div
        className="knowledge-assistant__session-list"
        onScroll={(event) => {
          const target = event.currentTarget
          if (
            sessionsQuery.hasNextPage &&
            !sessionsQuery.isFetchingNextPage &&
            target.scrollHeight - target.scrollTop - target.clientHeight < 80
          ) {
            void sessionsQuery.fetchNextPage()
          }
        }}
      >
        {sessionsQuery.isLoading ? (
          <div className="knowledge-assistant__session-hint">正在读取对话…</div>
        ) : null}
        {!sessionsQuery.isLoading && allSessions.length === 0 ? (
          <div className="knowledge-assistant__session-hint">还没有对话，点击上方开始</div>
        ) : null}
        {pinnedSessions.length > 0 ? (
          <section className="knowledge-assistant__session-group">
            <header>
              <span>已置顶</span>
            </header>
            {pinnedSessions.map(renderSession)}
          </section>
        ) : null}
        {allSessions.length > 0 ? (
          <section className="knowledge-assistant__session-group">
            <header>
              <span>对话</span>
              <div>
                <button type="button" aria-label="管理全部对话" onClick={onOpenHistory}>
                  管理
                </button>
              </div>
            </header>
            {regularSessions.map(renderSession)}
            {sessionsQuery.hasNextPage ? (
              <Button
                aria-label="加载更多对话"
                loading={sessionsQuery.isFetchingNextPage}
                onClick={() => void sessionsQuery.fetchNextPage()}
              >
                加载更多
              </Button>
            ) : null}
          </section>
        ) : null}
      </div>
      {retrievalSettingsOpen ? (
        <div
          id="nova-retrieval-settings"
          className="knowledge-assistant__retrieval-settings"
          role="dialog"
          aria-label="NOVA 本地检索设置"
        >
          <KnowledgeEmbeddingStatus />
        </div>
      ) : null}
      <button
        type="button"
        className="knowledge-assistant__sessions-footer"
        aria-label="本地检索设置"
        aria-expanded={retrievalSettingsOpen}
        aria-controls="nova-retrieval-settings"
        onClick={() => setRetrievalSettingsOpen((open) => !open)}
      >
        <span className="knowledge-assistant__sessions-logo">RD</span>
        <span>
          <strong>本地知识库</strong>
          <small>{retrievalSettingsOpen ? '收起检索设置' : '全文检索已可用'}</small>
        </span>
      </button>
    </aside>
  )
}
