export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED'

export type ProjectPhase = 'PLANNING' | 'EXECUTION' | 'CLOSING'

export type ProjectHealth = 'HEALTHY' | 'AT_RISK' | 'CRITICAL' | 'UNKNOWN'

export interface Project {
  id: string
  code: string | null
  name: string
  description: string | null
  status: ProjectStatus
  phase: ProjectPhase
  health: ProjectHealth
  startDate: string | null
  targetDate: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Milestone {
  id: string
  projectId: string
  name: string
  description: string | null
  dueDate: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'ARCHIVED'

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

export interface WorkTask {
  id: string
  projectId: string | null
  milestoneId: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  dueDate: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ProgressReport {
  id: string
  projectId: string
  summary: string
  progressPercent: number
  reportedAt: string
  createdAt: string
  updatedAt: string
}

export interface DashboardData {
  todayTasks: WorkTask[]
  overdueTasks: WorkTask[]
  projects: Project[]
  projectHealthSummary: Record<ProjectHealth, number>
  upcomingMilestones: Milestone[]
}

export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface ListProjectsResult {
  items: Project[]
  pagination: PaginationMeta
}

export interface ListTasksResult {
  items: WorkTask[]
  pagination: PaginationMeta
}
