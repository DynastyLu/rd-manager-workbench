import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Modal, Toast } from '@douyinfe/semi-ui';
import {
  IconClose,
  IconDelete,
  IconEdit,
  IconSearch,
  IconStar,
} from '@douyinfe/semi-icons';
import { archiveSession, listSessions, updateSession } from '../api';
import { knowledgeQueryKeys } from '../queryKeys';
import type { KnowledgeSession } from '../types';

interface Props {
  onClose: () => void;
  onSelect: (session: KnowledgeSession) => void;
}

interface SessionGroup {
  label: string;
  sessions: KnowledgeSession[];
}

const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

function sessionDate(session: KnowledgeSession) {
  return new Date(session.lastMessageAt ?? session.updatedAt);
}

function groupLabel(date: Date, now: Date) {
  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) {
    return '本月';
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月`;
  }
  return `${date.getFullYear()}年`;
}

function formatSessionDate(date: Date, now: Date) {
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  if (sameDay) return '今天';

  const elapsedDays = Math.floor(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime())
      / 86_400_000,
  );
  if (elapsedDays > 0 && elapsedDays < 7) return weekdays[date.getDay()];
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function groupSessions(sessions: KnowledgeSession[], now = new Date()): SessionGroup[] {
  const groups = new Map<string, KnowledgeSession[]>();
  sessions.forEach((session) => {
    const label = groupLabel(sessionDate(session), now);
    const current = groups.get(label) ?? [];
    current.push(session);
    groups.set(label, current);
  });
  return Array.from(groups, ([label, items]) => ({ label, sessions: items }));
}

export function KnowledgeSessionHistory({ onClose, onSelect }: Props) {
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
    queryFn: () => listSessions(search, undefined, 100),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: {
      id: string;
      input: Parameters<typeof updateSession>[1];
    }) => updateSession(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.sessions });
    },
    onError: () => Toast.error('更新对话失败，请稍后重试'),
  });

  const archiveMutation = useMutation({
    mutationFn: archiveSession,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.sessions });
      Toast.success('对话已删除');
    },
    onError: () => Toast.error('删除对话失败'),
  });

  const sessions = useMemo(() => {
    const page = sessionsQuery.data;
    if (!page) return [];
    if (Array.isArray(page)) return page as KnowledgeSession[];
    return [...page.pinned, ...page.items];
  }, [sessionsQuery.data]);
  const groups = useMemo(() => groupSessions(sessions), [sessions]);

  const saveTitle = (session: KnowledgeSession) => {
    const title = draftTitle.trim();
    setEditingId(null);
    if (!title || title === session.title) return;
    updateMutation.mutate({ id: session.id, input: { title } });
  };

  const confirmDelete = (event: React.MouseEvent, session: KnowledgeSession) => {
    event.stopPropagation();
    Modal.confirm({
      title: '删除这条对话？',
      content: '删除后将从历史记录中移除，知识文件不会受影响。',
      okText: '删除',
      okType: 'danger',
      onOk: () => archiveMutation.mutateAsync(session.id),
    });
  };

  return (
    <section className="knowledge-session-history" aria-label="历史会话">
      <Button
        className="knowledge-session-history__close"
        aria-label="关闭历史会话"
        icon={<IconClose />}
        theme="borderless"
        onClick={onClose}
      />
      <div className="knowledge-session-history__inner">
        <h2>历史会话</h2>
        <Input
          className="knowledge-session-history__search"
          prefix={<IconSearch />}
          value={searchInput}
          onChange={setSearchInput}
          showClear
          placeholder="搜索历史会话"
        />

        <div className="knowledge-session-history__content">
          {sessionsQuery.isLoading ? (
            <div className="knowledge-session-history__state">正在读取历史会话…</div>
          ) : null}
          {sessionsQuery.isError ? (
            <div className="knowledge-session-history__state">历史会话读取失败，请稍后重试。</div>
          ) : null}
          {!sessionsQuery.isLoading && !sessionsQuery.isError && sessions.length === 0 ? (
            <div className="knowledge-session-history__state">
              {search ? '没有找到匹配的历史会话' : '还没有历史会话'}
            </div>
          ) : null}

          {groups.map((group) => (
            <section className="knowledge-session-history__group" key={group.label}>
              <h3>{group.label}</h3>
              <div className="knowledge-session-history__group-list">
                {group.sessions.map((session) => {
                  const updatedAt = sessionDate(session);
                  return (
                    <div
                      key={session.id}
                      className="knowledge-session-history__card"
                      role="button"
                      tabIndex={0}
                      aria-label={`打开会话：${session.title}`}
                      onClick={() => onSelect(session)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') onSelect(session);
                      }}
                    >
                      <span className="knowledge-session-history__selector" aria-hidden="true" />
                      <div className="knowledge-session-history__card-body">
                        <header>
                          <div className="knowledge-session-history__title">
                            {editingId === session.id ? (
                              <Input
                                value={draftTitle}
                                onChange={setDraftTitle}
                                onClick={(event) => event.stopPropagation()}
                                onBlur={() => saveTitle(session)}
                                onEnterPress={() => saveTitle(session)}
                              />
                            ) : (
                              <>
                                <strong>{session.title}</strong>
                                <button
                                  type="button"
                                  aria-label={`重命名：${session.title}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setEditingId(session.id);
                                    setDraftTitle(session.title);
                                  }}
                                >
                                  <IconEdit />
                                </button>
                              </>
                            )}
                          </div>
                          <time dateTime={updatedAt.toISOString()}>
                            {formatSessionDate(updatedAt, new Date())}
                          </time>
                        </header>
                        {session.preview ? <p>{session.preview}</p> : <p className="is-empty">暂无内容摘要</p>}
                      </div>
                      <div className="knowledge-session-history__actions">
                        <button
                          type="button"
                          aria-label={`${session.isPinned ? '取消置顶' : '置顶'}：${session.title}`}
                          className={session.isPinned ? 'is-pinned' : undefined}
                          onClick={(event) => {
                            event.stopPropagation();
                            updateMutation.mutate({
                              id: session.id,
                              input: { isPinned: !session.isPinned },
                            });
                          }}
                        >
                          <IconStar />
                        </button>
                        <button
                          type="button"
                          aria-label={`删除：${session.title}`}
                          className="is-danger"
                          onClick={(event) => confirmDelete(event, session)}
                        >
                          <IconDelete />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
