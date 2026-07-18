/// <reference types="vite/client" />

interface RdWorkbenchDesktopBridge {
  onNotificationClicked(callback: (sourcePath: string) => void): () => void
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
