import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  RouteHistoryTitleContext,
  type RouteHistoryTitleContextValue,
} from './RouteHistoryTitleContext'

export function RouteHistoryTitleProvider({
  routeKey,
  children,
}: {
  routeKey: string
  children: ReactNode
}) {
  const [override, setOverride] = useState<{ routeKey: string; title?: string }>({ routeKey })
  const setTitle = useCallback((nextRouteKey: string, title?: string) => {
    setOverride((current) => {
      const normalizedTitle = title?.trim() || undefined
      if (current.routeKey === nextRouteKey && current.title === normalizedTitle) return current
      return { routeKey: nextRouteKey, title: normalizedTitle }
    })
  }, [])
  const value = useMemo<RouteHistoryTitleContextValue>(
    () => ({
      routeKey,
      title: override.routeKey === routeKey ? override.title : undefined,
      setTitle,
    }),
    [override, routeKey, setTitle],
  )

  return (
    <RouteHistoryTitleContext.Provider value={value}>
      {children}
    </RouteHistoryTitleContext.Provider>
  )
}
