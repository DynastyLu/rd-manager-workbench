import { request } from '@/lib/http'

import type {
  ListProjectsResult,
  Project,
  ProjectDetail,
  ProjectPhase,
  ProjectStatus,
  ProgressReport,
} from '@/modules/workbench/types'

export interface ListProjectsParams {
  ids?: string[]
  page?: number
  pageSize?: number
  search?: string
  status?: ProjectStatus
  phase?: ProjectPhase
}

export interface CreateProjectInput {
  code: string
  name: string
  type?: string
  researchDirection?: string
  objective?: string
  expectedOutcome?: string
  leadName?: string
  participantNames?: string[]
  plannedStartAt?: string
  plannedEndAt?: string
  actualStartAt?: string
  actualEndAt?: string
  status?: ProjectStatus
  phase?: ProjectPhase
}

export interface UpdateProjectInput {
  code?: string
  name?: string
  type?: string | null
  researchDirection?: string | null
  objective?: string | null
  expectedOutcome?: string | null
  leadName?: string | null
  participantNames?: string[]
  plannedStartAt?: string | null
  plannedEndAt?: string | null
  actualStartAt?: string | null
  actualEndAt?: string | null
  status?: ProjectStatus
  phase?: ProjectPhase
}

export interface CreateProgressReportInput {
  summary: string
  completionPercent: number
  reportedAt: string
  blockers?: string
}

function toQueryString(params: ListProjectsParams): string {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value))
    }
  }

  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

export function listProjects(params: ListProjectsParams = {}): Promise<ListProjectsResult> {
  return request<ListProjectsResult>(`/projects${toQueryString(params)}`)
}

export function getProject(id: string): Promise<ProjectDetail> {
  return request<ProjectDetail>(`/projects/${encodeURIComponent(id)}`)
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

export function createProgressReport(
  projectId: string,
  input: CreateProgressReportInput
): Promise<ProgressReport> {
  return request<ProgressReport>(
    `/projects/${encodeURIComponent(projectId)}/progress-reports`,
    { method: 'POST', body: JSON.stringify(input) }
  )
}
