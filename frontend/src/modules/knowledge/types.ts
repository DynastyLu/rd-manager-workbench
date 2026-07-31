export type KnowledgeScope =
  | { type: 'ALL' }
  | { type: 'PROJECT'; projectId: string }
  | { type: 'SPACE'; spaceId: string }
  | { type: 'FOLDER'; folderWatchId: string }
  | { type: 'DOCUMENTS'; documentIds: string[] }
  | { type: 'RECENT' }

export interface KnowledgeSession {
  id: string; title: string; status: 'ACTIVE' | 'ARCHIVED';
  scope?: KnowledgeScope;
  scopeType?: KnowledgeScope['type'];
  isPinned?: boolean;
  preview?: string;
  lastMessageAt?: string;
  archivedAt?: string | null;
  messageNextCursor?: string | null;
  createdAt: string; updatedAt: string; messages?: KnowledgeMessage[];
}
export interface KnowledgeCursorPage<T> {
  pinned: T[];
  items: T[];
  nextCursor: string | null;
}
export interface KnowledgeMessage {
  id: string; role: 'USER' | 'ASSISTANT'; content: string;
  citations?: ChunkCitation[]; tokenCount?: number; replyToMessageId?: string | null; createdAt: string;
}
export interface ChunkCitation {
  documentId: string; title: string; chunkIndex: number; text: string;
  content?: string;      // full chunk content
  spaceName?: string;    // knowledge space name
  similarity?: number;   // pg_trgm score
  pageNumber?: number;
  sheetName?: string;
  locationLabel?: string;
}
export interface IndexStatus {
  indexedDocuments: number; totalDocuments: number;
  excludedDocuments?: number;
  totalChunks: number; lastIndexedAt?: string; complete: boolean;
}
export interface AiUsageStats {
  today: { tokens: number; cost: number }; week: { tokens: number; cost: number };
  month: { tokens: number; cost: number }; total: { tokens: number; cost: number };
}
