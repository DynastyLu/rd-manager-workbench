import { request } from '@/lib/http'

import type {
  ListProjectsResult,
  Milestone,
  MilestoneStatus,
  Project,
  ProjectDetail,
  ProjectPhase,
  ProjectHealth,
  ProjectStatus,
  ProgressReport,
  ProjectWeightMode,
  ProjectWorkItemViewConfig,
  ProjectPlanBaseline,
  ProjectPlanChange,
  ProjectCriticalPath,
  ProjectScheduleChangeInput,
  ProjectScheduleImpact,
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
  healthOverride?: ProjectHealth
  weightMode?: ProjectWeightMode
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
  healthOverride?: ProjectHealth | null
  weightMode?: ProjectWeightMode
}

export interface CreateProgressReportInput {
  summary: string
  reportedAt: string
  milestoneId?: string
  completedResults?: string
  blockers?: string
  nextSteps?: string
}

export interface UpdateProgressReportInput {
  summary?: string
  reportedAt?: string
  milestoneId?: string
  completedResults?: string
  blockers?: string
  nextSteps?: string
}

export interface CreateMilestoneInput {
  name: string
  plannedAt?: string
  plannedStartAt?: string
  plannedEndAt?: string
  actualAt?: string
  ownerName?: string
  isCritical?: boolean
  status?: MilestoneStatus
  weightPercent?: number
  manualCompletionPercent?: number
}

export type UpdateMilestoneInput = Partial<CreateMilestoneInput>

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

export function updateProjectWorkItemView(
  id: string,
  config: ProjectWorkItemViewConfig
): Promise<ProjectWorkItemViewConfig> {
  return request<ProjectWorkItemViewConfig>(
    `/projects/${encodeURIComponent(id)}/work-item-view`,
    { method: 'PUT', body: JSON.stringify(config) }
  )
}

export function createProjectPlanBaseline(
  id: string,
  input: { name?: string } = {}
): Promise<ProjectPlanBaseline> {
  return request<ProjectPlanBaseline>(`/projects/${encodeURIComponent(id)}/plan-baselines`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function listProjectPlanBaselines(id: string): Promise<ProjectPlanBaseline[]> {
  return request<ProjectPlanBaseline[]>(`/projects/${encodeURIComponent(id)}/plan-baselines`)
}

export function getProjectPlanBaseline(
  id: string,
  baselineId: string
): Promise<ProjectPlanBaseline> {
  return request<ProjectPlanBaseline>(
    `/projects/${encodeURIComponent(id)}/plan-baselines/${encodeURIComponent(baselineId)}`
  )
}

export function listProjectPlanChanges(id: string): Promise<ProjectPlanChange[]> {
  return request<ProjectPlanChange[]>(`/projects/${encodeURIComponent(id)}/plan-changes`)
}

export function getProjectCriticalPath(id: string): Promise<ProjectCriticalPath> {
  return request<ProjectCriticalPath>(`/projects/${encodeURIComponent(id)}/critical-path`)
}

export function previewProjectScheduleImpact(
  id: string,
  input: ProjectScheduleChangeInput
): Promise<ProjectScheduleImpact> {
  return request<ProjectScheduleImpact>(`/projects/${encodeURIComponent(id)}/schedule-impact`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function applyProjectScheduleChange(
  id: string,
  input: ProjectScheduleChangeInput
): Promise<{ change: ProjectPlanChange; impact: ProjectScheduleImpact }> {
  return request(`/projects/${encodeURIComponent(id)}/schedule-changes`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
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

export function updateProgressReport(
  projectId: string,
  reportId: string,
  input: UpdateProgressReportInput
): Promise<ProgressReport> {
  return request<ProgressReport>(
    `/projects/${encodeURIComponent(projectId)}/progress-reports/${encodeURIComponent(reportId)}`,
    { method: 'PATCH', body: JSON.stringify(input) }
  )
}

export function archiveProgressReport(projectId: string, reportId: string): Promise<void> {
  return request<void>(
    `/projects/${encodeURIComponent(projectId)}/progress-reports/${encodeURIComponent(reportId)}`,
    { method: 'DELETE' }
  )
}

export function createMilestone(
  projectId: string,
  input: CreateMilestoneInput
): Promise<Milestone> {
  return request(`/projects/${encodeURIComponent(projectId)}/milestones`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateMilestone(
  projectId: string,
  milestoneId: string,
  input: UpdateMilestoneInput
): Promise<Milestone> {
  return request(
    `/projects/${encodeURIComponent(projectId)}/milestones/${encodeURIComponent(milestoneId)}`,
    { method: 'PATCH', body: JSON.stringify(input) }
  )
}

export function archiveMilestone(projectId: string, milestoneId: string): Promise<void> {
  return request<void>(
    `/projects/${encodeURIComponent(projectId)}/milestones/${encodeURIComponent(milestoneId)}`,
    { method: 'DELETE' }
  )
}
