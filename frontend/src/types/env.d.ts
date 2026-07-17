/// <reference types="vite/client" />

interface Window {
  __APP_CONFIG__?: Record<string, unknown>
}

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
