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

import { lazy, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import '@/index.css'
import '@/lib/i18n' // i18n initialisation (side effect)

import { MotionConfig } from 'framer-motion'
import { useThemeStore } from '@/stores/theme'

import { ErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary'
import Layout from '@/components/Layout/Layout'
import ProtectedRoute from '@/components/ProtectedRoute/ProtectedRoute'
import { Skeleton } from '@/components/ui/skeleton'

import { useAuthStore } from '@/stores/auth'
import { Toaster } from 'sonner'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ROUTES } from '@/constants/routes'
import routes, { type AppRoute } from '@/router/routes'
import { config } from '@/lib/config'
import * as Sentry from '@sentry/react'
import { UpdateNotifier } from '@/components/UpdateNotifier/UpdateNotifier'

// Login is standalone and small — lazy is fine here too
// eslint-disable-next-line react-refresh/only-export-components
const Login = lazy(() => import('@/pages/Login'))
// eslint-disable-next-line react-refresh/only-export-components
const Admin = lazy(() => import('@/pages/Admin'))
// eslint-disable-next-line react-refresh/only-export-components
const AdminUsers = lazy(() => import('@/pages/AdminUsers'))

// eslint-disable-next-line react-refresh/only-export-components
function MotionConfigProvider({ children }: { children: ReactNode }) {
  const theme = useThemeStore((s) => s.theme)
  return (
    <MotionConfig reducedMotion={theme === 'classic' ? 'always' : 'user'}>{children}</MotionConfig>
  )
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

async function enableMocking(): Promise<void> {
  // Set VITE_USE_MOCK=false in .env.local to bypass MSW and hit the real backend
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK !== 'false') {
    const { worker } = await import('./mocks/browser')
    await worker.start({ onUnhandledRequest: 'bypass' })
  }
}

async function initializeAuth(): Promise<void> {
  await enableMocking()
  await useAuthStore
    .getState()
    .refreshAccessToken()
    .finally(() => {
      useAuthStore.getState().setLoading(false)
    })
}

void initializeAuth()

createRoot(document.getElementById('root')!).render(
  <Sentry.ErrorBoundary
    fallback={<p>应用发生错误，请刷新页面</p>}
    showDialog={import.meta.env.PROD}
  >
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <MotionConfigProvider>
            <Routes>
              <Route path={ROUTES.LOGIN} element={<Login />} />

              <Route element={<ProtectedRoute requireAdmin />}>
                <Route
                  element={
                    <Layout
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
                  <Route path={ROUTES.ADMIN} element={<Admin />} />
                  <Route path={ROUTES.ADMIN_USERS} element={<AdminUsers />} />
                </Route>
              </Route>

              <Route element={<ProtectedRoute />}>
                <Route
                  element={
                    <Layout
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
                  {routes
                    .filter((r: AppRoute) => !r.requireAdmin && !r.headerOnly)
                    .map((r: AppRoute) => (
                      <Route key={r.path} path={r.path} element={<r.component />} />
                    ))}
                </Route>
              </Route>
            </Routes>
            <UpdateNotifier />
          </MotionConfigProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
    <Toaster position="top-right" richColors />
  </Sentry.ErrorBoundary>
)
