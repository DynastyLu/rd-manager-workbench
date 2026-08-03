export interface RouteHistoryEntry {
  key: string
  href: string
  title: string
  pattern: string
  visitedAt: number
  pinned: boolean
}

export interface RouteVisit {
  pathname: string
  href: string
  title: string
  pattern: string
  visitedAt: number
}

export const MAX_HISTORY_ENTRIES = 21

const OVERFLOW_BUTTON_WIDTH = 42

function estimateEntryWidth(entry: RouteHistoryEntry): number {
  const textWidth = Array.from(entry.title).length * 14
  return Math.max(64, Math.min(152, textWidth + (entry.pinned ? 30 : 54)))
}

export function selectVisibleHistoryKeys(
  entries: RouteHistoryEntry[],
  activeKey: string,
  availableWidth: number,
  measuredWidths: ReadonlyMap<string, number>,
  overflowButtonWidth = OVERFLOW_BUTTON_WIDTH,
): Set<string> {
  if (!entries.length) return new Set()

  const widthOf = (entry: RouteHistoryEntry) =>
    measuredWidths.get(entry.key) ?? estimateEntryWidth(entry)
  const totalWidth = entries.reduce((sum, entry) => sum + widthOf(entry), 0)
  if (!Number.isFinite(availableWidth) || totalWidth <= availableWidth) {
    return new Set(entries.map((entry) => entry.key))
  }

  const home = entries.find((entry) => entry.pinned || entry.key === '/')
  const active = entries.find((entry) => entry.key === activeKey)
  const mandatory = new Set<string>()
  if (home) mandatory.add(home.key)
  if (active) mandatory.add(active.key)

  let usedWidth = overflowButtonWidth
  for (const entry of entries) {
    if (mandatory.has(entry.key)) usedWidth += widthOf(entry)
  }

  const candidates = entries
    .filter((entry) => !mandatory.has(entry.key))
    .sort((left, right) => right.visitedAt - left.visitedAt)

  for (const candidate of candidates) {
    const width = widthOf(candidate)
    if (usedWidth + width <= availableWidth) {
      mandatory.add(candidate.key)
      usedWidth += width
    }
  }

  return mandatory
}

const SENSITIVE_QUERY_KEYS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'password',
  'secret',
  'code',
])

export function normalizeRouteKey(pathname: string, pattern: string): string {
  const normalizedPath = pathname.replace(/\/$/, '') || '/'

  if (pattern === '/spaces/projects/:projectId/:section?') {
    return normalizedPath.match(/^\/spaces\/projects\/[^/]+/)?.[0] ?? normalizedPath
  }

  return normalizedPath
}

export function sanitizeHistoryHref(href: string): string {
  try {
    const origin = 'http://rd-workbench.local'
    const url = new URL(href, origin)
    if (url.origin !== origin) return '/'

    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        url.searchParams.delete(key)
      }
    }

    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}

export function createHistoryEntry(
  key: string,
  href: string,
  pattern: string,
  title: string,
  pinned: boolean,
  visitedAt: number,
): RouteHistoryEntry {
  return { key, href, pattern, title, pinned, visitedAt }
}

function evictOverflow(entries: RouteHistoryEntry[], activeKey: string): RouteHistoryEntry[] {
  if (entries.length <= MAX_HISTORY_ENTRIES) return entries

  const removable = entries
    .filter((entry) => !entry.pinned && entry.key !== activeKey)
    .sort((left, right) => left.visitedAt - right.visitedAt)
  const removeCount = entries.length - MAX_HISTORY_ENTRIES
  const removedKeys = new Set(removable.slice(0, removeCount).map((entry) => entry.key))
  return entries.filter((entry) => !removedKeys.has(entry.key))
}

export function visitHistoryEntry(
  entries: RouteHistoryEntry[],
  visit: RouteVisit,
): RouteHistoryEntry[] {
  const key = normalizeRouteKey(visit.pathname, visit.pattern)
  const existingIndex = entries.findIndex((entry) => entry.key === key)
  const nextEntry = createHistoryEntry(
    key,
    visit.href,
    visit.pattern,
    visit.title,
    key === '/',
    visit.visitedAt,
  )

  if (existingIndex >= 0) {
    const existing = entries[existingIndex]!
    const next = [...entries]
    next[existingIndex] = { ...nextEntry, pinned: existing.pinned || key === '/' }
    return evictOverflow(next, key)
  }

  const next = key === '/' ? [nextEntry, ...entries] : [...entries, nextEntry]
  return evictOverflow(next, key)
}

export function closeHistoryEntry(
  entries: RouteHistoryEntry[],
  key: string,
  activeKey: string,
): { entries: RouteHistoryEntry[]; nextHref?: string } {
  const index = entries.findIndex((entry) => entry.key === key)
  if (index < 0 || entries[index]?.pinned) return { entries }

  const remaining = entries.filter((entry) => entry.key !== key)
  if (key !== activeKey) return { entries: remaining }

  const target = remaining[index - 1] ?? remaining[index] ?? remaining.find((entry) => entry.pinned)
  return { entries: remaining, nextHref: target?.href }
}

export function closeOtherHistoryEntries(
  entries: RouteHistoryEntry[],
  key: string,
): RouteHistoryEntry[] {
  return entries.filter((entry) => entry.pinned || entry.key === key)
}

function isHistoryEntry(value: unknown): value is RouteHistoryEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.key === 'string' &&
    entry.key.startsWith('/') &&
    typeof entry.href === 'string' &&
    entry.href.startsWith('/') &&
    typeof entry.title === 'string' &&
    entry.title.trim().length > 0 &&
    typeof entry.pattern === 'string' &&
    Number.isFinite(entry.visitedAt) &&
    typeof entry.pinned === 'boolean'
  )
}

export function parseStoredHistory(raw: string | null): RouteHistoryEntry[] {
  if (!raw) return []

  try {
    const parsed: unknown = JSON.parse(raw)
    const candidate = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { entries?: unknown }).entries)
        ? (parsed as { entries: unknown[] }).entries
        : []
    const seen = new Set<string>()
    return candidate
      .filter(isHistoryEntry)
      .filter((entry) => {
        if (seen.has(entry.key)) return false
        seen.add(entry.key)
        return true
      })
      .slice(0, MAX_HISTORY_ENTRIES)
      .map((entry) => ({
        ...entry,
        href: sanitizeHistoryHref(entry.href),
        pinned: entry.key === '/',
      }))
  } catch {
    return []
  }
}
