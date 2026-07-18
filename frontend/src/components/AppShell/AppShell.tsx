import { Suspense, type ReactNode } from 'react'
import { matchPath, Outlet, useLocation } from 'react-router-dom'
import routes, { primaryNavigation, type RouteDefinition } from '@/router/routes'
import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceNavigation } from './WorkspaceNavigation'
import './AppShell.less'

interface AppShellProps {
  skeleton?: ReactNode
}

function routeMatchPriority(path: string) {
  return path
    .split('/')
    .filter(Boolean)
    .reduce((score, segment) => score + (segment.startsWith(':') ? 1 : 10), 0)
}

function findActiveRoute(pathname: string): RouteDefinition | undefined {
  return routes
    .filter(
      (route) =>
        route.path !== '*' &&
        (route.path === '/'
          ? pathname === route.path
          : matchPath({ path: route.path, end: false }, pathname))
    )
    .sort(
      (left, right) =>
        routeMatchPriority(right.path) - routeMatchPriority(left.path) ||
        right.path.length - left.path.length
    )[0]
}

export function AppShell({ skeleton = null }: AppShellProps) {
  const { pathname } = useLocation()
  const activeRoute = findActiveRoute(pathname)

  return (
    <div className="app-shell">
      <WorkspaceNavigation items={primaryNavigation} />
      <div className="app-shell__main">
        <WorkspaceHeader route={activeRoute} />
        <main className="app-shell__content">
          <Suspense fallback={skeleton}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}

export default AppShell
