import { describe, expect, it } from 'vitest'

import type {
  CreateProjectInput,
  ListProjectsParams,
  UpdateProjectInput,
} from '../projects'
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
  projectId: 'project-1',
  milestoneId: 'milestone-1',
  parentId: null,
  title: '核对数据',
  description: null,
  assigneeName: '李工',
  collaboratorNames: ['张工'],
  priority: 'CRITICAL',
  status: 'CANCELLED',
  dueAt: '2026-07-18T00:00:00.000Z',
  completedAt: null,
  sourceType: 'MEETING',
  sourceId: 'meeting-1',
  archivedAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} satisfies WorkTask

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
      createWorkflowTemplateInput,
      createApplicationCaseInput,
      listApplicationCasesResult,
    }).toMatchObject({
      dashboard: { healthDistribution: { GREEN: 1, YELLOW: 0, RED: 0 } },
      listProjectsResult: { meta: { page: 1, pageSize: 20, total: 1 } },
      listTasksResult: { meta: { page: 1, pageSize: 20, total: 1 } },
      applicationCase: { nodes: [{ code: 'PREPARE', status: 'PENDING' }] },
      listApplicationCasesResult: { meta: { page: 1, pageSize: 20, total: 1 } },
    })
  })
})
