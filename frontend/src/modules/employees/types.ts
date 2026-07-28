export type EmploymentStatus = 'ACTIVE' | 'ON_LEAVE' | 'LEFT'
export type EmployeeSkillLevel = 'AWARE' | 'PRACTICING' | 'PROFICIENT' | 'EXPERT'
export type EmployeeLoadKind = 'NON_PROJECT_RD' | 'PROJECT' | 'TASK' | 'OTHER'

export interface EmployeeSkill {
  id: string
  resourceId: string
  name: string
  level: EmployeeSkillLevel
  evidence: string | null
  assessedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface EmployeeLoadEntry {
  id: string
  resourceId: string
  weekStartAt: string
  kind: EmployeeLoadKind
  nonProjectRdItemId: string | null
  projectId: string | null
  taskId: string | null
  employeeWorkItemId: string | null
  employeeWorkImportBatchId: string | null
  plannedHours: string
  note: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Employee {
  id: string
  displayName: string
  roleTitle: string | null
  department: string | null
  workDirection?: string | null
  managerName: string | null
  employmentStatus: EmploymentStatus
  weeklyCapacityHours: number
  developmentGoal: string | null
  notes: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  skills: EmployeeSkill[]
  loadEntries?: EmployeeLoadEntry[]
}

export interface EmployeeFilters {
  q?: string
  department?: string
  workDirection?: string
  employmentStatus?: EmploymentStatus
  page?: number
  pageSize?: number
}

export interface CreateEmployeeInput {
  displayName: string
  department?: string
  roleTitle?: string
  managerName?: string
  employmentStatus?: EmploymentStatus
  weeklyCapacityHours?: number
  developmentGoal?: string
  notes?: string
}

export type UpdateEmployeeInput = Partial<CreateEmployeeInput>

export type EmployeeProgressPeriod = 'WEEK' | 'MONTH'
export type EmployeeWorkStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'AT_RISK' | 'BLOCKED'
export type EmployeeWorkImportStatus =
  | 'UPLOADED'
  | 'PREVIEWED'
  | 'RESOLVING'
  | 'READY'
  | 'IMPORTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'SUPERSEDED'
  | 'EXPIRED'
export type EmployeeSnapshotStatus = 'NOT_STARTED' | 'GENERATING' | 'READY' | 'FAILED'
export type EmployeeImportRowStatus = 'VALID' | 'ERROR' | 'UNRESOLVED'
export type EmployeeWorkKind = 'PROJECT' | 'NON_PROJECT'
export type EmployeeWorkSourceSection = 'CURRENT_WORK' | 'NEXT_WEEK_PLAN'
export type EmployeePlanPriority = 'UNSPECIFIED' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type EmployeeRiskDecision = 'KEEP' | 'REMOVE' | 'EDIT'

export interface ProgressFilters {
  periodType: EmployeeProgressPeriod
  periodStart: string
  department?: string
  projectId?: string
  status?: EmployeeWorkStatus
}

export interface EmployeeWorkItemFilters extends ProgressFilters {
  employeeId?: string
  page?: number
  pageSize?: number
}

export interface ImportFilters {
  periodType?: EmployeeProgressPeriod
  periodStart?: string
  status?: EmployeeWorkImportStatus
  page?: number
  pageSize?: number
}

export interface EmployeeImportDetailFilters {
  rowsPage?: number
  rowsPageSize?: number
  issuesOnly?: boolean
}

export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
}

export interface PageResult<T> {
  data: T[]
  meta: PaginationMeta
}

export interface EmployeeProgressMetrics {
  workItemCount: number
  completedCount: number
  completionRate: number | null
  averageCompletionRate: number | null
  plannedHours: number
  actualHours: number
  riskCount: number
  blockedCount: number
  projectCount: number
  unlinkedCount: number
  dataComplete: boolean
  missingWeeks: string[]
}

export interface ProgressPeriod {
  type: EmployeeProgressPeriod
  start: string
  end: string
}

export interface BoundedCollection<T> {
  data: T[]
  total: number
  limit: number
  hasMore: boolean
}

export interface EmployeeProgressLinks {
  workItemsUrl: string
}

export interface EmployeeWorkItemLinks {
  selfUrl: string
  employeeProgressUrl: string
  projectProgressUrl?: string
  taskUrl?: string
  sourceBatchUrl: string
}

export interface EmployeeWorkItem {
  id: string
  employeeId: string
  employeeName: string
  department: string | null
  importBatchId: string
  importVersion: number | null
  sourceRowId: string
  sourceRowNumber: number
  sourceBatchIds: string[]
  periodStart: string
  periodEnd: string
  title: string
  planText: string | null
  summaryText: string | null
  completionRate: number | null
  status: EmployeeWorkStatus
  nextPlanText: string | null
  riskText: string | null
  plannedHours: number | null
  actualHours: number | null
  project: { id: string; code: string; name: string } | null
  task: { id: string; code: string; title: string } | null
  riskId: string | null
  note: string | null
  links: EmployeeWorkItemLinks
}

export interface EmployeeWorkItemSummary {
  id: string
  title: string
  employeeId: string
  employeeName: string
  projectId: string | null
  projectCode: string | null
  status: EmployeeWorkStatus
  riskText: string | null
  sourceBatchIds: string[]
  links: EmployeeWorkItemLinks
}

export interface TeamEmployeeProgress {
  employeeId: string
  displayName: string
  department: string | null
  roleTitle: string | null
  metrics: EmployeeProgressMetrics
  sourceBatchIds: string[]
  employeeProgressUrl: string
  workItemsUrl: string
}

export interface TeamProjectProgress {
  projectId: string
  projectCode: string
  projectName: string
  participantCount: number
  metrics: EmployeeProgressMetrics
  sourceBatchIds: string[]
  projectProgressUrl: string
  workItemsUrl: string
}

export interface TeamProgress {
  period: ProgressPeriod
  metrics: EmployeeProgressMetrics
  sourceBatchIds: string[]
  employees: BoundedCollection<TeamEmployeeProgress>
  projects: BoundedCollection<TeamProjectProgress>
  risks: BoundedCollection<EmployeeWorkItemSummary>
  links: EmployeeProgressLinks
}

export interface EmployeeProjectContribution {
  projectId: string
  projectCode: string
  projectName: string
  metrics: EmployeeProgressMetrics
  sourceBatchIds: string[]
  projectProgressUrl: string
  workItemsUrl: string
}

export interface EmployeeProgress {
  employee: Pick<
    Employee,
    | 'id'
    | 'displayName'
    | 'department'
    | 'roleTitle'
    | 'managerName'
    | 'employmentStatus'
    | 'weeklyCapacityHours'
  >
  period: ProgressPeriod
  metrics: EmployeeProgressMetrics
  sourceBatchIds: string[]
  projects: BoundedCollection<EmployeeProjectContribution>
  risks: BoundedCollection<EmployeeWorkItemSummary>
  links: EmployeeProgressLinks
}

export interface ProjectEmployeeProgress {
  employeeId: string
  displayName: string
  department: string | null
  metrics: EmployeeProgressMetrics
  completedItems: BoundedCollection<{ workItemId: string; title: string }>
  nextPlans: BoundedCollection<{ workItemId: string; text: string }>
  risks: BoundedCollection<{ workItemId: string; text: string | null }>
  sourceBatchIds: string[]
  employeeProgressUrl: string
  workItemsUrl: string
}

export interface ProjectTeamProgress {
  project: {
    id: string
    code: string
    name: string
    status: 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
  }
  period: ProgressPeriod
  metrics: EmployeeProgressMetrics
  sourceBatchIds: string[]
  employees: BoundedCollection<ProjectEmployeeProgress>
  risks: BoundedCollection<EmployeeWorkItemSummary>
  links: EmployeeProgressLinks
}

export interface ListEmployeeWorkItemsResult {
  period: ProgressPeriod
  data: EmployeeWorkItem[]
  meta: PaginationMeta
  sourceBatchIds: string[]
  links: { progressUrl: string }
}

export interface ImportRowError {
  field: string
  code: string
  rawValue?: string | number | null
  reason?: string
}

export interface NormalizedEmployeeWorkRow {
  sourceSection?: 'CURRENT_WORK'
  rowNumber: number
  sourceSheetName?: string
  sourceRowNumber?: number
  employeeName: string
  department?: string | null
  workDirection?: string | null
  title: string
  plannedCompletionAt?: string | null
  planText: string | null
  summaryText: string | null
  completionRate: number | null
  status: EmployeeWorkStatus
  nextPlanText: string | null
  riskText: string | null
  plannedHours: number | null
  actualHours: number | null
  projectCode: string | null
  taskCode: string | null
  note: string | null
  rawValues: Record<string, string | number | null>
}

export interface NormalizedEmployeeWeekPlanRow {
  sourceSection: 'NEXT_WEEK_PLAN'
  rowNumber: number
  sourceSheetName: string
  sourceRowNumber: number
  employeeName: string
  department: string | null
  workDirection: string | null
  title: string
  deliverableText: string | null
  plannedCompletionAt: string | null
  priority: EmployeePlanPriority
  collaborationText: string | null
  planText: string | null
  note: string | null
  rawValues: Record<string, string | number | null>
}

export type NormalizedEmployeeWorkbookRow =
  | NormalizedEmployeeWorkRow
  | NormalizedEmployeeWeekPlanRow

export interface EmployeeWorkImportRow {
  id: string
  rowNumber: number
  sourceSheetName?: string | null
  sourceSection?: EmployeeWorkSourceSection | null
  sourceRowNumber?: number | null
  sourceKey?: string | null
  status: EmployeeImportRowStatus
  errors: ImportRowError[]
  rawValues: Record<string, string | number | null>
  normalizedValues: NormalizedEmployeeWorkbookRow | Record<string, never>
  resolvedEmployeeId: string | null
  resolvedProjectId: string | null
  resolvedTaskId: string | null
  workKind?: EmployeeWorkKind | null
  plannedHours?: number | null
  actualHours?: number | null
  riskCandidate?: boolean
  riskDecision?: EmployeeRiskDecision | null
  riskText?: string | null
  keepUnlinked: boolean
  workItemId: string | null
  links: {
    workItem?: string
    sourceBatch: string
  }
}

export interface EmployeeImportLinks {
  self: string
  source?: string
  errors?: string
  restore?: string
}

export interface EmployeeImportProfileWarning {
  employeeName: string
  sourceSheetName: string
  field: 'department' | 'workDirection'
  instructionValue?: string | null
  sheetValue?: string | null
  profileValue?: string | null
  rowValue?: string | null
  reason: string
}

export interface EmployeeWorkImportBatch {
  id: string
  periodType: EmployeeProgressPeriod
  periodStart: string
  periodEnd: string
  version: number | null
  status: EmployeeWorkImportStatus
  snapshotStatus: EmployeeSnapshotStatus
  snapshotError: string | null
  originalName: string
  fileHash: string
  templateVersion: number
  totalRows: number
  validRows: number
  errorRows: number
  unresolvedRows: number
  importedRows: number
  supersedesBatchId: string | null
  restoredFromBatchId: string | null
  committedAt: string | null
  expiresAt: string
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  hasErrors: boolean
  sourceAvailable?: boolean
  sourceBatchIds?: string[]
  links?: EmployeeImportLinks
  warning?: { code: string }
  profileWarnings?: EmployeeImportProfileWarning[]
}

export interface EmployeeWorkImportDetail extends EmployeeWorkImportBatch {
  sourceBatchIds: string[]
  rows: EmployeeWorkImportRow[]
  rowMeta: PaginationMeta
}

export interface ListEmployeeWorkImportsResult extends PageResult<EmployeeWorkImportBatch> {
  sourceBatchIds: string[]
}

export interface ResolveEmployeeImportRowInput {
  rowNumber?: number
  rowId?: string
  employeeId?: string | null
  createEmployee?: {
    displayName: string
    department?: string
    workDirection?: string
  }
  updateEmployeeProfile?: boolean
  workKind?: EmployeeWorkKind
  projectId?: string | null
  taskId?: string | null
  plannedHours?: number | null
  actualHours?: number | null
  riskDecision?: EmployeeRiskDecision
  riskText?: string | null
  keepUnlinked?: boolean
}

export interface ResolveEmployeeImportInput {
  rows: ResolveEmployeeImportRowInput[]
}

export interface EmployeeRiskConversionResult {
  risk: {
    id: string
    projectId: string | null
    taskId: string | null
    title: string
    description: string | null
    status: 'OPEN' | 'MITIGATING' | 'CLOSED'
  }
  alreadyExists: boolean
}

export type EmployeeWorkExportFormat = 'xlsx'
