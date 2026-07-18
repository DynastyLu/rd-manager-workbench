import { Suspense, type ReactNode } from 'react'
import { matchRoutes, Outlet, useLocation, type RouteObject } from 'react-router-dom'
import routes, { primaryNavigation, type RouteDefinition } from '@/router/routes'
import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceNavigation } from './WorkspaceNavigation'
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
