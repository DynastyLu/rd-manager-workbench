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
