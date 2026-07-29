import { download, request } from '@/lib/http'
import type {
  CreateEmployeeInput,
  Employee,
  EmployeeFilters,
  EmployeeImportDetailFilters,
  EmployeeProgress,
  EmployeeRiskConversionResult,
  EmployeeWorkExportFormat,
  EmployeeWorkImportBatch,
  EmployeeWorkImportDetail,
  EmployeeWorkItem,
  EmployeeWorkItemFilters,
  EmployeeWeekPlan,
  EmployeeWeekPlanFilters,
  EmployeeWeekPlanTaskResult,
  ImportFilters,
  ListEmployeeWeekPlansResult,
  ListEmployeeWorkImportsResult,
  ListEmployeeWorkItemsResult,
  PageResult,
  ProgressFilters,
  ProjectTeamProgress,
  ResolveEmployeeImportInput,
  TeamProgress,
  UpdateEmployeeInput,
  UpdateEmployeeWorkItemInput,
  UpdateEmployeeWeekPlanInput,
} from './types'

function resource(path: string, id: string): string {
  return `${path}/${encodeURIComponent(id)}`
}

function queryString(params: object): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      const normalized = value.trim()
      if (normalized) query.set(key, normalized)
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      query.set(key, String(value))
    }
  }
  const rendered = query.toString()
  return rendered ? `?${rendered}` : ''
}

function employeePath(employeeId: string): string {
  return resource('/employees', employeeId)
}

function importPath(batchId: string): string {
  return resource('/employee-work-imports', batchId)
}

function workItemPath(workItemId: string): string {
  return resource('/employee-work-items', workItemId)
}

function weekPlanPath(planId: string): string {
  return resource('/employee-week-plans', planId)
}

export function listEmployees(filters: EmployeeFilters = {}): Promise<PageResult<Employee>> {
  return request(`/employees${queryString(filters)}`)
}

export function getEmployee(employeeId: string): Promise<Employee> {
  return request(employeePath(employeeId))
}

export function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
  return request('/employees', { method: 'POST', body: JSON.stringify(input) })
}

export function updateEmployee(employeeId: string, input: UpdateEmployeeInput): Promise<Employee> {
  return request(employeePath(employeeId), {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function archiveEmployee(employeeId: string): Promise<void> {
  return request(employeePath(employeeId), { method: 'DELETE' })
}

export function getTeamProgress(filters: ProgressFilters): Promise<TeamProgress> {
  return request(`/employee-progress${queryString(filters)}`)
}

export function getEmployeeProgress(
  employeeId: string,
  filters: ProgressFilters
): Promise<EmployeeProgress> {
  return request(`${employeePath(employeeId)}/progress${queryString(filters)}`)
}

export function getProjectTeamProgress(
  projectId: string,
  filters: ProgressFilters
): Promise<ProjectTeamProgress> {
  return request(`${resource('/projects', projectId)}/team-progress${queryString(filters)}`)
}

export function listEmployeeWorkItems(
  filters: EmployeeWorkItemFilters
): Promise<ListEmployeeWorkItemsResult> {
  return request(`/employee-work-items${queryString(filters)}`)
}

export function getEmployeeWorkItem(workItemId: string): Promise<EmployeeWorkItem> {
  return request(workItemPath(workItemId))
}

export function updateEmployeeWorkItem(
  workItemId: string,
  input: UpdateEmployeeWorkItemInput
): Promise<EmployeeWorkItem> {
  return request(workItemPath(workItemId), {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function listEmployeeWeekPlans(
  filters: EmployeeWeekPlanFilters
): Promise<ListEmployeeWeekPlansResult> {
  return request(`/employee-week-plans${queryString(filters)}`)
}

export function getEmployeeWeekPlan(planId: string): Promise<EmployeeWeekPlan> {
  return request(weekPlanPath(planId))
}

export function updateEmployeeWeekPlan(
  planId: string,
  input: UpdateEmployeeWeekPlanInput
): Promise<EmployeeWeekPlan> {
  return request(weekPlanPath(planId), {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function cancelEmployeeWeekPlan(
  planId: string,
  reason: string
): Promise<{ plan: EmployeeWeekPlan; alreadyCancelled: boolean }> {
  return request(`${weekPlanPath(planId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export function matchEmployeeWeekPlan(
  planId: string,
  workItemId: string
): Promise<{ plan: EmployeeWeekPlan; alreadyMatched: boolean }> {
  return request(`${weekPlanPath(planId)}/match`, {
    method: 'POST',
    body: JSON.stringify({ workItemId }),
  })
}

export function unmatchEmployeeWeekPlan(
  planId: string
): Promise<{ plan: EmployeeWeekPlan; alreadyPlanned: boolean }> {
  return request(`${weekPlanPath(planId)}/unmatch`, { method: 'POST' })
}

export function convertEmployeeWeekPlanToTask(
  planId: string
): Promise<EmployeeWeekPlanTaskResult> {
  return request(`${weekPlanPath(planId)}/convert-to-task`, { method: 'POST' })
}

export function listEmployeeWorkImports(
  filters: ImportFilters = {}
): Promise<ListEmployeeWorkImportsResult> {
  return request(`/employee-work-imports${queryString(filters)}`)
}

export function getEmployeeWorkImport(
  batchId: string,
  filters: EmployeeImportDetailFilters = {}
): Promise<EmployeeWorkImportDetail> {
  return request(`${importPath(batchId)}${queryString(filters)}`)
}

export function uploadEmployeeWorkImport(file: File): Promise<EmployeeWorkImportBatch> {
  const body = new FormData()
  body.append('file', file)
  return request('/employee-work-imports', { method: 'POST', body })
}

export function previewEmployeeWorkImport(batchId: string): Promise<EmployeeWorkImportBatch> {
  return request(`${importPath(batchId)}/preview`, {
    method: 'PATCH',
    body: JSON.stringify({}),
  })
}

export function resolveEmployeeWorkImport(
  batchId: string,
  input: ResolveEmployeeImportInput
): Promise<EmployeeWorkImportBatch> {
  return request(`${importPath(batchId)}/resolutions`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function commitEmployeeWorkImport(batchId: string): Promise<EmployeeWorkImportBatch> {
  return request(`${importPath(batchId)}/commit`, { method: 'POST' })
}

export function rebuildEmployeeWorkImportSnapshots(
  batchId: string
): Promise<EmployeeWorkImportBatch> {
  return request(`${importPath(batchId)}/rebuild-snapshots`, { method: 'POST' })
}

export function restoreEmployeeWorkImport(batchId: string): Promise<EmployeeWorkImportBatch> {
  return request(`${importPath(batchId)}/restore`, { method: 'POST' })
}

export function archiveEmployeeWorkImport(batchId: string): Promise<void> {
  return request(importPath(batchId), { method: 'DELETE' })
}

export function convertEmployeeWorkItemRisk(
  workItemId: string
): Promise<EmployeeRiskConversionResult> {
  return request(`${workItemPath(workItemId)}/convert-risk`, { method: 'POST' })
}

export function downloadEmployeeWorkImportTemplate(periodStart: string) {
  return download(
    `/employee-work-imports/template${queryString({ version: 2, periodStart })}`
  )
}

export function downloadEmployeeImportSource(batchId: string) {
  return download(`${importPath(batchId)}/source`)
}

export function downloadEmployeeImportErrors(batchId: string) {
  return download(`${importPath(batchId)}/errors`)
}

export function exportEmployeeWorkItems(
  filters: Omit<EmployeeWorkItemFilters, 'page' | 'pageSize'>,
  format: EmployeeWorkExportFormat = 'xlsx'
) {
  return download(`/employee-work-items/export${queryString({ ...filters, format })}`)
}
