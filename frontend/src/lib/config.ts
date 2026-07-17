interface AppConfig {
  apiBaseUrl: string
  wsUrl: string
  sentryDsn: string
  features: {
    ocrBatchUpload: boolean
    adminPanel: boolean
  }
}

type WindowWithConfig = Window & { __APP_CONFIG__?: AppConfig }

const raw = (window as WindowWithConfig).__APP_CONFIG__

export const config: Readonly<AppConfig> = Object.freeze({
  apiBaseUrl: raw?.apiBaseUrl ?? import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000',
  wsUrl: raw?.wsUrl ?? import.meta.env.VITE_WS_URL ?? 'ws://localhost:3000',
  sentryDsn: raw?.sentryDsn ?? import.meta.env.VITE_SENTRY_DSN ?? '',
  features: Object.freeze({
    ocrBatchUpload: raw?.features?.ocrBatchUpload ?? true,
    adminPanel: raw?.features?.adminPanel ?? true,
  }),
})
