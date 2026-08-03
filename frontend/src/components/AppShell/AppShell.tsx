import { Suspense, useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { matchRoutes, Outlet, useLocation, useNavigate, type RouteObject } from 'react-router-dom'
import routes, { primaryNavigation, type RouteDefinition } from '@/router/routes'
import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceNavigation } from './WorkspaceNavigation'
import { RouteHistoryTitleProvider } from './RouteHistoryTitleProvider'
import './AppShell.less'

interface AppShellProps {
  skeleton?: ReactNode
}

const routeMatchers: RouteObject[] = routes.map((route) => ({ id: route.path, path: route.path }))

function findActiveRoute(pathname: string): RouteDefinition | undefined {
  const matches = matchRoutes(routeMatchers, pathname)
  const activeRouteId = matches?.[matches.length - 1]?.route.id
  return routes.find((route) => route.path === activeRouteId)
}

function resolveInternalNotificationPath(sourcePath: string): string | undefined {
  if (!sourcePath.startsWith('/') || sourcePath.startsWith('//') || sourcePath.includes('\\')) {
    return undefined
  }

  try {
    const localOrigin = 'http://rd-workbench.local'
    const target = new URL(sourcePath, localOrigin)
    const matches = matchRoutes(routeMatchers, target.pathname)
    const activeRouteId = matches?.[matches.length - 1]?.route.id
    if (target.origin !== localOrigin || !activeRouteId || activeRouteId === '*') return undefined
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return undefined
  }
}

export function AppShell({ skeleton = null }: AppShellProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  const contentRef = useRef<HTMLElement>(null)
  const activeRoute = findActiveRoute(pathname)

  useEffect(() => {
    navigateRef.current = navigate
  }, [navigate])

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0
    }
  }, [pathname])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.rdWorkbenchDesktop) return undefined
    return window.rdWorkbenchDesktop.onNotificationClicked((sourcePath) => {
      const target = resolveInternalNotificationPath(sourcePath)
      if (target) void navigateRef.current(target)
    })
  }, [])

  return (
    <RouteHistoryTitleProvider routeKey={pathname}>
      <div className="app-shell">
        <WorkspaceNavigation items={primaryNavigation} />
        <div className="app-shell__main">
          <WorkspaceHeader route={activeRoute} />
          <main className="app-shell__content" ref={contentRef}>
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                className="app-shell__page"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                <Suspense fallback={skeleton}>
                  <Outlet />
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </RouteHistoryTitleProvider>
  )
}

export default AppShell
