import { SEARCH_TYPES, type SearchType } from '@/modules/workbench/api/search'

export const RECENT_SEARCHES_STORAGE_KEY = 'rd-workbench:recent-searches:v1'

const MAX_RECENT_SEARCHES = 20
const searchTypeSet = new Set<string>(SEARCH_TYPES)

export interface RecentSearch {
  query: string
  types: SearchType[]
  lastUsedAt: string
  useCount: number
}

export interface RecentSearchIdentity {
  query: string
  types: SearchType[]
}

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/gu, ' ')
}

function normalizeTypes(types: SearchType[]): SearchType[] {
  return [...new Set(types)].sort((left, right) => left.localeCompare(right))
}

function identityOf(input: RecentSearchIdentity): string {
  return JSON.stringify([normalizeQuery(input.query), normalizeTypes(input.types)])
}

function isRecentSearch(value: unknown): value is RecentSearch {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.query === 'string' &&
    normalizeQuery(candidate.query).length > 0 &&
    Array.isArray(candidate.types) &&
    candidate.types.every((type) => typeof type === 'string' && searchTypeSet.has(type)) &&
    typeof candidate.lastUsedAt === 'string' &&
    Number.isFinite(Date.parse(candidate.lastUsedAt)) &&
    typeof candidate.useCount === 'number' &&
    Number.isInteger(candidate.useCount) &&
    candidate.useCount > 0
  )
}

function persistRecentSearches(items: RecentSearch[]): void {
  try {
    localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Search remains usable when the renderer denies or exhausts local storage.
  }
}

export function loadRecentSearches(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || !parsed.every(isRecentSearch)) return []
    return parsed
      .map((item) => ({
        ...item,
        query: normalizeQuery(item.query),
        types: normalizeTypes(item.types),
      }))
      .sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt))
      .slice(0, MAX_RECENT_SEARCHES)
  } catch {
    return []
  }
}

export function recordRecentSearch(input: RecentSearchIdentity): RecentSearch[] {
  const query = normalizeQuery(input.query)
  if (!query) return loadRecentSearches()

  const types = normalizeTypes(input.types)
  const identity = identityOf({ query, types })
  const previous = loadRecentSearches()
  const matching = previous.find((item) => identityOf(item) === identity)
  const next: RecentSearch[] = [
    {
      query,
      types,
      lastUsedAt: new Date().toISOString(),
      useCount: (matching?.useCount ?? 0) + 1,
    },
    ...previous.filter((item) => identityOf(item) !== identity),
  ].slice(0, MAX_RECENT_SEARCHES)

  persistRecentSearches(next)
  return next
}

export function removeRecentSearch(input: RecentSearchIdentity): RecentSearch[] {
  const identity = identityOf(input)
  const next = loadRecentSearches().filter((item) => identityOf(item) !== identity)
  persistRecentSearches(next)
  return next
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY)
  } catch {
    // Clearing history is best-effort and must not block the search workspace.
  }
}
