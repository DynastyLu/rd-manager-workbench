export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'

export type ProjectPhase =
  | 'DISCOVERY'
  | 'PLANNING'
  | 'RESEARCH'
  | 'DEVELOPMENT'
  | 'VALIDATION'
  | 'DELIVERY'

export type ProjectHealth = 'GREEN' | 'YELLOW' | 'RED'
export type ProjectWeightMode = 'EQUAL' | 'CUSTOM'
export type CompletionSource = 'COMPLETED' | 'TASKS' | 'MANUAL' | 'EMPTY'
export type ScheduleState = 'AHEAD' | 'ON_TRACK' | 'BEHIND' | 'UNPLANNED'
export type ProgressReportSourceType =
  | 'MANUAL'
  | 'TASK_CHANGE'
  | 'MILESTONE_CHANGE'
  | 'SYSTEM_RECALCULATION'

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
  weightMode: ProjectWeightMode
  healthOverride: ProjectHealth | null
  health: ProjectHealth | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectHealthSnapshot {
  id: string
  projectId: string
  health: ProjectHealth
  reasons: unknown
  calculatedAt: string
}

export interface ProjectDetail extends Omit<Project, 'health'> {
  milestones: Milestone[]
  tasks: Array<WorkTask & { dependencyIds: string[] }>
  progressReports: ProgressReport[]
  progressSummary: ProjectProgressSummary | null
  latestHealthSnapshot: ProjectHealthSnapshot | null
  effectiveHealth: ProjectHealth | null
}

export interface ProjectProgressSummary {
  actualPercent: number | null
  timePercent: number | null
  variancePercent: number | null
  scheduleState: ScheduleState
  weightMode: ProjectWeightMode
  currentMilestoneId: string | null
}

export type MilestoneStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'MISSED'

export interface Milestone {
  id: string
  projectId: string
  name: string
  plannedAt: string | null
  plannedStartAt: string | null
  plannedEndAt: string | null
  actualAt: string | null
  ownerName: string | null
  isCritical: boolean
  status: MilestoneStatus
  weightPercent: number | null
  manualCompletionPercent: number | null
  completionPercent: number
  completionSource: CompletionSource
  effectiveWeightPercent: number
  linkedTaskCount: number
  createdAt: string
  updatedAt: string
}

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED'

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface TaskReminder {
  id: string
  taskId: string
  remindAt: string
  dismissedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface TaskLater {
  id: string
  taskId: string
  deferredUntil: string
  createdAt: string
  updatedAt: string
}

export interface WorkTask {
  id: string
  code: string
  projectId: string | null
  milestoneId: string | null
  parentId: string | null
  title: string
  description: string | null
  assigneeName: string | null
  collaboratorNames: string[]
  status: TaskStatus
  priority: TaskPriority
  completionPercent: number
  dueAt: string | null
  completedAt: string | null
  sourceType: string | null
  sourceId: string | null
  archivedAt: string | null
  reminder?: TaskReminder | null
  later?: TaskLater | null
  createdAt: string
  updatedAt: string
}

export interface ProgressReport {
  id: string
  projectId: string
  summary: string
  completionPercent: number
  previousPercent: number | null
  sourceType: ProgressReportSourceType
  milestoneId: string | null
  taskId: string | null
  blockers: string | null
  completedResults: string | null
  nextSteps: string | null
  changeSnapshot: unknown
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

export type RiskStatus = 'OPEN' | 'MITIGATING' | 'CLOSED'
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type IssueStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
export type DecisionStatus = 'DRAFT' | 'DECIDED' | 'SUPERSEDED'
export type MeetingStatus = 'PLANNED' | 'HELD' | 'CANCELLED'
export type MeetingActionStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'
export interface Risk {
  id: string
  projectId: string | null
  milestoneId: string | null
  taskId: string | null
  title: string
  description: string | null
  likelihood: string
  impact: string
  level: RiskLevel
  mitigation: string | null
  ownerName: string | null
  status: RiskStatus
  closedAt: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}
export interface Issue {
  id: string
  projectId: string | null
  milestoneId: string | null
  taskId: string | null
  title: string
  description: string | null
  impactObject: string | null
  proposedResolution: string | null
  ownerName: string | null
  dueAt: string | null
  verificationResult: string | null
  status: IssueStatus
  closedAt: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}
export interface Decision {
  id: string
  projectId: string | null
  milestoneId: string | null
  taskId: string | null
  meetingId: string | null
  title: string
  background: string | null
  alternatives: string[]
  basis: string | null
  conclusion: string | null
  participantNames: string[]
  status: DecisionStatus
  decidedAt: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}
export type AgreementStatus = 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED'
export type CommunicationType = 'EMAIL' | 'PHONE' | 'MEETING' | 'CHAT' | 'VISIT' | 'OTHER'

export interface PartnerContact {
  id: string
  partnerId: string
  name: string
  title: string | null
  phone: string | null
  email: string | null
  notes: string | null
  archivedAt: string | null
}

export interface PartnerAgreement {
  id: string
  partnerId: string
  title: string
  agreementNo: string | null
  status: AgreementStatus
  startAt: string | null
  endAt: string | null
  notes: string | null
  archivedAt: string | null
}

export interface PartnerProject {
  partnerId: string
  projectId: string
  role: string | null
  notes: string | null
  createdAt: string
  project?: Pick<Project, 'id' | 'code' | 'name' | 'status'>
}

export interface CommunicationRecord {
  id: string
  partnerId: string
  projectId: string | null
  contactId: string | null
  taskId: string | null
  type: CommunicationType
  occurredAt: string
  subject: string
  summary: string | null
  promises: string | null
  ownerName: string | null
  nextFollowUpAt: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Partner {
  id: string
  name: string
  shortName: string | null
  category: string | null
  address: string | null
  notes: string | null
  archivedAt: string | null
  contactCount?: number
  activeAgreementCount?: number
  projectCount?: number
  fileCount?: number
  lastCommunicationAt?: string | null
  nextFollowUpAt?: string | null
  contacts?: PartnerContact[]
  agreements?: PartnerAgreement[]
  communications?: CommunicationRecord[]
  projects?: PartnerProject[]
  createdAt: string
  updatedAt: string
}
export interface MeetingAction {
  id: string
  meetingId: string
  title: string
  description: string | null
  ownerName: string | null
  dueAt: string | null
  status: MeetingActionStatus
  taskId: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}
export interface MeetingAgendaItem {
  id: string
  meetingId: string
  title: string
  description: string | null
  sequence: number
  archivedAt: string | null
}
export interface Meeting {
  id: string
  projectId: string | null
  title: string
  scheduledAt: string
  heldAt: string | null
  status: MeetingStatus
  agenda: string | null
  minutes: string | null
  participantNames: string[]
  archivedAt: string | null
  actions?: MeetingAction[]
  agendaItems?: MeetingAgendaItem[]
  decisions?: Decision[]
  minutesDocument?: {
    id: string
    title: string
    type: 'MEETING_MINUTES'
    plainText?: string | null
    content?: Record<string, unknown>
  } | null
  attachments?: Array<{
    id: string
    name: string
    latestVersion?: { id: string; versionNumber: number; mimeType: string; size: number } | null
  }>
  createdAt: string
  updatedAt: string
}
export interface Paginated<T> {
  data: T[]
  meta: PaginationMeta
}
