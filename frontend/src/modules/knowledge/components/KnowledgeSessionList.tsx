import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Modal, Toast, Tooltip } from '@douyinfe/semi-ui';
import {
  IconDelete,
  IconEdit,
  IconPlus,
  IconSearch,
  IconStar,
} from '@douyinfe/semi-icons';
import { archiveSession, listSessions, updateSession } from '../api';
import { knowledgeQueryKeys } from '../queryKeys';
import type { KnowledgeSession } from '../types';

interface Props {
  activeId?: string | null;
  onSelect: (session: KnowledgeSession) => void;
  onNew: () => void;
}

export function KnowledgeSessionList({ activeId, onSelect, onNew }: Props) {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const sessionsQuery = useQuery({
    queryKey: knowledgeQueryKeys.sessionList(search),
    queryFn: () => listSessions(search),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: {
      id: string;
      input: Parameters<typeof updateSession>[1];
    }) => updateSession(id, input),
    onSuccess: (session) => {
      queryClient.setQueriesData<KnowledgeSession[]>(
        { queryKey: knowledgeQueryKeys.sessions },
        (current) => current?.map((item) => (item.id === session.id ? session : item)),
      );
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.sessions });
    },
    onError: () => Toast.error('更新对话失败，请稍后重试'),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveSession(id),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.sessions });
      if (id === activeId) onNew();
      Toast.success('对话已移入回收状态');
    },
    onError: () => Toast.error('删除对话失败'),
  });

  const confirmDelete = (event: React.MouseEvent, session: KnowledgeSession) => {
    event.stopPropagation();
    Modal.confirm({
      title: '删除这条对话？',
      content: '对话将从历史记录中移除，已有知识文件不会受影响。',
      okText: '删除',
      okType: 'danger',
      onOk: () => archiveMutation.mutateAsync(session.id),
    });
  };

  const saveTitle = (session: KnowledgeSession) => {
    const title = draftTitle.trim();
    setEditingId(null);
    if (!title || title === session.title) return;
    updateMutation.mutate({ id: session.id, input: { title } });
  };

  return (
    <aside className="knowledge-assistant__sessions kb-chat-sidebar" aria-label="AI 对话历史">
      <div className="knowledge-assistant__sessions-header">
        <div>
          <strong>知识助手</strong>
          <span>仅基于本地知识回答</span>
        </div>
        <Tooltip content="新建对话">
          <Button
            aria-label="新建对话"
            icon={<IconPlus />}
            theme="solid"
            type="primary"
            onClick={onNew}
          >
            新建对话
          </Button>
        </Tooltip>
      </div>
      <Input
        className="knowledge-assistant__session-search"
        prefix={<IconSearch />}
        value={searchInput}
        onChange={setSearchInput}
        showClear
        placeholder="搜索对话"
      />
      <div className="knowledge-assistant__session-list">
        {sessionsQuery.isLoading ? (
          <div className="knowledge-assistant__session-hint">正在读取对话…</div>
        ) : null}
        {!sessionsQuery.isLoading && (sessionsQuery.data?.length ?? 0) === 0 ? (
          <div className="knowledge-assistant__session-hint">
            {search ? '没有匹配的对话' : '还没有对话，点击右上角开始'}
          </div>
        ) : null}
        {(sessionsQuery.data ?? []).map((session) => (
          <div
            key={session.id}
            className={`knowledge-assistant__session kb-chat-session-item${
              session.id === activeId
                ? ' knowledge-assistant__session--active kb-chat-session-item--active'
                : ''
            }`}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(session)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onSelect(session);
            }}
          >
            <div className="knowledge-assistant__session-main">
              {editingId === session.id ? (
                <Input
                  autoFocus
                  value={draftTitle}
                  onChange={setDraftTitle}
                  onClick={(event) => event.stopPropagation()}
                  onBlur={() => saveTitle(session)}
                  onEnterPress={() => saveTitle(session)}
                />
              ) : (
                <span title={session.title}>{session.title}</span>
              )}
              <small>{new Date(session.updatedAt).toLocaleDateString('zh-CN')}</small>
            </div>
            <div className="knowledge-assistant__session-actions">
              <Tooltip content={session.isPinned ? '取消置顶' : '置顶'}>
                <Button
                  aria-label={session.isPinned ? '取消置顶' : '置顶对话'}
                  icon={<IconStar />}
                  theme="borderless"
                  className={session.isPinned ? 'is-pinned' : ''}
                  onClick={(event) => {
                    event.stopPropagation();
                    updateMutation.mutate({
                      id: session.id,
                      input: { isPinned: !session.isPinned },
                    });
                  }}
                />
              </Tooltip>
              <Tooltip content="重命名">
                <Button
                  aria-label="重命名对话"
                  icon={<IconEdit />}
                  theme="borderless"
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditingId(session.id);
                    setDraftTitle(session.title);
                  }}
                />
              </Tooltip>
              <Tooltip content="删除">
                <Button
                  aria-label="删除对话"
                  icon={<IconDelete />}
                  theme="borderless"
                  type="danger"
                  onClick={(event) => confirmDelete(event, session)}
                />
              </Tooltip>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
