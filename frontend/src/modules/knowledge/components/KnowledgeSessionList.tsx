import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Toast } from '@douyinfe/semi-ui';
import { IconPlus, IconDelete } from '@douyinfe/semi-icons';
import { listSessions, archiveSession } from '../api';
import { knowledgeQueryKeys } from '../queryKeys';
import type { KnowledgeSession } from '../types';

interface Props { activeId?: string | null; onSelect: (s: KnowledgeSession) => void; onNew: () => void; }

export function KnowledgeSessionList({ activeId, onSelect, onNew }: Props) {
  const qc = useQueryClient();
  const { data: sessions, isLoading } = useQuery({
    queryKey: knowledgeQueryKeys.sessions,
    queryFn: listSessions,
  });

  const handleDelete = async (e: React.MouseEvent, s: KnowledgeSession) => {
    e.stopPropagation();
    await archiveSession(s.id);
    void qc.invalidateQueries({ queryKey: knowledgeQueryKeys.sessions });
    if (s.id === activeId) onNew();
    Toast.success('已删除对话');
  };

  return (
    <div className="kb-chat-sidebar">
      <div className="kb-chat-sidebar__header">
        <h2>对话历史</h2>
      </div>
      <Button
        className="kb-chat-sidebar__new-btn"
        icon={<IconPlus />}
        theme="solid"
        onClick={onNew}
        style={{ marginBottom: 16 }}
      >
        新建对话
      </Button>
      {isLoading ? null : (
        <div style={{ flex: 1, overflow: 'auto' }}>
          {(sessions ?? []).map((s) => (
            <div
              key={s.id}
              className={`kb-chat-session-item${s.id === activeId ? ' kb-chat-session-item--active' : ''}`}
              onClick={() => onSelect(s)}
            >
              <span className="kb-chat-session-item__title">{s.title}</span>
              <button
                className="kb-chat-session-item__delete"
                onClick={(e) => { void handleDelete(e, s); }}
                aria-label="删除对话"
              >
                <IconDelete />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
