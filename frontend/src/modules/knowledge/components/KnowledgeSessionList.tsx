import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import type { KnowledgeSession } from '../types'
import { NovaBot } from './NovaBot'

interface Props {
  activeId?: string | null
  onSelect: (session: KnowledgeSession) => void
  onNew: () => void
  onOpenHistory?: () => void
  onNavigate?: (tab: 'documents' | 'folders') => void
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

  const sessionsQuery = useQuery({
    queryKey: knowledgeQueryKeys.sessionList(''),
    queryFn: () => listSessions(),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateSession>[1] }) =>
      updateSession(id, input),
    onSuccess: (session) => {
      queryClient.setQueriesData<KnowledgeSession[]>(
        { queryKey: knowledgeQueryKeys.sessions },
        (current) => current?.map((item) => (item.id === session.id ? session : item))
      )
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

  const allSessions = sessionsQuery.data ?? []
  const pinnedSessions = allSessions.filter((session) => session.isPinned)
  const regularSessions = allSessions.filter((session) => !session.isPinned)
  const visibleRegularSessions = regularSessions.slice(0, 10)

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

      <div className="knowledge-assistant__session-list">
        {sessionsQuery.isLoading ? (
          <div className="knowledge-assistant__session-hint">正在读取对话…</div>
        ) : null}
        {!sessionsQuery.isLoading && (sessionsQuery.data?.length ?? 0) === 0 ? (
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
                <button type="button" onClick={onOpenHistory}>
                  查看全部
                </button>
              </div>
            </header>
            {visibleRegularSessions.map(renderSession)}
          </section>
        ) : null}
      </div>
      <footer className="knowledge-assistant__sessions-footer">
        <span className="knowledge-assistant__sessions-logo">RD</span>
        <div>
          <strong>本地知识库</strong>
          <small>仅在本机检索</small>
        </div>
      </footer>
    </aside>
  )
}
