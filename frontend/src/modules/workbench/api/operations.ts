import { request } from '@/lib/http'

export type NonProjectRdKind =
  | 'TECH_EXPLORATION'
  | 'NEW_DIRECTION'
  | 'PLATFORM_TOOL'
  | 'TECH_DEBT'
  | 'PATENT'
  | 'STANDARD_METHOD'
  | 'TRAINING'
  | 'TEMPORARY_SUPPORT'

export type NonProjectRdStatus =
  | 'DRAFT'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'CANCELLED'

export type NonProjectOutcomeStatus = 'DRAFT' | 'VERIFIED' | 'REJECTED'

export interface NonProjectOutcome {
  id: string
  title: string
  summary: string | null
  status: NonProjectOutcomeStatus
  verifiedAt: string | null
  evidenceNote: string | null
  createdAt: string
  updatedAt: string
}

export interface NonProjectRdItem {
  id: string
  code: string
  kind: NonProjectRdKind
  title: string
  objective: string | null
  expectedOutcome: string | null
  ownerName: string | null
  plannedStartAt: string | null
  plannedEndAt: string | null
  actualStartAt: string | null
  actualEndAt: string | null
  plannedPersonHours: number
  status: NonProjectRdStatus
  impactScope: string | null
  severity: string | null
  suggestedProjectName: string | null
  projectId: string | null
  outcomeWaivedReason: string | null
  taskId: string | null
  project: { id: string; code: string; name: string } | null
  task: { id: string; title: string; status: string } | null
  outcomes: NonProjectOutcome[]
  createdAt: string
  updatedAt: string
}

export interface ListNonProjectRdParams {
  q?: string
  kind?: NonProjectRdKind
  status?: NonProjectRdStatus
  projectId?: string
  plannedFrom?: string
  plannedTo?: string
  page?: number
  pageSize?: number
}

export interface CreateNonProjectRdInput {
  code: string
  kind: NonProjectRdKind
  title: string
  objective?: string
  expectedOutcome?: string
  ownerName?: string
  plannedStartAt?: string
  plannedEndAt?: string
  plannedPersonHours?: number
  status?: NonProjectRdStatus
  impactScope?: string
  severity?: string
  suggestedProjectName?: string
  projectId?: string
  outcomeWaivedReason?: string
}

export type UpdateNonProjectRdInput = Partial<CreateNonProjectRdInput> & {
  objective?: string | null
  expectedOutcome?: string | null
  ownerName?: string | null
  plannedStartAt?: string | null
  plannedEndAt?: string | null
  actualStartAt?: string | null
  actualEndAt?: string | null
  impactScope?: string | null
  severity?: string | null
  suggestedProjectName?: string | null
  projectId?: string | null
  outcomeWaivedReason?: string | null
}

function query(params: ListNonProjectRdParams) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === 'string' && value) search.set(key, value)
    if (typeof value === 'number') search.set(key, String(value))
  })
  const text = search.toString()
  return text ? `?${text}` : ''
}

const id = encodeURIComponent

export function listNonProjectRd(params: ListNonProjectRdParams = {}): Promise<{
  data: NonProjectRdItem[]
  meta: { page: number; pageSize: number; total: number }
}> {
  return request(`/non-project-rd${query(params)}`)
}

export function getNonProjectRd(itemId: string): Promise<NonProjectRdItem> {
  return request(`/non-project-rd/${id(itemId)}`)
}

export function createNonProjectRd(input: CreateNonProjectRdInput): Promise<NonProjectRdItem> {
  return request('/non-project-rd', { method: 'POST', body: JSON.stringify(input) })
}

export function updateNonProjectRd(itemId: string, input: UpdateNonProjectRdInput): Promise<NonProjectRdItem> {
  return request(`/non-project-rd/${id(itemId)}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function archiveNonProjectRd(itemId: string): Promise<void> {
  return request(`/non-project-rd/${id(itemId)}`, { method: 'DELETE' })
}

export function suggestProject(itemId: string): Promise<Record<string, unknown>> {
  return request(`/non-project-rd/${id(itemId)}/project-suggestion`, { method: 'POST' })
}

export function createOutcome(itemId: string, input: { title: string; summary?: string; status?: NonProjectOutcomeStatus }): Promise<NonProjectOutcome> {
  return request(`/non-project-rd/${id(itemId)}/outcomes`, { method: 'POST', body: JSON.stringify(input) })
}

export function updateOutcome(itemId: string, outcomeId: string, input: Partial<Omit<NonProjectOutcome, 'id' | 'createdAt' | 'updatedAt'>>): Promise<NonProjectOutcome> {
  return request(`/non-project-rd/${id(itemId)}/outcomes/${id(outcomeId)}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function archiveOutcome(itemId: string, outcomeId: string): Promise<void> {
  return request(`/non-project-rd/${id(itemId)}/outcomes/${id(outcomeId)}`, { method: 'DELETE' })
}

export function createNonProjectTask(itemId: string, input: {
  title: string
  description?: string
  projectId?: string
  assigneeName?: string
  dueAt?: string
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
}): Promise<{ task: { id: string; title: string }; alreadyExists: boolean; source: { type: 'NON_PROJECT_RD'; id: string; path: string } }> {
  return request(`/non-project-rd/${id(itemId)}/task`, { method: 'POST', body: JSON.stringify(input) })
}

export type ResourceSkillLevel = 'AWARE' | 'PRACTICING' | 'PROFICIENT' | 'EXPERT'
export type ResourceLoadKind = 'NON_PROJECT_RD' | 'PROJECT' | 'TASK' | 'OTHER'

export interface ResourceSkill {
  id: string
  name: string
  level: ResourceSkillLevel
  evidence: string | null
}

export interface ResourceLoadEntry {
  id: string
  kind: ResourceLoadKind
  weekStartAt: string
  plannedHours: number
  note: string | null
  nonProjectRdItemId: string | null
  projectId: string | null
  taskId: string | null
}

export interface ResourceProfile {
  id: string
  displayName: string
  roleTitle: string | null
  weeklyCapacityHours: number
  developmentGoal: string | null
  notes: string | null
  skills: ResourceSkill[]
  loadEntries?: ResourceLoadEntry[]
}

export interface ResourceLoadWeek {
  weekStartAt: string
  plannedHours: number
  capacityHours: number
  percent: number | null
  overloaded: boolean
  byKind: Partial<Record<ResourceLoadKind, number>>
  entries: ResourceLoadEntry[]
}

export type ResourceLoadSummary = Omit<ResourceProfile, 'loadEntries'> & { weeks: ResourceLoadWeek[] }

export function listResources(params: { q?: string; page?: number; pageSize?: number } = {}): Promise<{
  data: ResourceProfile[]
  meta: { page: number; pageSize: number; total: number }
}> {
  return request(`/resources${query(params)}`)
}

export function getResource(resourceId: string): Promise<ResourceProfile> {
  return request(`/resources/${id(resourceId)}`)
}

export function createResource(input: {
  displayName: string
  roleTitle?: string
  weeklyCapacityHours?: number
  developmentGoal?: string
  notes?: string
}): Promise<ResourceProfile> {
  return request('/resources', { method: 'POST', body: JSON.stringify(input) })
}

export function updateResource(resourceId: string, input: Partial<Omit<ResourceProfile, 'id' | 'skills' | 'loadEntries'>>): Promise<ResourceProfile> {
  return request(`/resources/${id(resourceId)}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function archiveResource(resourceId: string): Promise<void> {
  return request(`/resources/${id(resourceId)}`, { method: 'DELETE' })
}

export function createResourceSkill(resourceId: string, input: { name: string; level: ResourceSkillLevel; evidence?: string; assessedAt?: string }): Promise<ResourceSkill> {
  return request(`/resources/${id(resourceId)}/skills`, { method: 'POST', body: JSON.stringify(input) })
}

export function updateResourceSkill(resourceId: string, skillId: string, input: Partial<{ name: string; level: ResourceSkillLevel; evidence: string | null; assessedAt: string | null }>): Promise<ResourceSkill> {
  return request(`/resources/${id(resourceId)}/skills/${id(skillId)}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function deleteResourceSkill(resourceId: string, skillId: string): Promise<void> {
  return request(`/resources/${id(resourceId)}/skills/${id(skillId)}`, { method: 'DELETE' })
}

export function getResourceLoadSummary(fromWeek: string, toWeek: string): Promise<ResourceLoadSummary[]> {
  return request(`/resources/load-summary?fromWeek=${encodeURIComponent(fromWeek)}&toWeek=${encodeURIComponent(toWeek)}`)
}

export function createResourceLoad(resourceId: string, input: {
  weekStartAt: string
  kind: ResourceLoadKind
  plannedHours: number
  nonProjectRdItemId?: string | null
  projectId?: string | null
  taskId?: string | null
  note?: string | null
}): Promise<ResourceLoadEntry> {
  return request(`/resources/${id(resourceId)}/load-entries`, { method: 'POST', body: JSON.stringify(input) })
}

export function updateResourceLoad(resourceId: string, entryId: string, input: Partial<{
  weekStartAt: string
  kind: ResourceLoadKind
  plannedHours: number
  nonProjectRdItemId: string | null
  projectId: string | null
  taskId: string | null
  note: string | null
}>): Promise<ResourceLoadEntry> {
  return request(`/resources/${id(resourceId)}/load-entries/${id(entryId)}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function archiveResourceLoad(resourceId: string, entryId: string): Promise<void> {
  return request(`/resources/${id(resourceId)}/load-entries/${id(entryId)}`, { method: 'DELETE' })
}

export async function searchResourceReferences(kind: Exclude<ResourceLoadKind, 'OTHER'>, text: string): Promise<Array<{ id: string; label: string }>> {
  const q = text.trim()
  if (!q) return []
  if (kind === 'PROJECT') {
    const result = await request<{ data: Array<{ id: string; code: string; name: string }> }>(`/projects?search=${encodeURIComponent(q)}&pageSize=10`)
    return result.data.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))
  }
  if (kind === 'TASK') {
    const result = await request<{ data: Array<{ id: string; title: string }> }>(`/search?q=${encodeURIComponent(q)}&types=TASK&pageSize=10`)
    return result.data.map((item) => ({ id: item.id, label: item.title }))
  }
  const result = await listNonProjectRd({ q, pageSize: 10 })
  return result.data.map((item) => ({ id: item.id, label: `${item.code} · ${item.title}` }))
}
