import { ApiError, request } from '@/lib/http'

export const SEARCH_TYPES = [
  'PROJECT',
  'TASK',
  'APPLICATION_CASE',
  'MEETING',
  'DOCUMENT',
  'FILE',
  'RISK',
  'ISSUE',
  'DECISION',
  'PARTNER',
  'COMMUNICATION',
  'NON_PROJECT_RD',
  'INTELLIGENCE_ITEM',
  'BASE_RECORD',
] as const

export type SearchType = (typeof SEARCH_TYPES)[number]

export const SEARCH_ACTIONS = [
  'OPEN',
  'COPY_LINK',
  'COMPLETE_TASK',
  'REOPEN_TASK',
  'TOGGLE_DOCUMENT_FAVORITE',
  'CLOSE_RISK',
] as const

export type SearchAction = (typeof SEARCH_ACTIONS)[number]
export type SearchMatchField = 'title' | 'snippet'

export interface SearchMatch {
  field: SearchMatchField
  start: number
  end: number
}

export interface SearchHit {
  type: SearchType
  id: string
  title: string
  snippet: string | null
  path: string
  updatedAt: string
  score: number
  matches: SearchMatch[]
  actions: SearchAction[]
}

export interface SearchPartialFailure {
  types: SearchType[]
  code: 'SEARCH_PARTIAL_FAILURE'
  message: string
}

export interface GlobalSearchResult {
  data: SearchHit[]
  groups: Array<{ type: SearchType; count: number }>
  meta: { page: number; pageSize: number; total: number }
  partialFailures: SearchPartialFailure[]
}

export interface SearchWorkbenchParams {
  query: string
  types?: SearchType[]
  page?: number
  pageSize?: number
}

export type SearchActionInput =
  | { action: 'COMPLETE_TASK' | 'REOPEN_TASK' | 'TOGGLE_DOCUMENT_FAVORITE' }
  | { action: 'CLOSE_RISK'; confirm: true }

const searchTypeSet = new Set<string>(SEARCH_TYPES)
const searchActionSet = new Set<string>(SEARCH_ACTIONS)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSearchType(value: unknown): value is SearchType {
  return typeof value === 'string' && searchTypeSet.has(value)
}

function isSearchAction(value: unknown): value is SearchAction {
  return typeof value === 'string' && searchActionSet.has(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isSearchMatch(value: unknown): value is SearchMatch {
  if (!isRecord(value)) return false
  return (
    (value.field === 'title' || value.field === 'snippet') &&
    isNonNegativeInteger(value.start) &&
    isNonNegativeInteger(value.end) &&
    value.end > value.start
  )
}

function isLocalWorkbenchPath(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return false
  if (value.includes('\\')) return false
  if (
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    return false
  }
  return !/^[a-z][a-z\d+.-]*:/iu.test(value.slice(1))
}

function isSearchHit(value: unknown): value is SearchHit {
  if (!isRecord(value)) return false
  return (
    isSearchType(value.type) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.title === 'string' &&
    (value.snippet === null || typeof value.snippet === 'string') &&
    isLocalWorkbenchPath(value.path) &&
    typeof value.updatedAt === 'string' &&
    Number.isFinite(Date.parse(value.updatedAt)) &&
    typeof value.score === 'number' &&
    Number.isFinite(value.score) &&
    Array.isArray(value.matches) &&
    value.matches.every(isSearchMatch) &&
    Array.isArray(value.actions) &&
    value.actions.every(isSearchAction)
  )
}

function isSearchPartialFailure(value: unknown): value is SearchPartialFailure {
  if (!isRecord(value)) return false
  return (
    Array.isArray(value.types) &&
    value.types.every(isSearchType) &&
    value.code === 'SEARCH_PARTIAL_FAILURE' &&
    typeof value.message === 'string'
  )
}

function parseSearchResult(value: unknown): GlobalSearchResult {
  if (!isRecord(value) || !Array.isArray(value.data) || !value.data.every(isSearchHit)) {
    throw malformedSearchResponse()
  }
  if (
    !Array.isArray(value.groups) ||
    !value.groups.every(
      (group) => isRecord(group) && isSearchType(group.type) && isNonNegativeInteger(group.count)
    )
  ) {
    throw malformedSearchResponse()
  }
  if (
    !isRecord(value.meta) ||
    !isPositiveInteger(value.meta.page) ||
    !isPositiveInteger(value.meta.pageSize) ||
    !isNonNegativeInteger(value.meta.total)
  ) {
    throw malformedSearchResponse()
  }

  const partialFailures = value.partialFailures ?? []
  if (!Array.isArray(partialFailures) || !partialFailures.every(isSearchPartialFailure)) {
    throw malformedSearchResponse()
  }

  return {
    data: value.data,
    groups: value.groups as GlobalSearchResult['groups'],
    meta: value.meta as GlobalSearchResult['meta'],
    partialFailures,
  }
}

function malformedSearchResponse(): ApiError {
  return new ApiError('The search API returned an invalid response.', 200, 'MALFORMED_RESPONSE')
}

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/gu, ' ')
}

export async function searchWorkbench(params: SearchWorkbenchParams): Promise<GlobalSearchResult> {
  const query = new URLSearchParams({ q: normalizeQuery(params.query) })
  if (params.types?.length) query.set('types', params.types.join(','))
  if (params.page !== undefined) query.set('page', String(params.page))
  if (params.pageSize !== undefined) query.set('pageSize', String(params.pageSize))

  const response = await request<unknown>(`/search?${query.toString()}`)
  return parseSearchResult(response)
}

export async function runSearchAction(
  type: SearchType,
  id: string,
  input: SearchActionInput
): Promise<SearchHit> {
  const response = await request<unknown>(
    `/search/actions/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify(input) }
  )
  if (!isSearchHit(response)) throw malformedSearchResponse()
  return response
}
