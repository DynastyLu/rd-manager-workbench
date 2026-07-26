import type { ChunkCitation } from '../types';
import { TagGroup } from '@douyinfe/semi-ui';

interface Props {
  citations?: ChunkCitation[];
  deletedIds?: Set<string>;
}

/** 截断标题：超过 max 个字符时补 "..." */
function truncateTitle(title: string, max = 20): string {
  if (title.length <= max) return title;
  return title.slice(0, max) + '...';
}

export function KnowledgeCitationCard({ citations, deletedIds }: Props) {
  if (!citations || citations.length === 0) {
    return null;
  }

  const tagList = citations.map((citation, idx) => {
    const isDeleted = deletedIds?.has(citation.documentId) ?? false;
    const tagKey = `${citation.documentId}-${idx}`;

    return {
      children: truncateTitle(citation.title),
      tagKey,
      className: `kb-citation-card__tag${isDeleted ? ' kb-citation-card__tag--deleted' : ''}`,
      style: isDeleted
        ? { color: '#999', textDecoration: 'line-through', cursor: 'not-allowed', opacity: 0.6 }
        : undefined,
      onClick: isDeleted
        ? undefined
        : () => {
            window.location.hash = `#/docs?documentId=${encodeURIComponent(citation.documentId)}`;
          },
    };
  });

  return (
    <>
      <div className="kb-citation-card">
        <span className="kb-citation-card__label">引用来源：</span>
        <TagGroup tagList={tagList} />
      </div>
      <style>{`
        .kb-citation-card {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 10px 0;
          font-size: 13px;
        }
        .kb-citation-card__label {
          flex-shrink: 0;
          color: #8f959e;
          line-height: 28px;
          white-space: nowrap;
        }
        .kb-citation-card__tag {
          cursor: pointer;
        }
        .kb-citation-card__tag--deleted {
          cursor: not-allowed;
        }
      `}</style>
    </>
  );
}
