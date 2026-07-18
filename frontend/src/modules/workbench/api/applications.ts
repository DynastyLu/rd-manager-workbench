import { request } from '@/lib/http'
import type {
  ApplicationCase,
  ApplicationCaseStatus,
  ApplicationNode,
  ApplicationNodeStatus,
  ApplicationRequirement,
  ApplicationRequirementStatus,
  ApplicationMaterial,
  CorrectionRecord,
  CorrectionStatus,
  EvidenceRecord,
  ListApplicationCasesResult,
  ListWorkflowTemplatesResult,
  MaterialVersion,
  MaterialReviewStatus,
  SubmissionRecord,
  WorkflowTemplate,
} from '@/modules/workbench/types'

export type {
  ApplicationCase,
  ListApplicationCasesResult,
  WorkflowTemplate,
} from '@/modules/workbench/types'

interface PaginationParams {
  page?: number
  pageSize?: number
}

export interface ListWorkflowTemplatesParams extends PaginationParams {
  search?: string
}

export interface ListApplicationCasesParams extends PaginationParams {
  search?: string
  status?: ApplicationCaseStatus
  projectId?: string
  workflowTemplateId?: string
}

export interface WorkflowTemplateNodeInput {
  code: string
  title: string
  sequence: number
  description?: string
  prerequisiteNodeCodes?: string[]
  requiredRequirementCodes?: string[]
  requiredMaterialCodes?: string[]
  isRequired?: boolean
}

export interface CreateWorkflowTemplateInput {
  name: string
  description?: string
  category?: string
  nodes: WorkflowTemplateNodeInput[]
}

export interface CreateApplicationCaseInput {
  code: string
  title: string
  projectId: string
  workflowTemplateId: string
}

export interface UpdateApplicationCaseInput {
  title?: string
  subjectName?: string | null
  region?: string | null
  organization?: string | null
  batch?: string | null
  deadlineAt?: string | null
  collaboratorNames?: string[]
  status?: ApplicationCaseStatus
}

export interface UpdateApplicationNodeInput {
  status?: ApplicationNodeStatus
}

export interface CreateApplicationRequirementInput {
  applicationNodeId?: string
  code: string
  title: string
  description?: string
  isRequired?: boolean
}

export interface UpdateApplicationRequirementInput {
  title?: string
  description?: string | null
  isRequired?: boolean
  status?: ApplicationRequirementStatus
  applicationNodeId?: string
}

export interface CreateApplicationMaterialInput {
  applicationNodeId?: string
  code: string
  title: string
  category?: string
  isRequired?: boolean
}

export interface CreateMaterialVersionInput {
  fileName: string
  storageKey?: string
  checksum?: string
  fileSize?: number
  note?: string
  reviewStatus?: MaterialReviewStatus
  isFinal?: boolean
}

export interface CreateEvidenceRecordInput {
  title: string
  description?: string
  sourceUri?: string
  collectedAt?: string
  requirementIds?: string[]
  materialIds?: string[]
}

export interface CreateCorrectionInput {
  title: string
  details?: string
  dueAt?: string
  status?: CorrectionStatus
  submissionRecordId?: string
  materialVersionIds?: string[]
}

export interface CreateSubmissionInput {
  note?: string
  materialVersionIds: string[]
}

function toQueryString(params: object): string {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      searchParams.set(key, String(value))
    }
  }

  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

function casePath(caseId: string): string {
  return `/application-cases/${encodeURIComponent(caseId)}`
}

export function listWorkflowTemplates(
  params: ListWorkflowTemplatesParams = {},
): Promise<ListWorkflowTemplatesResult> {
  return request<ListWorkflowTemplatesResult>(`/workflow-templates${toQueryString(params)}`)
}

export function createWorkflowTemplate(input: CreateWorkflowTemplateInput): Promise<WorkflowTemplate> {
  return request<WorkflowTemplate>('/workflow-templates', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function listApplicationCases(
  params: ListApplicationCasesParams = {},
): Promise<ListApplicationCasesResult> {
  return request<ListApplicationCasesResult>(`/application-cases${toQueryString(params)}`)
}

export function getApplicationCase(caseId: string): Promise<ApplicationCase> {
  return request<ApplicationCase>(casePath(caseId))
}

export function createApplicationCase(input: CreateApplicationCaseInput): Promise<ApplicationCase> {
  return request<ApplicationCase>('/application-cases', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateApplicationCase(
  caseId: string,
  input: UpdateApplicationCaseInput,
): Promise<ApplicationCase> {
  return request<ApplicationCase>(casePath(caseId), {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function archiveApplicationCase(caseId: string): Promise<void> {
  return request<void>(casePath(caseId), { method: 'DELETE' })
}

export function createApplicationNode(
  caseId: string,
  input: WorkflowTemplateNodeInput,
): Promise<ApplicationNode> {
  return request<ApplicationNode>(`${casePath(caseId)}/nodes`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateApplicationNode(
  caseId: string,
  nodeId: string,
  input: UpdateApplicationNodeInput,
): Promise<ApplicationNode> {
  return request<ApplicationNode>(`${casePath(caseId)}/nodes/${encodeURIComponent(nodeId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function createApplicationRequirement(
  caseId: string,
  input: CreateApplicationRequirementInput,
): Promise<ApplicationRequirement> {
  return request<ApplicationRequirement>(`${casePath(caseId)}/requirements`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateApplicationRequirement(
  caseId: string,
  requirementId: string,
  input: UpdateApplicationRequirementInput,
): Promise<ApplicationRequirement> {
  return request<ApplicationRequirement>(
    `${casePath(caseId)}/requirements/${encodeURIComponent(requirementId)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
}

export function createApplicationMaterial(
  caseId: string,
  input: CreateApplicationMaterialInput,
): Promise<ApplicationMaterial> {
  return request<ApplicationMaterial>(`${casePath(caseId)}/materials`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function createMaterialVersion(
  caseId: string,
  materialId: string,
  input: CreateMaterialVersionInput,
): Promise<MaterialVersion> {
  return request<MaterialVersion>(`${casePath(caseId)}/materials/${encodeURIComponent(materialId)}/versions`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function createEvidenceRecord(
  caseId: string,
  input: CreateEvidenceRecordInput,
): Promise<EvidenceRecord> {
  return request<EvidenceRecord>(`${casePath(caseId)}/evidence-records`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function createCorrection(
  caseId: string,
  input: CreateCorrectionInput,
): Promise<CorrectionRecord> {
  return request<CorrectionRecord>(`${casePath(caseId)}/corrections`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function createSubmission(
  caseId: string,
  input: CreateSubmissionInput,
): Promise<SubmissionRecord> {
  return request<SubmissionRecord>(`${casePath(caseId)}/submissions`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
