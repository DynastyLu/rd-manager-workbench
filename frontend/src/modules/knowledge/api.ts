import { request, authenticatedFetch } from '@/lib/http'
import { apiUrl } from '@/lib/api-url'
import { getConnectionTicket } from '@/modules/auth/api'
import type {
  KnowledgeCursorPage,
  KnowledgeScope,
  KnowledgeSession,
  IndexStatus,
} from './types'

export function listSessions(search?: string, cursor?: string, limit = 30) {
  const query = new URLSearchParams()
  if (search?.trim()) query.set('search', search.trim())
  if (cursor) query.set('cursor', cursor)
  if (limit !== 30) query.set('limit', String(limit))
  const suffix = query.size > 0 ? `?${query.toString().replace(/\+/g, '%20')}` : ''
  return request<KnowledgeCursorPage<KnowledgeSession>>(`/knowledge/sessions${suffix}`)
}
export function createSession(question: string) {
  return request<KnowledgeSession>('/knowledge/sessions', {
    method: 'POST',
    body: JSON.stringify({ question }),
  })
}
export function getSession(id: string, options: { messageCursor?: string } = {}) {
  const query = new URLSearchParams()
  if (options.messageCursor) query.set('messageCursor', options.messageCursor)
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  return request<KnowledgeSession>(`/knowledge/sessions/${encodeURIComponent(id)}${suffix}`)
}
export function updateSession(
  id: string,
  input: { title?: string; isPinned?: boolean; scope?: KnowledgeScope }
) {
  return request<KnowledgeSession>(`/knowledge/sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}
export function archiveSession(id: string) {
  return request<void>(`/knowledge/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
export function chatStream(sessionId: string, question: string, signal?: AbortSignal) {
  return authenticatedFetch(apiUrl(`/knowledge/chat/${encodeURIComponent(sessionId)}/messages`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
    signal,
  })
}
export function getIndexStatus() {
  return request<IndexStatus>('/knowledge/reindex/status')
}
export type IndexHealthCategory =
  | 'EXTRACTION_MISSING'
  | 'CHUNKS_MISSING'
  | 'EMBEDDINGS_MISSING'
  | 'FILE_MISSING'
  | 'UNSUPPORTED_FORMAT'
export interface IndexHealthItem {
  documentId: string
  title: string
  fileName: string
  category: IndexHealthCategory
  reason: string
}
export interface IndexHealthResponse {
  items: IndexHealthItem[]
  counts: Partial<Record<IndexHealthCategory, number>>
  excludedDocumentCount: number
  ignoredDocumentCount: number
}
export function getIndexHealth(category?: IndexHealthCategory) {
  const query = category ? `?category=${encodeURIComponent(category)}` : ''
  return request<IndexHealthResponse>(`/knowledge/index-health${query}`)
}
export function retryIndexHealthItem(documentId: string) {
  return request<{ documentId: string; status: 'READY' | 'PARTIAL' }>(
    `/knowledge/index-health/${encodeURIComponent(documentId)}/retry`,
    { method: 'POST' }
  )
}
export function retryAllIndexHealth(category?: IndexHealthCategory) {
  const query = category ? `?category=${encodeURIComponent(category)}` : ''
  return request<{ total: number; succeeded: number; failed: number }>(
    `/knowledge/index-health/retry-all${query}`,
    { method: 'POST' }
  )
}
export function ignoreIndexHealthItem(documentId: string) {
  return request<void>(
    `/knowledge/index-health/${encodeURIComponent(documentId)}/ignore`,
    { method: 'POST' }
  )
}
export function triggerReindex() {
  return request<{ jobId: string }>('/knowledge/reindex', { method: 'POST' })
}
export interface EmbeddingStatus {
  state: 'UNAVAILABLE' | 'DOWNLOADING' | 'LOADING' | 'READY' | 'ERROR'
  ready: boolean
  modelId: string
  dimension: number
  runtime: 'native' | 'wasm' | null
  lastError: string | null
  persistence: {
    state: 'UNKNOWN' | 'PERSISTED' | 'DEGRADED'
    durable: boolean | null
    message: string | null
  }
  reindexJobId?: string
  reindex?: {
    indexedDocuments: number
    totalDocuments: number
    totalChunks: number
    complete: boolean
    latestJob?: {
      id: string
      status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'INTERRUPTED'
      processedFiles: number
      totalFiles: number
    } | null
  } | null
}
export function getEmbeddingStatus() {
  return request<EmbeddingStatus>('/knowledge/embeddings/status')
}
export function prepareEmbeddingModel() {
  return request<EmbeddingStatus>('/knowledge/embeddings/prepare', { method: 'POST' })
}

// Folder watch
export interface FolderWatchItem {
  id: string
  label: string
  folderPath: string
  spaceId: string
  recursive: boolean
  status: string
  errorMessage?: string
  lastSyncAt?: string
  createdAt: string
  space: { id: string; name: string }
  _count: { files: number }
}
export interface FolderWatchDetail extends FolderWatchItem {
  files: Array<{
    id: string
    filePath: string
    documentId: string
    status: string
    fileHash?: string
    updatedAt: string
  }>
}
export interface RescanResult {
  scanned: number
  imported: number
  updated: number
  deleted: number
  errors: number
}
export interface FolderSyncProgress {
  watchId?: string
  phase: 'scanning' | 'deleting' | 'importing' | 'done' | 'error'
  total: number
  current: number
  scanned?: number
  currentFile: string
  percent: number
  result?: RescanResult
  error?: string
  counts?: {
    discovered: number
    pending: number
    success: number
    updated: number
    skipped: number
    deleted: number
    failed: number
  }
  failedFiles?: Array<{
    fileName: string
    category: 'READ_FAILED' | 'EXTRACTION_FAILED' | 'INDEX_FAILED' | 'DELETE_FAILED' | 'UNKNOWN'
    reason: string
  }>
}

export interface WorkbookPreviewMerge {
  startRow: number
  startColumn: number
  endRow: number
  endColumn: number
}

export interface WorkbookSheetPreview {
  name: string
  rowCount: number
  columnCount: number
  rows: string[][]
  columnWidths: number[]
  rowHeights: number[]
  merges: WorkbookPreviewMerge[]
}

export interface WorkbookPreview {
  fileName: string
  sheets: WorkbookSheetPreview[]
}

export function listFolderWatches() {
  return request<FolderWatchItem[]>('/knowledge/folders')
}
export function getFolderWatch(id: string) {
  return request<FolderWatchDetail>(`/knowledge/folders/${encodeURIComponent(id)}`)
}
export function startFolderWatch(body: {
  folderPath: string
  label?: string
  spaceId?: string
  recursive?: boolean
}) {
  return request<{ watchId: string; spaceId: string }>('/knowledge/folders', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
export function stopFolderWatch(id: string) {
  return request<void>(`/knowledge/folders/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
export function rescanFolder(id: string) {
  return request<{ started: true }>(`/knowledge/folders/${encodeURIComponent(id)}/rescan`, {
    method: 'POST',
  })
}
export function retryFailedFolderFiles(id: string) {
  return request<{ started: true; count: number }>(
    `/knowledge/folders/${encodeURIComponent(id)}/retry-failed`,
    { method: 'POST' }
  )
}
export function getFolderProgressSnapshot(id: string) {
  return request<FolderSyncProgress>(
    `/knowledge/folders/${encodeURIComponent(id)}/progress-snapshot`
  )
}
export function getKnowledgeWorkbook(id: string) {
  return request<WorkbookPreview>(`/knowledge/documents/${encodeURIComponent(id)}/workbook`)
}

export async function getFolderProgressEventSourceUrl(id: string): Promise<string> {
  const { ticket } = await getConnectionTicket('knowledge-sse')
  const query = new URLSearchParams({ ticket })
  return apiUrl(`/knowledge/folders/${encodeURIComponent(id)}/progress?${query.toString()}`)
}
