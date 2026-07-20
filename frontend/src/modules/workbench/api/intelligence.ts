import { request } from '@/lib/http'

export type IntelligencePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type IntelligenceItemStatus = 'NEW' | 'REVIEWING' | 'ACTIONED' | 'DISMISSED'
export type IntelligenceSourceKind = 'WEBSITE' | 'RSS' | 'NEWSLETTER' | 'DATABASE' | 'MANUAL'
export type IntelligenceFrequency = 'MANUAL' | 'DAILY' | 'WEEKLY'
export type IntelligenceBriefKind = 'DAILY' | 'WEEKLY'

export interface PageResult<T> {
  data: T[]
  meta: { page: number; pageSize: number; total: number }
}
export interface IntelligenceTopic {
  id: string
  name: string
  description: string | null
  keywords: string[]
  projects: Array<{ projectId: string; project: { id: string; code: string; name: string } }>
}
export interface IntelligenceSource {
  id: string
  name: string
  kind: IntelligenceSourceKind
  url: string | null
  credibility: number
  notes: string | null
}
export interface IntelligencePlan {
  id: string
  sourceId: string
  name: string
  frequency: IntelligenceFrequency
  runAtLocalTime: string | null
  weekday: number | null
  enabled: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  source: Pick<IntelligenceSource, 'id' | 'name' | 'kind'>
}
export interface IntelligenceRun {
  id: string
  planId: string
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED'
  trigger: 'MANUAL' | 'SCHEDULED' | 'CONNECTOR'
  itemCount: number
  startedAt: string
  errorMessage: string | null
  plan: { id: string; name: string; source: Pick<IntelligenceSource, 'id' | 'name' | 'kind'> }
}
export interface IntelligenceOccurrence {
  id: string
  sourceUrl?: string | null
  capturedAt?: string
  source: Pick<IntelligenceSource, 'id' | 'name' | 'kind'>
}
export interface IntelligenceConversion {
  id?: string
  kind: 'TASK' | 'RISK' | 'MEETING' | 'KNOWLEDGE'
  targetId: string
}
export interface IntelligenceItem {
  id: string
  title: string
  summary: string | null
  impact?: string | null
  recommendation?: string | null
  canonicalUrl: string | null
  publishedAt: string | null
  priority: IntelligencePriority
  status: IntelligenceItemStatus
  occurrences: IntelligenceOccurrence[]
  topics: Array<{ topicId: string; topic: Pick<IntelligenceTopic, 'id' | 'name'> }>
  projects: Array<{ projectId: string; project: { id: string; code: string; name: string } }>
  conversions: IntelligenceConversion[]
}
export interface BriefSnapshot {
  title: string
  summary: string | null
  priority: IntelligencePriority
  publishedAt: string | null
  canonicalUrl: string | null
  sourceNames: string[]
}
export interface IntelligenceBrief {
  id: string
  kind: IntelligenceBriefKind
  briefDate: string
  title: string
  introduction: string | null
  items: Array<{ id: string; itemId: string; sequence: number; snapshot: BriefSnapshot }>
}

function queryPath(path: string, params: Record<string, unknown> = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (
      value !== undefined &&
      value !== null &&
      value !== '' &&
      ['string', 'number', 'boolean'].includes(typeof value)
    )
      query.set(key, `${value as string | number | boolean}`)
  })
  const suffix = query.toString()
  return suffix ? `${path}?${suffix}` : path
}
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

export const listIntelligenceTopics = (params: Record<string, unknown> = {}) =>
  request<PageResult<IntelligenceTopic>>(queryPath('/intelligence-topics', params))
export const createIntelligenceTopic = (input: {
  name: string
  description?: string
  keywords?: string[]
  projectIds?: string[]
}) => request<IntelligenceTopic>('/intelligence-topics', json('POST', input))
export const updateIntelligenceTopic = (
  id: string,
  input: { name?: string; description?: string | null; keywords?: string[] }
) =>
  request<IntelligenceTopic>(`/intelligence-topics/${encodeURIComponent(id)}`, json('PATCH', input))
export const archiveIntelligenceTopic = (id: string) =>
  request<void>(`/intelligence-topics/${encodeURIComponent(id)}`, json('DELETE'))
export const listIntelligenceSources = (params: Record<string, unknown> = {}) =>
  request<PageResult<IntelligenceSource>>(queryPath('/intelligence-sources', params))
export const createIntelligenceSource = (input: {
  name: string
  kind: IntelligenceSourceKind
  url?: string
  credibility?: number
  notes?: string
}) => request<IntelligenceSource>('/intelligence-sources', json('POST', input))
export const updateIntelligenceSource = (
  id: string,
  input: {
    name?: string
    kind?: IntelligenceSourceKind
    url?: string | null
    credibility?: number
    notes?: string | null
  }
) =>
  request<IntelligenceSource>(
    `/intelligence-sources/${encodeURIComponent(id)}`,
    json('PATCH', input)
  )
export const archiveIntelligenceSource = (id: string) =>
  request<void>(`/intelligence-sources/${encodeURIComponent(id)}`, json('DELETE'))
export const listIntelligencePlans = (params: Record<string, unknown> = {}) =>
  request<PageResult<IntelligencePlan>>(queryPath('/intelligence-plans', params))
export const createIntelligencePlan = (input: {
  sourceId: string
  name: string
  frequency: IntelligenceFrequency
  runAtLocalTime?: string
  weekday?: number
}) => request<IntelligencePlan>('/intelligence-plans', json('POST', input))
export const updateIntelligencePlan = (id: string, input: { name?: string; enabled?: boolean }) =>
  request<IntelligencePlan>(`/intelligence-plans/${encodeURIComponent(id)}`, json('PATCH', input))
export const archiveIntelligencePlan = (id: string) =>
  request<void>(`/intelligence-plans/${encodeURIComponent(id)}`, json('DELETE'))
export const listIntelligenceRuns = (params: Record<string, unknown> = {}) =>
  request<PageResult<IntelligenceRun>>(queryPath('/intelligence-runs', params))
export const recordIntelligenceRun = (
  planId: string,
  input: {
    status: 'SUCCEEDED' | 'FAILED'
    itemCount?: number
    inputSummary?: string
    errorMessage?: string
    items?: Array<{
      title: string
      summary?: string
      canonicalUrl?: string
      publishedAt?: string
      priority?: IntelligencePriority
      topicIds?: string[]
      projectIds?: string[]
    }>
  }
) =>
  request<IntelligenceRun>(
    `/intelligence-plans/${encodeURIComponent(planId)}/runs`,
    json('POST', input)
  )
export const listIntelligenceItems = (params: Record<string, unknown> = {}) =>
  request<PageResult<IntelligenceItem>>(queryPath('/intelligence-items', params))
export const getIntelligenceItem = (id: string) =>
  request<IntelligenceItem>(`/intelligence-items/${encodeURIComponent(id)}`)
export const createIntelligenceItem = (input: Record<string, unknown>) =>
  request<{ itemId: string; merged: boolean; item: IntelligenceItem }>(
    '/intelligence-items',
    json('POST', input)
  )
export const updateIntelligenceItem = (id: string, input: Record<string, unknown>) =>
  request<IntelligenceItem>(`/intelligence-items/${encodeURIComponent(id)}`, json('PATCH', input))
export const archiveIntelligenceItem = (id: string) =>
  request<void>(`/intelligence-items/${encodeURIComponent(id)}`, json('DELETE'))
export const convertIntelligenceItem = (
  id: string,
  kind: 'task' | 'risk' | 'meeting-agenda' | 'knowledge-page',
  input: Record<string, unknown>
) =>
  request<{ kind: string; targetId: string; alreadyExists: boolean }>(
    `/intelligence-items/${encodeURIComponent(id)}/${kind}`,
    json('POST', input)
  )
export const listIntelligenceBriefs = (params: Record<string, unknown> = {}) =>
  request<PageResult<IntelligenceBrief>>(queryPath('/intelligence-briefs', params))
export const saveIntelligenceBrief = (input: {
  kind: IntelligenceBriefKind
  briefDate: string
  title?: string
  introduction?: string
  itemIds: string[]
}) => request<IntelligenceBrief>('/intelligence-briefs', json('POST', input))
export const updateIntelligenceBrief = (
  id: string,
  input: {
    kind: IntelligenceBriefKind
    briefDate: string
    title?: string
    introduction?: string
    itemIds: string[]
  }
) => request<IntelligenceBrief>(`/intelligence-briefs/${encodeURIComponent(id)}`, json('PATCH', input))
export const archiveIntelligenceBrief = (id: string) =>
  request<void>(`/intelligence-briefs/${encodeURIComponent(id)}`, json('DELETE'))
