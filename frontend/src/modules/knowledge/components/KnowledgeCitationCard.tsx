import { useState } from 'react';
import type { ChunkCitation } from '../types';
import { copyToClipboard } from '../format';
import { IconCopy, IconFile } from '@douyinfe/semi-icons';
import { Tooltip } from '@douyinfe/semi-ui';

interface Props {
  citations?: ChunkCitation[];
  deletedIds?: Set<string>;
  highlightTerms?: string[];
  onSelect?: (citation: ChunkCitation) => void;
}

export function KnowledgeCitationCard({ citations, deletedIds, onSelect }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (!citations || citations.length === 0) return null;

  const unique = new Map<string, ChunkCitation>();
  for (const c of citations) {
    // Deduplicate by documentId, keep highest similarity
    const existing = unique.get(c.documentId);
    if (!existing || (c.similarity ?? 0) > (existing.similarity ?? 0)) {
      unique.set(c.documentId, c);
    }
  }

  const sources = [...unique.values()];
  const visibleSources = expanded ? sources : sources.slice(0, 4);

  return (
    <div className="kb-citation-card">
      <div className="kb-citation-card__header">
        <IconFile size="small" />
        <span>{unique.size} 个来源</span>
      </div>
      <div className="kb-citation-card__items">
      {visibleSources.map((citation, idx) => {
        const isDeleted = deletedIds?.has(citation.documentId) ?? false;

        return (
          <SourceItem
            key={`${citation.documentId}-${idx}`}
            citation={citation}
            isDeleted={isDeleted}
            onSelect={onSelect}
          />
        );
      })}
      {sources.length > 4 ? (
        <button
          type="button"
          className="kb-citation-card__toggle"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? '收起来源' : `查看全部 ${sources.length} 个来源`}
        </button>
      ) : null}
      </div>
      <style>{`
        .kb-citation-card { margin: 14px 0 4px; }
        .kb-citation-card__header {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px; font-weight: 550; color: #737983; margin-bottom: 8px;
        }
        .kb-citation-card__items {
          display: flex; flex-wrap: wrap; align-items: center; gap: 7px;
        }
        .kb-source-item {
          display: flex; min-width: 0; max-width: 240px; align-items: center;
          border: 1px solid #e4e6ea; border-radius: 999px; padding: 6px 8px;
          background: #f8f9fa; cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
        }
        .kb-source-item:hover { border-color: #cfd3d9; background: #f1f2f4; }
        .kb-source-item__header {
          display: flex; min-width: 0; align-items: center;
        }
        .kb-source-item__title {
          max-width: 145px; overflow: hidden; color: #3d434c; font-size: 11px;
          font-weight: 550; text-overflow: ellipsis; white-space: nowrap;
        }
        .kb-source-item__space {
          display: none;
        }
        .kb-source-item__location {
          flex-shrink: 0; margin-left: 5px; color: #9aa0a8; font-size: 10px;
        }
        .kb-source-item__copy {
          display: none; flex-shrink: 0; align-items: center; margin-left: 3px;
          border: 0; background: none; color: #8f959e; cursor: pointer; font-size: 0;
        }
        .kb-source-item:hover .kb-source-item__copy,
        .kb-source-item:focus-within .kb-source-item__copy { display: flex; }
        .kb-source-item__copy:hover { color: #1f2329; }
        .kb-source-item--deleted { opacity: 0.5; }
        .kb-citation-card__toggle {
          padding: 6px 9px; border: 0; background: transparent; color: #747b85;
          cursor: pointer; font-size: 11px;
        }
        .kb-citation-card__toggle:hover { color: #1f2329; }
      `}</style>
    </div>
  );
}

function SourceItem({ citation, isDeleted, onSelect }: {
  citation: ChunkCitation;
  isDeleted: boolean;
  onSelect?: (citation: ChunkCitation) => void;
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
    if (onSelect) {
      onSelect(citation);
      return;
    }
    const query = new URLSearchParams({
      tab: 'documents',
      documentId: citation.documentId,
      citationChunk: String(citation.chunkIndex),
    });
    if (citation.pageNumber) query.set('citationPage', String(citation.pageNumber));
    if (citation.sheetName) query.set('citationSheet', citation.sheetName);
    if (citation.locationLabel) query.set('citationLocation', citation.locationLabel);
    window.location.hash = `#/knowledge?${query.toString()}`;
  };

  const location = citation.locationLabel
    || (citation.pageNumber ? `第 ${citation.pageNumber} 页` : '')
    || citation.sheetName;

  return (
    <div className={`kb-source-item${isDeleted ? ' kb-source-item--deleted' : ''}`}
      onClick={handleClick} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') { handleClick(); } }}>
      <div className="kb-source-item__header">
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <IconFile size="small" style={{ marginRight: 5, flexShrink: 0, color: '#8f959e' }} />
          <span className="kb-source-item__title" title={citation.title}>{citation.title}</span>
          {citation.spaceName && <span className="kb-source-item__space">{citation.spaceName}</span>}
          {location && <span className="kb-source-item__location">{location}</span>}
        </div>
        <Tooltip content={copied ? '已复制' : '复制内容'}>
          <button className="kb-source-item__copy" onClick={handleCopy} type="button">
            <IconCopy size="small" />
            {copied ? '已复制' : '复制'}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
