export const extensionKinds = ['SMS', 'AI', 'CALENDAR', 'CLOUD_DRIVE'] as const
export type ExtensionKind = (typeof extensionKinds)[number]

export const extensionProviders = [
  'ALIYUN_SMS',
  'LOCAL_PREVIEW',
  'OPENAI_RESPONSES',
  'LOCAL_MANUAL',
  'CALDAV',
  'WEBDAV',
] as const
export type ExtensionProvider = (typeof extensionProviders)[number]

export const extensionOperations = [
  'TEST_CONNECTION',
  'SMS_PREVIEW',
  'SMS_SEND',
  'AI_SUMMARIZE_MEETING',
  'AI_SUMMARIZE_DOCUMENT',
  'AI_KNOWLEDGE_QA',
  'CALENDAR_SYNC_PREFLIGHT',
  'CALENDAR_SYNC_COMMIT',
  'CLOUD_UPLOAD_PREFLIGHT',
  'CLOUD_UPLOAD_COMMIT',
  'CLOUD_DOWNLOAD_PREFLIGHT',
  'CLOUD_DOWNLOAD_COMMIT',
] as const
export type ExtensionOperation = (typeof extensionOperations)[number]

export interface ExtensionExecutionInput {
  runId: string
  profile: {
    id: string
    kind: ExtensionKind
    provider: ExtensionProvider
    enabled: boolean
    publicConfig: Record<string, unknown>
    credentialRef?: string | null
    permissions?: string[]
  }
  operation: ExtensionOperation
  payload: Record<string, unknown>
}

export interface ExtensionExecutionResult {
  status: 'SUCCEEDED' | 'FAILED' | 'REJECTED'
  errorCode?: string
  metadata?: Record<string, unknown>
  output?: Record<string, unknown>
}
