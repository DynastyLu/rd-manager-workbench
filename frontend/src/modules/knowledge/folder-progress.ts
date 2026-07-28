import type { FolderSyncProgress } from './api'

const PHASES = new Set<FolderSyncProgress['phase']>([
  'scanning',
  'deleting',
  'importing',
  'done',
  'error',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function parseFolderProgressEvent(raw: string): FolderSyncProgress {
  const parsed = JSON.parse(raw) as unknown
  const payload = isRecord(parsed) && isRecord(parsed.data) ? parsed.data : parsed
  if (
    !isRecord(payload)
    || typeof payload.phase !== 'string'
    || !PHASES.has(payload.phase as FolderSyncProgress['phase'])
    || typeof payload.total !== 'number'
    || typeof payload.current !== 'number'
    || typeof payload.currentFile !== 'string'
    || typeof payload.percent !== 'number'
  ) {
    throw new Error('Invalid folder progress event')
  }
  return payload as unknown as FolderSyncProgress
}
