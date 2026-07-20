/// <reference types="vite/client" />

interface RdWorkbenchDesktopBridge {
  onNotificationClicked(callback: (sourcePath: string) => void): () => void
  chooseBackupDirectory?(): Promise<string | null>
  restoreBackup?(input: {
    backupId: string
    preflightId: string
    confirmationToken: string
    expectedHash: string
  }): Promise<void>
  credentials?: {
    isAvailable(): Promise<boolean>
    put(ref: string, secretObject: Record<string, unknown>): Promise<void>
    has(ref: string): Promise<boolean>
    delete(ref: string): Promise<void>
  }
  extensions?: {
    execute(input: {
      runId: string
      profile: {
        id: string
        kind: 'SMS' | 'AI' | 'CALENDAR' | 'CLOUD_DRIVE'
        provider: 'LOCAL_PREVIEW' | 'ALIYUN_SMS' | 'LOCAL_MANUAL' | 'OPENAI_RESPONSES' | 'CALDAV' | 'WEBDAV'
        enabled: boolean
        publicConfig: Record<string, unknown>
        credentialRef?: string | null
        permissions?: string[]
      }
      operation: string
      payload: Record<string, unknown>
    }): Promise<{
      status: 'SUCCEEDED' | 'FAILED' | 'REJECTED'
      errorCode?: string
      metadata?: Record<string, unknown>
      output?: Record<string, unknown>
    }>
  }
}

interface RdWorkbenchRuntimeConfig {
  sentryDsn?: string
  apiBaseUrl?: string
  socketUrl?: string
}

interface Window {
  __APP_CONFIG__?: RdWorkbenchRuntimeConfig
  rdWorkbenchDesktop?: RdWorkbenchDesktopBridge
}

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_SOCKET_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
