import { request } from '@/lib/http';
import type { KnowledgeScope, KnowledgeSession, IndexStatus } from './types';

const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:4311/api' : '';

export function listSessions(search?: string) {
  const query = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
  return request<KnowledgeSession[]>(`/knowledge/sessions${query}`);
}
export function createSession(question: string) {
  return request<KnowledgeSession>('/knowledge/sessions', { method: 'POST', body: JSON.stringify({ question }) });
}
export function getSession(id: string) {
  return request<KnowledgeSession>(`/knowledge/sessions/${encodeURIComponent(id)}`);
}
export function updateSession(
  id: string,
  input: { title?: string; isPinned?: boolean; scope?: KnowledgeScope },
) {
  return request<KnowledgeSession>(`/knowledge/sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
export function archiveSession(id: string) {
  return request<void>(`/knowledge/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export function chatStream(sessionId: string, question: string, signal?: AbortSignal) {
  return fetch(`${API_BASE}/knowledge/chat/${sessionId}/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }), signal,
  });
}
export function getIndexStatus() { return request<IndexStatus>('/knowledge/reindex/status'); }
export function triggerReindex() {
  return request<{ jobId: string }>('/knowledge/reindex', { method: 'POST' });
}
export interface EmbeddingStatus {
  state: 'UNAVAILABLE' | 'DOWNLOADING' | 'LOADING' | 'READY' | 'ERROR';
  ready: boolean;
  modelId: string;
  dimension: number;
  lastError: string | null;
}
export function getEmbeddingStatus() {
  return request<EmbeddingStatus>('/knowledge/embeddings/status');
}
export function prepareEmbeddingModel() {
  return request<EmbeddingStatus>('/knowledge/embeddings/prepare', { method: 'POST' });
}

// Folder watch
export interface FolderWatchItem {
  id: string;
  label: string;
  folderPath: string;
  spaceId: string;
  recursive: boolean;
  status: string;
  errorMessage?: string;
  lastSyncAt?: string;
  createdAt: string;
  space: { id: string; name: string };
  _count: { files: number };
}
export interface FolderWatchDetail extends FolderWatchItem {
  files: Array<{ id: string; filePath: string; documentId: string; status: string; fileHash?: string; updatedAt: string }>;
}
export interface RescanResult { imported: number; updated: number; deleted: number; errors: number; }
export interface FolderSyncProgress {
  watchId?: string;
  phase: 'scanning' | 'deleting' | 'importing' | 'done' | 'error';
  total: number;
  current: number;
  currentFile: string;
  percent: number;
  result?: RescanResult;
  error?: string;
}

export interface WorkbookPreviewMerge {
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
}

export interface WorkbookSheetPreview {
  name: string;
  rowCount: number;
  columnCount: number;
  rows: string[][];
  columnWidths: number[];
  rowHeights: number[];
  merges: WorkbookPreviewMerge[];
}

export interface WorkbookPreview {
  fileName: string;
  sheets: WorkbookSheetPreview[];
}

export function listFolderWatches() { return request<FolderWatchItem[]>('/knowledge/folders'); }
export function getFolderWatch(id: string) { return request<FolderWatchDetail>(`/knowledge/folders/${encodeURIComponent(id)}`); }
export function startFolderWatch(body: { folderPath: string; label?: string; spaceId?: string; recursive?: boolean }) {
  return request<{ watchId: string; spaceId: string }>('/knowledge/folders', { method: 'POST', body: JSON.stringify(body) });
}
export function stopFolderWatch(id: string) {
  return request<void>(`/knowledge/folders/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export function rescanFolder(id: string) {
  return request<RescanResult>(`/knowledge/folders/${encodeURIComponent(id)}/rescan`, { method: 'POST' });
}
export function getFolderProgressSnapshot(id: string) {
  return request<FolderSyncProgress>(`/knowledge/folders/${encodeURIComponent(id)}/progress-snapshot`);
}
export function getKnowledgeWorkbook(id: string) {
  return request<WorkbookPreview>(`/knowledge/documents/${encodeURIComponent(id)}/workbook`);
}
