import { useState } from 'react';
import type { ChunkCitation, KnowledgeSession } from '../types';
import { KnowledgeChatPanel } from './KnowledgeChatPanel';
import { KnowledgeCitationDrawer } from './KnowledgeCitationDrawer';
import { KnowledgeSessionList } from './KnowledgeSessionList';

interface Props {
  sessionId: string | null;
  onSessionChange: (id: string | null) => void;
  projectId?: string;
}

export function KnowledgeAssistantWorkspace({ sessionId, onSessionChange, projectId }: Props) {
  const [citation, setCitation] = useState<ChunkCitation | null>(null);

  const openDocument = (source: ChunkCitation) => {
    const query = new URLSearchParams({
      tab: 'documents',
      documentId: source.documentId,
      citationChunk: String(source.chunkIndex),
    });
    if (source.pageNumber) query.set('citationPage', String(source.pageNumber));
    if (source.sheetName) query.set('citationSheet', source.sheetName);
    if (source.locationLabel) query.set('citationLocation', source.locationLabel);
    window.location.hash = `#/knowledge?${query.toString()}`;
  };

  const download = (source: ChunkCitation) => {
    window.open(
      `/api/knowledge/documents/${encodeURIComponent(source.documentId)}/source?download=1`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  return (
    <div className="knowledge-assistant">
      <KnowledgeSessionList
        activeId={sessionId}
        onSelect={(session: KnowledgeSession) => {
          setCitation(null);
          onSessionChange(session.id);
        }}
        onNew={() => {
          setCitation(null);
          onSessionChange(null);
        }}
      />
      <KnowledgeChatPanel
        sessionId={sessionId}
        onSessionCreated={onSessionChange}
        onCitationSelect={setCitation}
        projectId={projectId}
      />
      <KnowledgeCitationDrawer
        citation={citation}
        onClose={() => setCitation(null)}
        onOpenDocument={openDocument}
        onDownload={download}
      />
    </div>
  );
}
