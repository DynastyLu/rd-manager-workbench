import { describe, expect, it } from 'vitest'

import type { CreateProjectInput, ListProjectsParams, UpdateProjectInput } from '../projects'
import type { CreateTaskInput, ListTasksParams, UpdateTaskInput } from '../tasks'
import type {
  ApplicationCase,
  CreateApplicationCaseInput,
  CreateWorkflowTemplateInput,
  ListApplicationCasesResult,
  WorkflowTemplate,
} from '../applications'
import type {
  DashboardData,
  ListProjectsResult,
  ListTasksResult,
  Milestone,
  ProgressReport,
  Project,
  WorkTask,
} from '../../types'
import type {
  Employee,
  EmployeeLoadEntry,
  EmployeeProgress,
  EmployeeProgressMetrics,
  EmployeeSkill,
  EmployeeWorkImportBatch,
  EmployeeWorkImportRow,
  EmployeeWorkItem,
  ImportRowError,
  ProjectTeamProgress,
  TeamProgress,
  UpdateEmployeeInput,
} from '../../../employees/types'

const workflowTemplate = {
  id: 'template-1',
  name: '市级研发平台认定',
  description: '可配置的申报流程',
  category: '认定',
  version: 1,
  archivedAt: null,
  nodes: [
    {
      id: 'template-node-1',
      code: 'PREPARE',
      title: '材料准备',
      description: null,
      sequence: 1,
      prerequisiteNodeCodes: [],
      requiredRequirementCodes: [],
      requiredMaterialCodes: [],
      isRequired: true,
    },
  ],
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
} satisfies WorkflowTemplate

const applicationCase = {
  id: 'case-1',
  title: '2026 年市级研发平台认定',
  code: 'APP-2026-001',
  projectId: 'project-1',
  workflowTemplateId: 'template-1',
  subjectName: null,
  region: null,
  organization: null,
  batch: null,
  deadlineAt: null,
  collaboratorNames: [],
  status: 'IN_PROGRESS',
  archivedAt: null,
  nodes: [
    {
      id: 'case-node-1',
      workflowTemplateNodeId: 'template-node-1',
      code: 'PREPARE',
      title: '材料准备',
      description: null,
      sequence: 1,
      prerequisiteNodeCodes: [],
      requiredRequirementCodes: [],
      requiredMaterialCodes: [],
      status: 'PENDING',
      completedAt: null,
    },
  ],
  requirements: [],
  materials: [],
  evidenceRecords: [],
  corrections: [],
  submissions: [],
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
} satisfies ApplicationCase

const createWorkflowTemplateInput = {
  name: '市级研发平台认定',
  description: '可配置的申报流程',
  nodes: [{ code: 'PREPARE', title: '材料准备', sequence: 1, isRequired: true }],
} satisfies CreateWorkflowTemplateInput

const createApplicationCaseInput = {
  code: 'APP-2026-001',
  title: '2026 年市级研发平台认定',
  projectId: 'project-1',
  workflowTemplateId: 'template-1',
} satisfies CreateApplicationCaseInput

const listApplicationCasesResult = {
  data: [applicationCase],
  meta: { page: 1, pageSize: 20, total: 1 },
} satisfies ListApplicationCasesResult

const project = {
  id: 'project-1',
  code: 'RD-001',
  name: '耐盐材料筛选',
  type: '育种',
  researchDirection: '耐盐',
  objective: '筛选候选材料',
  expectedOutcome: '形成材料清单',
  leadName: '张工',
  participantNames: ['李工'],
  plannedStartAt: '2026-07-01T00:00:00.000Z',
  plannedEndAt: '2026-08-01T00:00:00.000Z',
  actualStartAt: null,
  actualEndAt: null,
  phase: 'DEVELOPMENT',
  status: 'CANCELLED',
  health: 'GREEN',
  healthOverride: null,
  archivedAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} satisfies Project

const milestone = {
  id: 'milestone-1',
  projectId: 'project-1',
  name: '完成初筛',
  plannedAt: '2026-07-20T00:00:00.000Z',
  actualAt: null,
  ownerName: '张工',
  isCritical: true,
  status: 'IN_PROGRESS',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} satisfies Milestone

const task = {
  id: 'task-1',
  code: 'TASK-001',
  projectId: 'project-1',
  milestoneId: 'milestone-1',
  parentId: null,
  title: '核对数据',
  description: null,
  assigneeName: '李工',
  collaboratorNames: ['张工'],
  priority: 'CRITICAL',
  status: 'CANCELLED',
  completionPercent: 40,
  dueAt: '2026-07-18T00:00:00.000Z',
  completedAt: null,
  sourceType: 'MEETING',
  sourceId: 'meeting-1',
  archivedAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} satisfies WorkTask

const employeeProgressMetrics = {
  workItemCount: 1,
  completedCount: 1,
  completionRate: 100,
  averageCompletionRate: 100,
  plannedHours: 8,
  actualHours: 7,
  riskCount: 0,
  blockedCount: 0,
  projectCount: 1,
  unlinkedCount: 0,
  dataComplete: true,
  missingWeeks: [],
} satisfies EmployeeProgressMetrics

const employeeSkill = {
  id: 'skill-1',
  resourceId: 'employee-1',
  name: 'TypeScript',
  level: 'PROFICIENT',
  evidence: null,
  assessedAt: '2026-07-18T00:00:00.000Z',
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
} satisfies EmployeeSkill

const employeeLoadEntry = {
  id: 'load-1',
  resourceId: 'employee-1',
  weekStartAt: '2026-07-20T00:00:00.000Z',
  kind: 'PROJECT',
  nonProjectRdItemId: null,
  projectId: 'project-1',
  taskId: null,
  employeeWorkItemId: 'work-1',
  employeeWorkImportBatchId: 'batch-1',
  plannedHours: '8.00',
  note: null,
  archivedAt: null,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
} satisfies EmployeeLoadEntry

const employee = {
  id: 'employee-1',
  displayName: '张明',
  roleTitle: '高级工程师',
  department: '研发部',
  managerName: null,
  employmentStatus: 'ACTIVE',
  weeklyCapacityHours: 40,
  developmentGoal: null,
  notes: null,
  archivedAt: null,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
  skills: [employeeSkill],
  loadEntries: [employeeLoadEntry],
} satisfies Employee

const importRowError = {
  field: 'employeeName',
  code: 'EMPLOYEE_NOT_FOUND',
  rawValue: '未知员工',
  reason: '找不到有效员工',
} satisfies ImportRowError

const employeeImportRow = {
  id: 'row-1',
  rowNumber: 18,
  status: 'UNRESOLVED',
  errors: [importRowError],
  rawValues: { 员工姓名: '未知员工', 工作内容: '完成权限联调' },
  normalizedValues: {
    rowNumber: 18,
    employeeName: '未知员工',
    title: '完成权限联调',
    planText: '联调权限',
    summaryText: null,
    completionRate: null,
    status: 'IN_PROGRESS',
    nextPlanText: null,
    riskText: null,
    plannedHours: 8,
    actualHours: null,
    projectCode: 'RD-001',
    taskCode: 'TASK-001',
    note: null,
    rawValues: { 员工姓名: '未知员工', 工作内容: '完成权限联调' },
  },
  resolvedEmployeeId: null,
  resolvedProjectId: 'project-1',
  resolvedTaskId: 'task-1',
  keepUnlinked: false,
  workItemId: null,
  links: {
    sourceBatch: '/employee-work-imports/batch-1',
  },
} satisfies EmployeeWorkImportRow

const stagedEmployeeImportBatch = {
  id: 'batch-1',
  periodType: 'WEEK',
  periodStart: '2026-07-20',
  periodEnd: '2026-07-26',
  version: null,
  status: 'READY',
  snapshotStatus: 'NOT_STARTED',
  snapshotError: null,
  originalName: '研发周报.xlsx',
  fileHash: 'sha256',
  templateVersion: 1,
  totalRows: 1,
  validRows: 1,
  errorRows: 0,
  unresolvedRows: 0,
  importedRows: 0,
  supersedesBatchId: null,
  restoredFromBatchId: null,
  committedAt: null,
  expiresAt: '2026-07-24T00:00:00.000Z',
  archivedAt: null,
  createdAt: '2026-07-23T00:00:00.000Z',
  updatedAt: '2026-07-23T00:00:00.000Z',
  hasErrors: false,
  sourceAvailable: true,
  sourceBatchIds: ['batch-1'],
  links: {
    self: '/employee-work-imports/batch-1',
    source: '/employee-work-imports/batch-1/source',
  },
} satisfies EmployeeWorkImportBatch

const employeeWorkItem = {
  id: 'work-1',
  employeeId: 'employee-1',
  employeeName: '张明',
  department: '研发部',
  importBatchId: 'batch-1',
  importVersion: 1,
  sourceRowId: 'row-1',
  sourceRowNumber: 18,
  sourceBatchIds: ['batch-1'],
  periodStart: '2026-07-20',
  periodEnd: '2026-07-26',
  title: '完成权限联调',
  planText: '联调权限',
  summaryText: '已完成',
  completionRate: 100,
  status: 'COMPLETED',
  nextPlanText: null,
  riskText: null,
  plannedHours: 8,
  actualHours: 7,
  project: { id: 'project-1', code: 'RD-001', name: '耐盐材料筛选' },
  task: { id: 'task-1', code: 'TASK-001', title: '核对数据' },
  riskId: null,
  note: null,
  links: {
    selfUrl: '/employee-work-items/work-1',
    employeeProgressUrl: '/employees/employee-1/progress?periodType=WEEK&periodStart=2026-07-20',
    projectProgressUrl: '/projects/project-1/team-progress?periodType=WEEK&periodStart=2026-07-20',
    taskUrl: '/projects/project-1?taskId=task-1',
    sourceBatchUrl: '/employee-work-imports/batch-1',
  },
} satisfies EmployeeWorkItem

const employeeWorkItemSummary = {
  id: employeeWorkItem.id,
  title: employeeWorkItem.title,
  employeeId: employeeWorkItem.employeeId,
  employeeName: employeeWorkItem.employeeName,
  projectId: employeeWorkItem.project.id,
  projectCode: employeeWorkItem.project.code,
  status: employeeWorkItem.status,
  riskText: employeeWorkItem.riskText,
  sourceBatchIds: employeeWorkItem.sourceBatchIds,
  links: employeeWorkItem.links,
}

const teamProgress = {
  period: { type: 'WEEK', start: '2026-07-20', end: '2026-07-26' },
  metrics: employeeProgressMetrics,
  sourceBatchIds: ['batch-1'],
  employees: {
    data: [
      {
        employeeId: employee.id,
        displayName: employee.displayName,
        department: employee.department,
        roleTitle: employee.roleTitle,
        metrics: employeeProgressMetrics,
        sourceBatchIds: ['batch-1'],
        employeeProgressUrl:
          '/employees/employee-1/progress?periodType=WEEK&periodStart=2026-07-20',
        workItemsUrl:
          '/employee-work-items?periodType=WEEK&periodStart=2026-07-20&employeeId=employee-1',
      },
    ],
    total: 1,
    limit: 100,
    hasMore: false,
  },
  projects: {
    data: [
      {
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        participantCount: 1,
        metrics: employeeProgressMetrics,
        sourceBatchIds: ['batch-1'],
        projectProgressUrl:
          '/projects/project-1/team-progress?periodType=WEEK&periodStart=2026-07-20',
        workItemsUrl:
          '/employee-work-items?periodType=WEEK&periodStart=2026-07-20&projectId=project-1',
      },
    ],
    total: 1,
    limit: 100,
    hasMore: false,
  },
  risks: { data: [employeeWorkItemSummary], total: 1, limit: 20, hasMore: false },
  links: {
    workItemsUrl: '/employee-work-items?periodType=WEEK&periodStart=2026-07-20',
  },
} satisfies TeamProgress

const employeeProgress = {
  employee: {
    id: employee.id,
    displayName: employee.displayName,
    department: employee.department,
    roleTitle: employee.roleTitle,
    managerName: employee.managerName,
    employmentStatus: employee.employmentStatus,
    weeklyCapacityHours: employee.weeklyCapacityHours,
  },
  period: teamProgress.period,
  metrics: employeeProgressMetrics,
  sourceBatchIds: ['batch-1'],
  projects: {
    data: [
      {
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        metrics: employeeProgressMetrics,
        sourceBatchIds: ['batch-1'],
        projectProgressUrl:
          '/projects/project-1/team-progress?periodType=WEEK&periodStart=2026-07-20',
        workItemsUrl:
          '/employee-work-items?periodType=WEEK&periodStart=2026-07-20&employeeId=employee-1&projectId=project-1',
      },
    ],
    total: 1,
    limit: 100,
    hasMore: false,
  },
  risks: { data: [employeeWorkItemSummary], total: 1, limit: 20, hasMore: false },
  links: {
    workItemsUrl:
      '/employee-work-items?periodType=WEEK&periodStart=2026-07-20&employeeId=employee-1',
  },
} satisfies EmployeeProgress

const projectTeamProgress = {
  project: {
    id: 'project-1',
    code: 'RD-001',
    name: '耐盐材料筛选',
    status: 'ACTIVE',
  },
  period: { type: 'WEEK', start: '2026-07-20', end: '2026-07-26' },
  metrics: employeeProgressMetrics,
  sourceBatchIds: ['batch-1'],
  employees: {
    data: [
      {
        employeeId: 'employee-1',
        displayName: '张明',
        department: '研发部',
        metrics: employeeProgressMetrics,
        completedItems: {
          data: [{ workItemId: 'work-1', title: '完成权限联调' }],
          total: 1,
          limit: 10,
          hasMore: false,
        },
        nextPlans: { data: [], total: 0, limit: 10, hasMore: false },
        risks: { data: [], total: 0, limit: 10, hasMore: false },
        sourceBatchIds: ['batch-1'],
        employeeProgressUrl:
          '/employees/employee-1/progress?periodType=WEEK&periodStart=2026-07-20&projectId=project-1',
        workItemsUrl:
          '/employee-work-items?periodType=WEEK&periodStart=2026-07-20&employeeId=employee-1&projectId=project-1',
      },
    ],
    total: 1,
    limit: 100,
    hasMore: false,
  },
  risks: { data: [], total: 0, limit: 20, hasMore: false },
  links: {
    workItemsUrl: '/employee-work-items?periodType=WEEK&periodStart=2026-07-20&projectId=project-1',
  },
} satisfies ProjectTeamProgress

type EmployeeUpdateRejectsNull = null extends UpdateEmployeeInput['roleTitle'] ? false : true
const employeeUpdateRejectsNull: EmployeeUpdateRejectsNull = true

const progressReport = {
  id: 'report-1',
  projectId: 'project-1',
  reportedAt: '2026-07-18T00:00:00.000Z',
  summary: '完成初筛',
  completionPercent: 40,
  blockers: null,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
} satisfies ProgressReport

const dashboard = {
  todayActions: [task],
  overdueTasks: [task],
  dueSoonMilestones: [milestone],
  healthDistribution: { GREEN: 1, YELLOW: 0, RED: 0 },
  projectsNeedingAttention: [project],
  recentProgressReports: [progressReport],
} satisfies DashboardData

const listProjectsResult = {
  data: [project],
  meta: { page: 1, pageSize: 20, total: 1 },
} satisfies ListProjectsResult

const listTasksResult = {
  data: [task],
  meta: { page: 1, pageSize: 20, total: 1 },
} satisfies ListTasksResult

const createProjectInput = {
  code: 'RD-001',
  name: '耐盐材料筛选',
  participantNames: ['李工'],
  plannedStartAt: '2026-07-01T00:00:00.000Z',
  plannedEndAt: '2026-08-01T00:00:00.000Z',
  phase: 'RESEARCH',
  status: 'ACTIVE',
} satisfies CreateProjectInput

const updateProjectInput = {
  actualStartAt: '2026-07-02T00:00:00.000Z',
  actualEndAt: null,
  status: 'CANCELLED',
} satisfies UpdateProjectInput

const listProjectsParams = {
  ids: ['project-150', 'project-5'],
  status: 'CANCELLED',
  phase: 'DELIVERY',
  page: 1,
  pageSize: 20,
} satisfies ListProjectsParams

const createTaskInput = {
  title: '核对数据',
  projectId: 'project-1',
  parentId: 'parent-task-1',
  dependencyIds: ['task-0'],
  collaboratorNames: ['张工'],
  priority: 'CRITICAL',
  status: 'TODO',
  dueAt: '2026-07-18T00:00:00.000Z',
  sourceType: 'MEETING',
  sourceId: 'meeting-1',
} satisfies CreateTaskInput

const updateTaskInput = {
  assigneeName: '李工',
  collaboratorNames: ['张工'],
  priority: 'CRITICAL',
  status: 'CANCELLED',
  dueAt: null,
  sourceType: 'MEETING',
  sourceId: 'meeting-1',
} satisfies UpdateTaskInput

const listTasksParams = {
  projectId: 'project-1',
  status: 'CANCELLED',
  assigneeName: '李工',
  dueBefore: '2026-07-20T00:00:00.000Z',
  overdue: true,
  page: 1,
  pageSize: 20,
} satisfies ListTasksParams

describe('workbench client contracts', () => {
  it('matches the approved project execution P0 API shape', () => {
    expect({
      dashboard,
      listProjectsParams,
      listProjectsResult,
      listTasksParams,
      listTasksResult,
      createProjectInput,
      updateProjectInput,
      createTaskInput,
      updateTaskInput,
      workflowTemplate,
      applicationCase,
      employee,
      stagedEmployeeImportBatch,
      employeeImportRow,
      employeeWorkItem,
      teamProgress,
      employeeProgress,
      projectTeamProgress,
      createWorkflowTemplateInput,
      createApplicationCaseInput,
      listApplicationCasesResult,
    }).toMatchObject({
      dashboard: { healthDistribution: { GREEN: 1, YELLOW: 0, RED: 0 } },
      listProjectsResult: { meta: { page: 1, pageSize: 20, total: 1 } },
      listTasksResult: { meta: { page: 1, pageSize: 20, total: 1 } },
      applicationCase: { nodes: [{ code: 'PREPARE', status: 'PENDING' }] },
      employee: { loadEntries: [{ plannedHours: '8.00' }] },
      stagedEmployeeImportBatch: {
        version: null,
        periodStart: '2026-07-20',
        periodEnd: '2026-07-26',
        sourceAvailable: true,
      },
      employeeImportRow: { errors: [{ code: 'EMPLOYEE_NOT_FOUND' }] },
      employeeWorkItem: { riskId: null },
      teamProgress: { employees: { total: 1, hasMore: false } },
      employeeProgress: { projects: { total: 1, hasMore: false } },
      projectTeamProgress: { employees: { total: 1, hasMore: false } },
      listApplicationCasesResult: { meta: { page: 1, pageSize: 20, total: 1 } },
    })
    expect(employeeUpdateRejectsNull).toBe(true)
  })
})
