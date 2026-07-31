import { request } from '@/lib/http'

export type ContentDocumentType = 'DOCUMENT' | 'KNOWLEDGE_PAGE' | 'MEETING_MINUTES'
export type ContentDocumentStatus = 'ACTIVE' | 'TRASHED'
export type KnowledgeSourceKind = 'UPLOAD' | 'LOCAL_FILE' | 'LEGACY'
export type KnowledgeProcessingStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'PARTIAL' | 'FAILED' | 'MISSING'

export type ContentDocument = {
  id: string
  title: string
  type: ContentDocumentType
  content: Record<string, unknown>
  plainText: string
  tags: string[]
  isFavorite: boolean
  status: ContentDocumentStatus
  spaceId: string | null
  parentId: string | null
  projectId: string | null
  meetingId: string | null
  sourceKind: KnowledgeSourceKind
  originalName: string | null
  mimeType: string | null
  fileSize: number | null
  sourceSha256: string | null
  previewStatus: KnowledgeProcessingStatus
  previewStorageKey: string | null
  previewMimeType: string | null
  indexStatus: KnowledgeProcessingStatus
  processingError: string | null
  indexedAt: string | null
  trashedAt: string | null
  createdAt: string
  updatedAt: string
}

export type KnowledgeSpace = {
  id: string
  name: string
  description: string | null
  sequence: number
  createdAt: string
  updatedAt: string
}

export type DocumentVersion = {
  id: string
  documentId: string
  versionNumber: number
  title: string
  content: Record<string, unknown>
  plainText: string
  createdAt: string
}

export type FileVersion = {
  id: string
  versionNumber: number
  originalName: string
  mimeType: string
  size: number
  sha256: string
  createdAt: string
}

export type FileAsset = {
  id: string
  name: string
  status: 'ACTIVE' | 'TRASHED'
  documentId: string | null
  projectId: string | null
  meetingId: string | null
  partnerId: string | null
  nonProjectRdItemId: string | null
  nonProjectRdOutcomeId: string | null
  versions: FileVersion[]
  createdAt: string
  updatedAt: string
}

type Page<T> = {
  data: T[]
  meta: { page: number; pageSize: number; total: number }
}

type DocumentFilters = Partial<{
  type: ContentDocumentType
  projectId: string
  meetingId: string
  spaceId: string
  parentId: string
  status: ContentDocumentStatus
  query: string
  pageSize: number
}>

function queryString(filters: Record<string, string | number | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  const rendered = query.toString()
  return rendered ? `?${rendered}` : ''
}

export const listKnowledgeSpaces = () => request<KnowledgeSpace[]>('/knowledge-spaces')

export const createKnowledgeSpace = (input: { name: string; description?: string }) =>
  request<KnowledgeSpace>('/knowledge-spaces', { method: 'POST', body: JSON.stringify(input) })

export const listDocuments = (filters: DocumentFilters = {}) =>
  request<Page<ContentDocument>>(`/documents${queryString(filters)}`)

export const getDocument = (id: string) =>
  request<ContentDocument>(`/documents/${encodeURIComponent(id)}`)

export const createDocument = (input: {
  title: string
  type: ContentDocumentType
  projectId?: string
  meetingId?: string
  spaceId?: string
  parentId?: string
  content?: Record<string, unknown>
  plainText?: string
}) => request<ContentDocument>('/documents', { method: 'POST', body: JSON.stringify(input) })

export const updateDocument = (id: string, input: Partial<ContentDocument>) =>
  request<ContentDocument>(`/documents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })

export const trashDocument = (id: string) =>
  request<void>(`/documents/${encodeURIComponent(id)}`, { method: 'DELETE' })

export const restoreDocument = (id: string) =>
  request<ContentDocument>(`/documents/${encodeURIComponent(id)}/restore`, { method: 'POST' })

export const permanentlyDeleteDocument = (id: string) =>
  request<void>(`/documents/${encodeURIComponent(id)}/permanent`, { method: 'DELETE' })

export const clearDocumentTrash = () =>
  request<{ deleted: number }>('/documents/trash', { method: 'DELETE' })

export const listDocumentVersions = (id: string) =>
  request<DocumentVersion[]>(`/documents/${encodeURIComponent(id)}/versions`)

export const createDocumentVersion = (id: string) =>
  request<DocumentVersion>(`/documents/${encodeURIComponent(id)}/versions`, { method: 'POST' })

export const restoreDocumentVersion = (documentId: string, versionId: string) =>
  request<ContentDocument>(
    `/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/restore`,
    { method: 'POST' },
  )

export const listFiles = (filters: {
  documentId?: string
  projectId?: string
  meetingId?: string
  partnerId?: string
  nonProjectRdItemId?: string
  nonProjectRdOutcomeId?: string
  status?: 'ACTIVE' | 'TRASHED'
} = {}) => request<Page<FileAsset>>(`/files${queryString(filters)}`)

export function uploadFile(file: File, associations: { documentId?: string; projectId?: string; meetingId?: string; partnerId?: string; nonProjectRdItemId?: string; nonProjectRdOutcomeId?: string }) {
  const form = new FormData()
  form.append('file', file)
  for (const [key, value] of Object.entries(associations)) if (value) form.append(key, value)
  return request<FileAsset>('/files', { method: 'POST', body: form })
}

export function uploadFileVersion(id: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  return request<FileVersion>(`/files/${encodeURIComponent(id)}/versions`, {
    method: 'POST',
    body: form,
  })
}

export const trashFile = (id: string) =>
  request<void>(`/files/${encodeURIComponent(id)}`, { method: 'DELETE' })

export const restoreFile = (id: string) =>
  request<FileAsset>(`/files/${encodeURIComponent(id)}/restore`, { method: 'POST' })

export function getFileDownloadUrl(id: string, versionId?: string) {
  const base = window.__APP_CONFIG__?.apiBaseUrl?.replace(/\/$/, '') || 'http://127.0.0.1:4311/api'
  const version = versionId ? `?versionId=${encodeURIComponent(versionId)}` : ''
  return `${base}/files/${encodeURIComponent(id)}/download${version}`
}
