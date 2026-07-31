import '@douyinfe/semi-ui/lib/es/react19-adapter'

// 读完运行时配置后清除 window 引用，防止外部脚本篡改
delete window.__APP_CONFIG__

import { DEFAULT_THEME, THEME_STORAGE_NAME, resolveStoredTheme } from '@/stores/theme'

// Sync theme before React renders (prevents flash during Zustand persist hydration)
const _initialTheme = (() => {
  try {
    return resolveStoredTheme(localStorage.getItem(THEME_STORAGE_NAME))
  } catch {
    return DEFAULT_THEME
  }
})()
document.documentElement.setAttribute('data-theme', _initialTheme)

import { type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import '@douyinfe/semi-ui/lib/es/_base/base.css'
import '@/index.css'
import './animations.css'
import '@/styles/workspace-tokens.css'
import '@/lib/i18n' // i18n initialisation (side effect)

import { MotionConfig } from 'framer-motion'

import { ErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary'
import { AppShell } from '@/components/AppShell/AppShell'
import { Skeleton } from '@/components/workspace/SemiCompat'

import { Toaster } from 'sonner'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import routes, { type AppRoute } from '@/router/routes'
import { config } from '@/lib/config'
import * as Sentry from '@sentry/react'
import { UpdateNotifier } from '@/components/UpdateNotifier/UpdateNotifier'

// eslint-disable-next-line react-refresh/only-export-components
function MotionConfigProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}

Sentry.init({
  dsn: config.sentryDsn,
  environment: import.meta.env.MODE,
  enabled: import.meta.env.PROD,
  tracesSampleRate: 0.2,
  integrations: [Sentry.browserTracingIntegration()],
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 分钟内不重复请求
      gcTime: 1000 * 60 * 10, // 10 分钟无人使用后清除缓存
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <Sentry.ErrorBoundary
    fallback={<p>应用发生错误，请刷新页面</p>}
    showDialog={import.meta.env.PROD}
  >
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <MotionConfigProvider>
            <Routes>
              <Route
                element={
                  <AppShell
                    skeleton={
                      <div className="flex flex-col gap-4 p-6">
                        <Skeleton className="h-8 w-48" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                      </div>
                    }
                  />
                }
              >
                {routes.map((route: AppRoute) => (
                  <Route key={route.path} path={route.path} element={<route.component />} />
                ))}
              </Route>
            </Routes>
            <UpdateNotifier />
          </MotionConfigProvider>
        </HashRouter>
      </QueryClientProvider>
    </ErrorBoundary>
    <Toaster position="top-right" richColors />
  </Sentry.ErrorBoundary>
)
