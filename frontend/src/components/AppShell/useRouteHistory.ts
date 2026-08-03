import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { RouteDefinition } from '@/router/routes'
import {
  closeHistoryEntry,
  closeOtherHistoryEntries,
  createHistoryEntry,
  normalizeRouteKey,
  parseStoredHistory,
  sanitizeHistoryHref,
  visitHistoryEntry,
  type RouteHistoryEntry,
} from './routeHistory'

const STORAGE_PREFIX = 'rd-workbench:route-history:v1:'

interface UseRouteHistoryInput {
  userId?: string
  pathname: string
  search: string
  hash: string
  route?: RouteDefinition
  titleOverride?: string
}

export interface RouteHistoryController {
  entries: RouteHistoryEntry[]
  activeKey: string
  open: (key: string) => void
  close: (key: string) => void
  closeOthers: (key: string) => void
}

interface HistoryState {
  userId?: string
  entries: RouteHistoryEntry[]
}

export function routeHistoryStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`
}

function homeEntry(): RouteHistoryEntry {
  return createHistoryEntry('/', '/', '/', '工作台', true, 0)
}

function restoreEntries(userId?: string): RouteHistoryEntry[] {
  if (!userId) return [homeEntry()]
  const restored = parseStoredHistory(localStorage.getItem(routeHistoryStorageKey(userId)))
  const withoutHome = restored.filter((entry) => entry.key !== '/')
  const restoredHome = restored.find((entry) => entry.key === '/')
  return [{ ...(restoredHome ?? homeEntry()), pinned: true }, ...withoutHome]
}

function persistEntries(userId: string, entries: RouteHistoryEntry[]): void {
  const safeEntries = entries.map((entry) => ({
    ...entry,
    href: sanitizeHistoryHref(entry.href),
  }))
  localStorage.setItem(
    routeHistoryStorageKey(userId),
    JSON.stringify({ version: 1, entries: safeEntries }),
  )
}

function isRecordableRoute(route?: RouteDefinition): route is RouteDefinition {
  return Boolean(route && route.path !== '*' && !route.redirectTo)
}

export function useRouteHistory({
  userId,
  pathname,
  search,
  hash,
  route,
  titleOverride,
}: UseRouteHistoryInput): RouteHistoryController {
  const navigate = useNavigate()
  const [state, setState] = useState<HistoryState>(() => ({
    userId,
    entries: restoreEntries(userId),
  }))
  const currentState = useMemo<HistoryState>(
    () => (state.userId === userId ? state : { userId, entries: restoreEntries(userId) }),
    [state, userId],
  )
  const activeKey = useMemo(
    () => normalizeRouteKey(pathname, route?.path ?? pathname),
    [pathname, route?.path],
  )

  useEffect(() => {
    if (!userId || !isRecordableRoute(route)) return
    const href = `${pathname}${search}${hash}`
    const title = titleOverride?.trim() || route.title
    // Router location is external state; record its settled value after navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((current) => {
      const base = current.userId === userId ? current : { userId, entries: restoreEntries(userId) }
      const entries = visitHistoryEntry(base.entries, {
        pathname,
        href,
        pattern: route.path,
        title,
        visitedAt: Date.now(),
      })
      return { ...current, entries }
    })
  }, [hash, pathname, route, search, titleOverride, userId])

  useEffect(() => {
    if (!userId || currentState.userId !== userId) return
    persistEntries(userId, currentState.entries)
  }, [currentState.entries, currentState.userId, userId])

  const open = useCallback(
    (key: string) => {
      const target = currentState.entries.find((entry) => entry.key === key)
      if (target) void navigate(target.href)
    },
    [currentState.entries, navigate],
  )

  const close = useCallback(
    (key: string) => {
      const result = closeHistoryEntry(currentState.entries, key, activeKey)
      if (result.entries === currentState.entries) return
      setState({ userId, entries: result.entries })
      if (result.nextHref) void navigate(result.nextHref)
    },
    [activeKey, currentState.entries, navigate, userId],
  )

  const closeOthers = useCallback(
    (key: string) => {
      setState({
        userId,
        entries: closeOtherHistoryEntries(currentState.entries, key),
      })
    },
    [currentState.entries, userId],
  )

  return { entries: currentState.entries, activeKey, open, close, closeOthers }
}
