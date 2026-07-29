import { Button, Tag } from '@douyinfe/semi-ui';
import { IconClose, IconDownload, IconFile } from '@douyinfe/semi-icons';
import type { ChunkCitation } from '../types';

interface Props {
  citation: ChunkCitation | null;
  onClose: () => void;
  onOpenDocument: (citation: ChunkCitation) => void;
  onDownload: (citation: ChunkCitation) => void;
}

export function KnowledgeCitationDrawer({
  citation,
  onClose,
  onOpenDocument,
  onDownload,
}: Props) {
  if (!citation) return null;

  return (
    <aside
      className="knowledge-assistant__source knowledge-assistant__source--open"
      aria-label="引用来源"
    >
      <header className="knowledge-assistant__source-header">
        <div>
          <IconFile />
          <strong>引用来源</strong>
        </div>
        <Button aria-label="关闭引用来源" icon={<IconClose />} theme="borderless" onClick={onClose} />
      </header>
      <div className="knowledge-assistant__source-body">
        <div className="knowledge-assistant__source-title">
          <IconFile />
          <div>
            <strong>{citation.title}</strong>
            {citation.spaceName ? <span>{citation.spaceName}</span> : null}
          </div>
        </div>
        <div className="knowledge-assistant__source-meta">
          {citation.locationLabel ? <Tag color="blue">{citation.locationLabel}</Tag> : null}
          {citation.pageNumber ? <Tag>第 {citation.pageNumber} 页</Tag> : null}
          {citation.sheetName ? <Tag>工作表：{citation.sheetName}</Tag> : null}
        </div>
        <section>
          <h3>命中片段</h3>
          <blockquote>{citation.content || citation.text}</blockquote>
        </section>
        <footer>
          <Button onClick={() => onOpenDocument(citation)}>在知识库中打开</Button>
          <Button icon={<IconDownload />} onClick={() => onDownload(citation)}>
            下载原文件
          </Button>
        </footer>
      </div>
    </aside>
  );
}
