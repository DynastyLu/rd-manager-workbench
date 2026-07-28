export interface KnowledgeSession {
  id: string; title: string; status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string; updatedAt: string; messages?: KnowledgeMessage[];
}
export interface KnowledgeMessage {
  id: string; role: 'USER' | 'ASSISTANT'; content: string;
  citations?: ChunkCitation[]; tokenCount?: number; createdAt: string;
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
  totalChunks: number; lastIndexedAt?: string; complete: boolean;
}
export interface AiUsageStats {
  today: { tokens: number; cost: number }; week: { tokens: number; cost: number };
  month: { tokens: number; cost: number }; total: { tokens: number; cost: number };
}
