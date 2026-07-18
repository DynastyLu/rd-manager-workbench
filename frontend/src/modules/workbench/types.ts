export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'

export type ProjectPhase =
  | 'DISCOVERY'
  | 'PLANNING'
  | 'RESEARCH'
  | 'DEVELOPMENT'
  | 'VALIDATION'
  | 'DELIVERY'

export type ProjectHealth = 'GREEN' | 'YELLOW' | 'RED'

export interface Project {
  id: string
  code: string
  name: string
  type: string | null
  researchDirection: string | null
  objective: string | null
  expectedOutcome: string | null
  leadName: string | null
  participantNames: string[]
  plannedStartAt: string | null
  plannedEndAt: string | null
  actualStartAt: string | null
  actualEndAt: string | null
  status: ProjectStatus
  phase: ProjectPhase
  health: ProjectHealth
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export type MilestoneStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'MISSED'

export interface Milestone {
  id: string
  projectId: string
  name: string
  plannedAt: string | null
  actualAt: string | null
  ownerName: string | null
  isCritical: boolean
  status: MilestoneStatus
  createdAt: string
  updatedAt: string
}

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED'

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface WorkTask {
  id: string
  projectId: string | null
  milestoneId: string | null
  parentId: string | null
  title: string
  description: string | null
  assigneeName: string | null
  collaboratorNames: string[]
  status: TaskStatus
  priority: TaskPriority
  dueAt: string | null
  completedAt: string | null
  sourceType: string | null
  sourceId: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ProgressReport {
  id: string
  projectId: string
  summary: string
  completionPercent: number
  blockers: string | null
  reportedAt: string
  createdAt: string
  updatedAt: string
}

export interface DashboardData {
  todayActions: WorkTask[]
  overdueTasks: WorkTask[]
  dueSoonMilestones: Milestone[]
  healthDistribution: Record<ProjectHealth, number>
  projectsNeedingAttention: Project[]
  recentProgressReports: ProgressReport[]
}

export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
}

export interface ListProjectsResult {
  data: Project[]
  meta: PaginationMeta
}

export interface ListTasksResult {
  data: WorkTask[]
  meta: PaginationMeta
}

export type ApplicationCaseStatus =
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'COMPLETED'
  | 'CANCELLED'

export type ApplicationNodeStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED'

export type ApplicationRequirementStatus = 'SATISFIED' | 'PENDING' | 'TO_VERIFY' | 'NOT_APPLICABLE'

export type MaterialReviewStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED'

export type CorrectionStatus = 'OPEN' | 'RESOLVED' | 'WAIVED'

export type SubmissionStatus = 'DRAFT' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED'

export interface WorkflowTemplateNode {
  id: string
  code: string
  title: string
  description: string | null
  sequence: number
  prerequisiteNodeCodes: string[]
  requiredRequirementCodes: string[]
  requiredMaterialCodes: string[]
  isRequired: boolean
}

export interface WorkflowTemplate {
  id: string
  name: string
  description: string | null
  category: string | null
  version: number
  archivedAt: string | null
  nodes: WorkflowTemplateNode[]
  createdAt: string
  updatedAt: string
}

export interface ApplicationNode {
  id: string
  workflowTemplateNodeId: string | null
  code: string
  title: string
  description: string | null
  sequence: number
  prerequisiteNodeCodes: string[]
  requiredRequirementCodes: string[]
  requiredMaterialCodes: string[]
  status: ApplicationNodeStatus
  completedAt: string | null
}

export interface ApplicationRequirement {
  id: string
  applicationNodeId: string | null
  code: string
  title: string
  description: string | null
  isRequired: boolean
  status: ApplicationRequirementStatus
}

export interface MaterialVersion {
  id: string
  versionNumber: number
  fileName: string
  storageKey: string | null
  checksum: string | null
  fileSize: number | null
  note: string | null
  reviewStatus: MaterialReviewStatus
  isFinal: boolean
  createdAt: string
}

export interface ApplicationMaterial {
  id: string
  applicationNodeId: string | null
  code: string
  title: string
  category: string | null
  isRequired: boolean
  versions: MaterialVersion[]
}

export interface EvidenceRecord {
  id: string
  title: string
  description: string | null
  sourceUri: string | null
  collectedAt: string | null
  createdAt: string
}

export interface CorrectionRecord {
  id: string
  title: string
  details: string | null
  status: CorrectionStatus
  dueAt: string | null
  resolvedAt: string | null
  createdAt: string
}

export interface SubmissionRecord {
  id: string
  status: SubmissionStatus
  submittedAt: string | null
  note: string | null
  createdAt: string
}

export interface ApplicationCase {
  id: string
  code: string
  title: string
  projectId: string | null
  workflowTemplateId: string
  subjectName: string | null
  region: string | null
  organization: string | null
  batch: string | null
  deadlineAt: string | null
  collaboratorNames: string[]
  status: ApplicationCaseStatus
  archivedAt: string | null
  nodes: ApplicationNode[]
  requirements: ApplicationRequirement[]
  materials: ApplicationMaterial[]
  evidenceRecords: EvidenceRecord[]
  corrections: CorrectionRecord[]
  submissions: SubmissionRecord[]
  createdAt: string
  updatedAt: string
}

export interface ListWorkflowTemplatesResult {
  data: WorkflowTemplate[]
  meta: PaginationMeta
}

export interface ListApplicationCasesResult {
  data: ApplicationCase[]
  meta: PaginationMeta
}
