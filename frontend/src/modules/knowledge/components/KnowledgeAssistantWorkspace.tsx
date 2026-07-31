import { useState } from 'react';
import type { ChunkCitation, KnowledgeSession } from '../types';
import { KnowledgeChatPanel } from './KnowledgeChatPanel';
import { KnowledgeCitationDrawer } from './KnowledgeCitationDrawer';
import { KnowledgeSessionHistory } from './KnowledgeSessionHistory';
import { KnowledgeSessionList } from './KnowledgeSessionList';
import { apiUrl } from '@/lib/api-url';

interface Props {
  sessionId: string | null;
  onSessionChange: (id: string | null) => void;
  projectId?: string;
  onNavigate?: (tab: 'documents' | 'folders') => void;
}

export function KnowledgeAssistantWorkspace({
  sessionId,
  onSessionChange,
  projectId,
  onNavigate,
}: Props) {
  const [citation, setCitation] = useState<ChunkCitation | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

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
      apiUrl(`/knowledge/documents/${encodeURIComponent(source.documentId)}/source?download=1`),
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
          setHistoryOpen(false);
          onSessionChange(null);
        }}
        onOpenHistory={() => setHistoryOpen(true)}
        onNavigate={onNavigate}
      />
      {historyOpen ? (
        <KnowledgeSessionHistory
          onClose={() => setHistoryOpen(false)}
          onSelect={(session) => {
            setCitation(null);
            setHistoryOpen(false);
            onSessionChange(session.id);
          }}
        />
      ) : (
        <KnowledgeChatPanel
          sessionId={sessionId}
          onSessionCreated={onSessionChange}
          onCitationSelect={setCitation}
          projectId={projectId}
        />
      )}
      <KnowledgeCitationDrawer
        citation={citation}
        onClose={() => setCitation(null)}
        onOpenDocument={openDocument}
        onDownload={download}
      />
    </div>
  );
}
