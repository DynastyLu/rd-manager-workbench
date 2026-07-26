import { useState } from 'react';
import type { ChunkCitation } from '../types';
import { highlightTextSegments, copyToClipboard } from '../format';
import { IconCopy, IconFile } from '@douyinfe/semi-icons';
import { Tooltip } from '@douyinfe/semi-ui';

interface Props {
  citations?: ChunkCitation[];
  deletedIds?: Set<string>;
  highlightTerms?: string[];
}

function truncateText(text: string, max = 100): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '…';
}

export function KnowledgeCitationCard({ citations, deletedIds, highlightTerms }: Props) {
  if (!citations || citations.length === 0) return null;

  const unique = new Map<string, ChunkCitation>();
  for (const c of citations) {
    // Deduplicate by documentId, keep highest similarity
    const existing = unique.get(c.documentId);
    if (!existing || (c.similarity ?? 0) > (existing.similarity ?? 0)) {
      unique.set(c.documentId, c);
    }
  }

  return (
    <div className="kb-citation-card">
      <div className="kb-citation-card__header">
        <IconFile size="small" />
        <span>{unique.size} 个来源</span>
      </div>
      {[...unique.values()].map((citation, idx) => {
        const isDeleted = deletedIds?.has(citation.documentId) ?? false;
        const terms = highlightTerms ?? [];
        const content = citation.content || citation.text;
        const segments = highlightTextSegments(truncateText(content, 200), terms);

        return (
          <SourceItem
            key={`${citation.documentId}-${idx}`}
            citation={citation}
            isDeleted={isDeleted}
            segments={segments}
          />
        );
      })}
      <style>{`
        .kb-citation-card { margin: 12px 0; }
        .kb-citation-card__header {
          display: flex; align-items: center; gap: 6px;
          font-size: 13px; font-weight: 600; color: #1f2b3d; margin-bottom: 8px;
        }
        .kb-source-item {
          border: 1px solid #e5e6eb; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px;
          background: #fafbfc; cursor: pointer; transition: border-color 0.2s;
        }
        .kb-source-item:hover { border-color: #1456f0; }
        .kb-source-item__header {
          display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;
        }
        .kb-source-item__title {
          font-size: 13px; font-weight: 600; color: #1456f0;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%;
        }
        .kb-source-item__space {
          font-size: 11px; color: #8f959e; margin-left: 6px;
        }
        .kb-source-item__copy {
          flex-shrink: 0; color: #8f959e; font-size: 12px;
          display: flex; align-items: center; gap: 4px; border: 0; background: none; cursor: pointer;
        }
        .kb-source-item__copy:hover { color: #1456f0; }
        .kb-source-item__content {
          font-size: 12px; line-height: 1.6; color: #4e5969;
          overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
        }
        .kb-source-item__content mark { background: #fff3b0; color: #1f2b3d; padding: 0 2px; border-radius: 2px; }
        .kb-source-item--deleted { opacity: 0.5; }
      `}</style>
    </div>
  );
}

function SourceItem({ citation, isDeleted, segments }: {
  citation: ChunkCitation;
  isDeleted: boolean;
  segments: ReturnType<typeof highlightTextSegments>;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = citation.content || citation.text;
    void copyToClipboard(text).then((ok) => {
      if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
    });
  };

  const handleClick = () => {
    if (isDeleted) return;
    window.location.hash = `#/docs?documentId=${encodeURIComponent(citation.documentId)}`;
  };

  return (
    <div className={`kb-source-item${isDeleted ? ' kb-source-item--deleted' : ''}`}
      onClick={handleClick} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') { handleClick(); } }}>
      <div className="kb-source-item__header">
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <IconFile size="small" style={{ marginRight: 6, flexShrink: 0, color: '#8f959e' }} />
          <span className="kb-source-item__title" title={citation.title}>{citation.title}</span>
          {citation.spaceName && <span className="kb-source-item__space">{citation.spaceName}</span>}
        </div>
        <Tooltip content={copied ? '已复制' : '复制内容'}>
          <button className="kb-source-item__copy" onClick={handleCopy} type="button">
            <IconCopy size="small" />
            {copied ? '已复制' : '复制'}
          </button>
        </Tooltip>
      </div>
      <div className="kb-source-item__content">
        {segments.map((seg, i) =>
          seg.highlight ? <mark key={i}>{seg.text}</mark> : <span key={i}>{seg.text}</span>,
        )}
      </div>
    </div>
  );
}
