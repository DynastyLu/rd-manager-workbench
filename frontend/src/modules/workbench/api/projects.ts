import { request } from '@/lib/http'

import type {
  ListProjectsResult,
  Project,
  ProjectHealth,
  ProjectPhase,
  ProjectStatus,
} from '@/modules/workbench/types'

export interface ListProjectsParams {
  page?: number
  pageSize?: number
  search?: string
  status?: ProjectStatus
  phase?: ProjectPhase
  health?: ProjectHealth
}

export interface CreateProjectInput {
  name: string
  code?: string
  description?: string
  status?: ProjectStatus
  phase?: ProjectPhase
  health?: ProjectHealth
  startDate?: string
  targetDate?: string
}

export interface UpdateProjectInput {
  name?: string
  code?: string | null
  description?: string | null
  status?: ProjectStatus
  phase?: ProjectPhase
  health?: ProjectHealth
  startDate?: string | null
  targetDate?: string | null
}

function toQueryString(params: ListProjectsParams): string {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value))
    }
  }

  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

export function listProjects(params: ListProjectsParams = {}): Promise<ListProjectsResult> {
  return request<ListProjectsResult>(`/projects${toQueryString(params)}`)
}

export function getProject(id: string): Promise<Project> {
  return request<Project>(`/projects/${encodeURIComponent(id)}`)
}

export function createProject(input: CreateProjectInput): Promise<Project> {
  return request<Project>('/projects', { method: 'POST', body: JSON.stringify(input) })
}

export function updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
  return request<Project>(`/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function archiveProject(id: string): Promise<void> {
  return request<void>(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
