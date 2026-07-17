/// <reference types="vite/client" />

interface Window {
  __APP_CONFIG__?: Record<string, unknown>
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_WS_URL: string
  readonly VITE_SENTRY_DSN: string
  readonly VITE_USE_MOCK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
