import { createContext, useContext, useEffect } from 'react'

export interface RouteHistoryTitleContextValue {
  routeKey: string
  title?: string
  setTitle: (routeKey: string, title?: string) => void
}

export const RouteHistoryTitleContext = createContext<RouteHistoryTitleContextValue | null>(null)

export function useRouteHistoryTitle(title?: string) {
  const context = useContext(RouteHistoryTitleContext)

  useEffect(() => {
    if (!context) return
    context.setTitle(context.routeKey, title)
  }, [context, title])
}

export function useCurrentRouteHistoryTitle(): string | undefined {
  return useContext(RouteHistoryTitleContext)?.title
}
