export interface DocumentChunkInput {
  documentId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
}

export interface ChunkingOptions {
  chunkSize: number;
  chunkOverlap: number;
}

export const DEFAULT_CHUNKING: ChunkingOptions = {
  chunkSize: 512,
  chunkOverlap: 64,
};

export interface ChunkCitation {
  documentId: string;
  title: string;
  chunkIndex: number;
  text: string;
}

export interface RagAskParams {
  question: string;
  history: Array<{ role: string; content: string }>;
}

export interface IndexStatus {
  indexedDocuments: number;
  totalDocuments: number;
  missingEmbeddingChunks: number;
  lastIndexedAt?: string;
  complete: boolean;
  failedDocuments?: string[];
}

export interface AiUsageStats {
  today: { tokens: number; cost: number };
  week: { tokens: number; cost: number };
  month: { tokens: number; cost: number };
  total: { tokens: number; cost: number };
}
