import { Suspense, type ReactNode } from 'react'
import { matchPath, Outlet, useLocation } from 'react-router-dom'
import routes, { primaryNavigation, type RouteDefinition } from '@/router/routes'
import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceNavigation } from './WorkspaceNavigation'
import './AppShell.less'

interface AppShellProps {
  skeleton?: ReactNode
}

function findActiveRoute(pathname: string): RouteDefinition | undefined {
  return routes.find(
    (route) =>
      route.path !== '*' &&
      (route.path === '/'
        ? pathname === route.path
        : matchPath({ path: route.path, end: false }, pathname))
  )
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
