import { useQuery } from '@tanstack/react-query';
import { Button, List, Skeleton } from '@douyinfe/semi-ui';
import { IconPlus } from '@douyinfe/semi-icons';
import { listSessions } from '../api';
import { knowledgeQueryKeys } from '../queryKeys';
import type { KnowledgeSession } from '../types';

interface Props { activeId?: string | null; onSelect: (s: KnowledgeSession) => void; onNew: () => void; }

export function KnowledgeSessionList({ activeId, onSelect, onNew }: Props) {
  const { data: sessions, isLoading } = useQuery({
    queryKey: knowledgeQueryKeys.sessions,
    queryFn: listSessions,
  });

  return (
    <div className="kb-session-list">
      <Button icon={<IconPlus />} block onClick={onNew} style={{ marginBottom: 12 }}>新建对话</Button>
      {isLoading ? <Skeleton placeholder={<Skeleton.Paragraph rows={4} />} /> : (
        <List
          dataSource={sessions ?? []}
          renderItem={(s: KnowledgeSession) => (
            <List.Item
              style={{ background: s.id === activeId ? 'var(--semi-color-fill-0)' : undefined, borderRadius: 6, cursor: 'pointer', padding: '8px 12px', marginBottom: 4 }}
              onClick={() => onSelect(s)}
            >
              <div style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
            </List.Item>
          )}
        />
      )}
    </div>
  );
}
