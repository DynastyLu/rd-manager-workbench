import '@douyinfe/semi-ui/lib/es/react19-adapter'

// 读完运行时配置后清除 window 引用，防止外部脚本篡改
delete window.__APP_CONFIG__

function getPersistedTheme(): 'aurora' | 'eye-care' {
  try {
    const raw = localStorage.getItem('rd-workbench-theme')
    if (!raw) return 'aurora'
    const parsed: unknown = JSON.parse(raw)
    const value =
      parsed && typeof parsed === 'object' && 'state' in parsed
        ? (parsed as { state?: unknown }).state
        : parsed
    if (value === 'aurora' || value === 'eye-care') return value
  } catch {
    // 忽略损坏的 localStorage 值，避免阻塞启动
  }
  return 'aurora'
}

const theme = getPersistedTheme()
document.documentElement.setAttribute('data-theme', theme)

import { type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import '@douyinfe/semi-ui/lib/es/_base/base.css'
import '@/index.css'
import './animations.css'
import '@/styles/workspace-tokens.css'
import '@/styles/luminous-skin.css'
import '@/lib/i18n' // i18n initialisation (side effect)

import { MotionConfig } from 'framer-motion'

import { ErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary'
import { AppShell } from '@/components/AppShell/AppShell'
import { Skeleton } from '@/components/workspace/SemiCompat'
import { AuthProvider } from '@/modules/auth/AuthProvider'
import { RequireAuth } from '@/modules/auth/RequireAuth'

import { Toaster } from 'sonner'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { protectedRoutes, publicRoutes, type AppRoute } from '@/router/routes'
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
          <AuthProvider>
            <MotionConfigProvider>
              <Routes>
                {publicRoutes.map((route: AppRoute) => (
                  <Route key={route.path} path={route.path} element={<route.component />} />
                ))}
                <Route element={<RequireAuth />}>
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
                    {protectedRoutes.map((route: AppRoute) => (
                      <Route key={route.path} path={route.path} element={<route.component />} />
                    ))}
                  </Route>
                </Route>
              </Routes>
              <UpdateNotifier />
            </MotionConfigProvider>
          </AuthProvider>
        </HashRouter>
      </QueryClientProvider>
    </ErrorBoundary>
    <Toaster position="top-right" richColors />
  </Sentry.ErrorBoundary>
)
