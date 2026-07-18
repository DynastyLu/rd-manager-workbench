interface AppConfig {
  sentryDsn: string
  apiBaseUrl: string
  socketUrl: string
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

const raw = window.__APP_CONFIG__

export const config: Readonly<AppConfig> = Object.freeze({
  sentryDsn: readString(raw?.sentryDsn) || readString(import.meta.env.VITE_SENTRY_DSN),
  apiBaseUrl: readString(raw?.apiBaseUrl) || readString(import.meta.env.VITE_API_BASE_URL),
  socketUrl: readString(raw?.socketUrl) || readString(import.meta.env.VITE_SOCKET_URL),
})
