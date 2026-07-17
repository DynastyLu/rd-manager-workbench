interface AppConfig {
  sentryDsn: string
}

type WindowWithConfig = Window & { __APP_CONFIG__?: AppConfig }

const raw = (window as WindowWithConfig).__APP_CONFIG__

export const config: Readonly<AppConfig> = Object.freeze({
  sentryDsn: raw?.sentryDsn ?? import.meta.env.VITE_SENTRY_DSN ?? '',
})
