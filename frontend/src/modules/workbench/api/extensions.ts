import { request } from '@/lib/http'

export type ExtensionKind = 'SMS' | 'AI' | 'CALENDAR' | 'CLOUD_DRIVE'
export type ExtensionProvider =
  | 'LOCAL_PREVIEW'
  | 'ALIYUN_SMS'
  | 'LOCAL_MANUAL'
  | 'OPENAI_RESPONSES'
  | 'CALDAV'
  | 'WEBDAV'

export type ExtensionOperation =
  | 'TEST_CONNECTION'
  | 'SMS_PREVIEW'
  | 'SMS_SEND'
  | 'AI_SUMMARIZE_MEETING'
  | 'AI_SUMMARIZE_DOCUMENT'
  | 'AI_KNOWLEDGE_QA'
  | 'CALENDAR_SYNC_PREFLIGHT'
  | 'CALENDAR_SYNC_COMMIT'
  | 'CLOUD_UPLOAD_PREFLIGHT'
  | 'CLOUD_UPLOAD_COMMIT'
  | 'CLOUD_DOWNLOAD_PREFLIGHT'
  | 'CLOUD_DOWNLOAD_COMMIT'

export type ExtensionRunStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'REJECTED'

export interface ExtensionProfile {
  id: string
  kind: ExtensionKind
  provider: ExtensionProvider
  name: string
  enabled: boolean
  publicConfig: Record<string, unknown>
  credentialRef: string | null
  credentialConfigured: boolean
  permissions: ExtensionOperation[]
  createdAt: string
  updatedAt: string
  archivedAt?: string | null
}

export interface ExtensionRun {
  id: string
  profileId: string
  operation: ExtensionOperation
  status: ExtensionRunStatus
  inputSha256: string
  inputBytes: number
  outputSha256?: string | null
  outputBytes?: number | null
  errorCode?: string | null
  metadata: Record<string, unknown>
  createdAt: string
  startedAt?: string | null
  finishedAt?: string | null
}

export interface PreparedExtensionRun {
  operation: ExtensionOperation
  inputSha256: string
  inputBytes: number
  confirmationHash: string
  requiresConfirmation: boolean
  dataLeavesDevice: boolean
  provider: ExtensionProvider
}

export type AiOperation = Extract<
  ExtensionOperation,
  'AI_SUMMARIZE_MEETING' | 'AI_SUMMARIZE_DOCUMENT' | 'AI_KNOWLEDGE_QA'
>

export interface PreparedAiRequest extends PreparedExtensionRun {
  payload: Record<string, unknown> & { citationIds: string[] }
  disclosure: {
    providerReceives: string[]
    objectIds: string[]
    characterCount: number
    truncated: boolean
  }
}

export type SyncResolution = 'KEEP_LOCAL' | 'KEEP_REMOTE' | 'CREATE_COPY'

export type SyncTarget =
  | { type: 'CALENDAR'; startAt: string; endAt: string }
  | { type: 'FILE'; fileAssetId: string; remotePath: string; mode: 'UPLOAD' | 'DOWNLOAD' }

export interface SyncPreflightResult {
  preflightHash: string
  expiresAt: string
  direction?: 'PULL_ONLY' | 'BIDIRECTIONAL'
  items: Array<{
    itemKey: string
    localType: string
    localId?: string
    remoteId: string
    remoteVersion?: string
    action: 'ADD' | 'UPDATE' | 'CONFLICT'
    allowedResolutions: SyncResolution[]
    remotePreview?: Record<string, unknown>
  }>
}

export interface PreparedSyncSession extends PreparedExtensionRun {
  sessionId: string
  summary: Record<string, unknown>
}

export interface SyncSession {
  id: string
  profileId: string
  targetType: 'CALENDAR' | 'FILE'
  status: 'DRAFT' | 'PREFLIGHT_STARTING' | 'PREFLIGHT_RUNNING' | 'READY' | 'COMMIT_STARTING' | 'COMMIT_RUNNING' | 'COMMITTED' | 'FAILED' | 'EXPIRED'
  preflightRunId?: string | null
  commitRunId?: string | null
  preflight?: SyncPreflightResult | null
  errorCode?: string | null
  committedAt?: string | null
  updatedAt: string
}

export interface SmsRecipient {
  id: string
  label: string
  maskedPhone: string
  credentialRef: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface StartedExtensionRun extends ExtensionRun {
  completionToken?: string
}

export interface CreateExtensionProfileInput {
  kind: ExtensionKind
  provider: ExtensionProvider
  name: string
  enabled?: boolean
  publicConfig: Record<string, unknown>
  credentialRef?: string
  permissions?: ExtensionOperation[]
}

export type UpdateExtensionProfileInput = Partial<
  Pick<CreateExtensionProfileInput, 'name' | 'enabled' | 'publicConfig' | 'credentialRef' | 'permissions'>
> & { credentialRef?: string | null }

export function listExtensionProfiles(kind?: ExtensionKind): Promise<ExtensionProfile[]> {
  return request(`/extensions/profiles${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`)
}

export function createExtensionProfile(input: CreateExtensionProfileInput): Promise<ExtensionProfile> {
  return request('/extensions/profiles', { method: 'POST', body: JSON.stringify(input) })
}

export function updateExtensionProfile(
  id: string,
  input: UpdateExtensionProfileInput,
): Promise<ExtensionProfile> {
  return request(`/extensions/profiles/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function archiveExtensionProfile(id: string): Promise<void> {
  return request(`/extensions/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function prepareExtensionRun(
  profileId: string,
  input: { operation: ExtensionOperation; payload: Record<string, unknown> },
): Promise<PreparedExtensionRun> {
  return request(`/extensions/profiles/${encodeURIComponent(profileId)}/runs/prepare`, {
    method: 'POST', body: JSON.stringify(input),
  })
}

export function startExtensionRun(
  profileId: string,
  input: { operation: ExtensionOperation; payload: Record<string, unknown>; confirmationHash: string },
): Promise<StartedExtensionRun> {
  return request(`/extensions/profiles/${encodeURIComponent(profileId)}/runs`, {
    method: 'POST', body: JSON.stringify(input),
  })
}

export function listExtensionRuns(profileId?: string): Promise<ExtensionRun[]> {
  return request(`/extensions/runs${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ''}`)
}

export function completeExtensionRun(
  runId: string,
  input: {
    completionToken: string
    status: Extract<ExtensionRunStatus, 'SUCCEEDED' | 'FAILED' | 'REJECTED'>
    output?: unknown
    errorCode?: string
    metadata?: Record<string, unknown>
  },
): Promise<ExtensionRun> {
  return request(`/extensions/runs/${encodeURIComponent(runId)}/complete`, {
    method: 'POST', body: JSON.stringify(input),
  })
}

export function prepareAiRequest(input: {
  profileId: string
  operation: AiOperation
  objectId?: string
  question?: string
}): Promise<PreparedAiRequest> {
  return request('/extensions/ai/prepare', { method: 'POST', body: JSON.stringify(input) })
}

export function adoptAiResult(input: {
  runId: string
  operation: AiOperation
  objectId?: string
  citationIds: string[]
  output: Record<string, unknown>
  title?: string
  spaceId?: string
}): Promise<unknown> {
  return request('/extensions/ai/adopt', { method: 'POST', body: JSON.stringify(input) })
}

export function prepareSyncSession(input: {
  profileId: string
  target: SyncTarget
}): Promise<PreparedSyncSession> {
  return request('/extensions/sync/prepare', { method: 'POST', body: JSON.stringify(input) })
}

export function startSyncPreflight(
  sessionId: string,
  input: { confirmationHash: string },
): Promise<{ sessionId: string; runId: string; status: 'PREFLIGHT_RUNNING' }> {
  return request(`/extensions/sync/preflights/${encodeURIComponent(sessionId)}/start`, {
    method: 'POST', body: JSON.stringify(input),
  })
}

export function getSyncSession(sessionId: string): Promise<SyncSession> {
  return request(`/extensions/sync/preflights/${encodeURIComponent(sessionId)}`)
}

export function commitSyncSession(sessionId: string, input: {
  preflightHash: string
  resolutions: Array<{ itemKey: string; resolution: SyncResolution }>
}): Promise<{ sessionId: string; runId?: string; status: 'COMMIT_RUNNING' | 'COMMITTED' }> {
  return request(`/extensions/sync/preflights/${encodeURIComponent(sessionId)}/commit`, {
    method: 'POST', body: JSON.stringify(input),
  })
}

export function listSmsRecipients(): Promise<SmsRecipient[]> {
  return request('/extensions/sms/recipients')
}

export function createSmsRecipient(input: {
  label: string
  maskedPhone: string
  credentialRef: string
  enabled?: boolean
}): Promise<SmsRecipient> {
  return request('/extensions/sms/recipients', { method: 'POST', body: JSON.stringify(input) })
}

export function updateSmsRecipient(
  id: string,
  input: Partial<Pick<SmsRecipient, 'label' | 'maskedPhone' | 'credentialRef' | 'enabled'>>,
): Promise<SmsRecipient> {
  return request(`/extensions/sms/recipients/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(input),
  })
}

export function archiveSmsRecipient(id: string): Promise<void> {
  return request(`/extensions/sms/recipients/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
