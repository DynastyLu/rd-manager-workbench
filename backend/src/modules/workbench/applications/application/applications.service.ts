import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ApplicationCaseStatus,
  ApplicationNodeStatus,
  Prisma,
  RequirementStatus,
  SubmissionStatus,
} from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import {
  CreateApplicationCaseDto,
  ListApplicationCasesQueryDto,
  UpdateApplicationCaseDto,
} from '../interface/http/dto/application-case.dto';
import {
  CreateApplicationMaterialDto,
  CreateApplicationRequirementDto,
  CreateCorrectionRecordDto,
  CreateEvidenceRecordDto,
  CreateMaterialVersionDto,
  CreateSubmissionRecordDto,
  UpdateApplicationNodeDto,
  UpdateApplicationRequirementDto,
} from '../interface/http/dto/application-workspace.dto';
import {
  CreateWorkflowTemplateDto,
  UpdateWorkflowTemplateDto,
  WorkflowTemplateNodeDto,
} from '../interface/http/dto/workflow-template.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
type DatabaseClient = PlatformPrismaService | Prisma.TransactionClient;

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  async createTemplate(dto: CreateWorkflowTemplateDto) {
    this.assertTemplateNodes(dto.nodes);
    return this.prisma.workflowTemplate.create({
      data: {
        name: dto.name,
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        nodes: { create: dto.nodes.map((node) => this.toTemplateNodeData(node)) },
      },
      include: { nodes: { orderBy: [{ sequence: 'asc' }, { id: 'asc' }] } },
    });
  }

  async listTemplates(query: { page?: number; pageSize?: number }) {
    const { page, pageSize } = this.pagination(query);
    const where = { archivedAt: null };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.workflowTemplate.findMany({
        where,
        include: { nodes: { orderBy: [{ sequence: 'asc' }, { id: 'asc' }] } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.workflowTemplate.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async getTemplate(id: string) {
    const template = await this.prisma.workflowTemplate.findFirst({
      where: { id, archivedAt: null },
      include: { nodes: { orderBy: [{ sequence: 'asc' }, { id: 'asc' }] } },
    });
    if (!template)
      throw this.notFound(ErrorCodes.WORKFLOW_TEMPLATE_NOT_FOUND, 'Workflow template not found');
    return template;
  }

  async updateTemplate(id: string, dto: UpdateWorkflowTemplateDto) {
    if (dto.nodes) this.assertTemplateNodes(dto.nodes);
    const result = await this.prisma.workflowTemplate.updateMany({
      where: { id, archivedAt: null },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.nodes !== undefined ? { version: { increment: 1 } } : {}),
      },
    });
    if (!result.count)
      throw this.notFound(ErrorCodes.WORKFLOW_TEMPLATE_NOT_FOUND, 'Workflow template not found');
    if (dto.nodes !== undefined) {
      await this.prisma.workflowTemplateNode.deleteMany({ where: { workflowTemplateId: id } });
      await this.prisma.workflowTemplateNode.createMany({
        data: dto.nodes.map((node) => ({
          workflowTemplateId: id,
          ...this.toTemplateNodeData(node),
        })),
      });
    }
    return this.getTemplate(id);
  }

  async archiveTemplate(id: string) {
    const result = await this.prisma.workflowTemplate.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (!result.count)
      throw this.notFound(ErrorCodes.WORKFLOW_TEMPLATE_NOT_FOUND, 'Workflow template not found');
  }

  async createCase(dto: CreateApplicationCaseDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveProject(tx, dto.projectId);
      const template = await tx.workflowTemplate.findFirst({
        where: { id: dto.workflowTemplateId, archivedAt: null },
        include: { nodes: { orderBy: [{ sequence: 'asc' }, { id: 'asc' }] } },
      });
      if (!template) {
        throw this.notFound(ErrorCodes.WORKFLOW_TEMPLATE_NOT_FOUND, 'Workflow template not found');
      }
      try {
        return await tx.applicationCase.create({
          data: {
            code: dto.code,
            title: dto.title,
            projectId: dto.projectId,
            workflowTemplateId: template.id,
            ...(dto.subjectName !== undefined ? { subjectName: dto.subjectName } : {}),
            ...(dto.region !== undefined ? { region: dto.region } : {}),
            ...(dto.organization !== undefined ? { organization: dto.organization } : {}),
            ...(dto.batch !== undefined ? { batch: dto.batch } : {}),
            ...(dto.deadlineAt !== undefined ? { deadlineAt: new Date(dto.deadlineAt) } : {}),
            ...(dto.collaboratorNames !== undefined
              ? { collaboratorNames: dto.collaboratorNames }
              : {}),
            ...(dto.status !== undefined ? { status: dto.status } : {}),
            nodes: {
              create: template.nodes.map((node) => ({
                workflowTemplateNodeId: node.id,
                code: node.code,
                title: node.title,
                description: node.description,
                sequence: node.sequence,
                prerequisiteNodeCodes: node.prerequisiteNodeCodes,
                requiredRequirementCodes: node.requiredRequirementCodes,
                requiredMaterialCodes: node.requiredMaterialCodes,
                snapshot: {
                  code: node.code,
                  title: node.title,
                  description: node.description,
                  sequence: node.sequence,
                  prerequisiteNodeCodes: node.prerequisiteNodeCodes,
                  requiredRequirementCodes: node.requiredRequirementCodes,
                  requiredMaterialCodes: node.requiredMaterialCodes,
                  isRequired: node.isRequired,
                  workflowTemplateVersion: template.version,
                },
              })),
            },
          },
          include: { nodes: { orderBy: [{ sequence: 'asc' }, { id: 'asc' }] } },
        });
      } catch (error) {
        this.throwIfDuplicateCode(error);
        throw error;
      }
    });
  }

  async listCases(query: ListApplicationCasesQueryDto) {
    const { page, pageSize } = this.pagination(query);
    const where: Prisma.ApplicationCaseWhereInput = {
      archivedAt: null,
      ...(query.projectId !== undefined ? { projectId: query.projectId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.applicationCase.findMany({
        where,
        include: {
          project: { select: { id: true, code: true, name: true } },
          workflowTemplate: { select: { id: true, name: true, version: true } },
        },
        orderBy: [{ deadlineAt: 'asc' }, { updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.applicationCase.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async getCase(id: string) {
    const applicationCase = await this.prisma.applicationCase.findFirst({
      where: { id, archivedAt: null },
      include: this.caseDetailsInclude(),
    });
    if (!applicationCase)
      throw this.notFound(ErrorCodes.APPLICATION_CASE_NOT_FOUND, 'Application case not found');
    return applicationCase;
  }

  async updateCase(id: string, dto: UpdateApplicationCaseDto) {
    await this.assertCaseWritable(this.prisma, id);
    return this.prisma.applicationCase.update({
      where: { id },
      data: this.toCaseUpdateData(dto),
    });
  }

  async archiveCase(id: string) {
    const result = await this.prisma.applicationCase.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (!result.count)
      throw this.notFound(ErrorCodes.APPLICATION_CASE_NOT_FOUND, 'Application case not found');
  }

  async updateNode(caseId: string, nodeId: string, dto: UpdateApplicationNodeDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertCaseWritable(tx, caseId);
      const node = await tx.applicationNode.findFirst({
        where: { id: nodeId, applicationCaseId: caseId },
      });
      if (!node)
        throw this.notFound(ErrorCodes.APPLICATION_NODE_NOT_FOUND, 'Application node not found');
      if (dto.status === ApplicationNodeStatus.COMPLETED)
        await this.assertNodeCompletionAllowed(tx, caseId, node);
      return tx.applicationNode.update({
        where: { id: nodeId },
        data: {
          status: dto.status,
          ...(dto.status === ApplicationNodeStatus.COMPLETED
            ? { completedAt: new Date() }
            : { completedAt: null }),
        },
      });
    });
  }

  async createRequirement(caseId: string, dto: CreateApplicationRequirementDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertCaseWritable(tx, caseId);
      if (dto.applicationNodeId) await this.assertCaseNode(tx, caseId, dto.applicationNodeId);
      return tx.applicationRequirement.create({
        data: {
          applicationCaseId: caseId,
          code: dto.code,
          title: dto.title,
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.isRequired !== undefined ? { isRequired: dto.isRequired } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.applicationNodeId !== undefined
            ? { applicationNodeId: dto.applicationNodeId }
            : {}),
        },
      });
    });
  }

  async updateRequirement(
    caseId: string,
    requirementId: string,
    dto: UpdateApplicationRequirementDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertCaseWritable(tx, caseId);
      const requirement = await tx.applicationRequirement.findFirst({
        where: { id: requirementId, applicationCaseId: caseId },
      });
      if (!requirement)
        throw this.notFound(
          ErrorCodes.APPLICATION_REQUIREMENT_NOT_FOUND,
          'Application requirement not found',
        );
      if (dto.applicationNodeId) await this.assertCaseNode(tx, caseId, dto.applicationNodeId);
      return tx.applicationRequirement.update({
        where: { id: requirementId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.isRequired !== undefined ? { isRequired: dto.isRequired } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.applicationNodeId !== undefined
            ? { applicationNodeId: dto.applicationNodeId }
            : {}),
        },
      });
    });
  }

  async createMaterial(caseId: string, dto: CreateApplicationMaterialDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertCaseWritable(tx, caseId);
      if (dto.applicationNodeId) await this.assertCaseNode(tx, caseId, dto.applicationNodeId);
      return tx.applicationMaterial.create({
        data: {
          applicationCaseId: caseId,
          code: dto.code,
          title: dto.title,
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.isRequired !== undefined ? { isRequired: dto.isRequired } : {}),
          ...(dto.applicationNodeId !== undefined
            ? { applicationNodeId: dto.applicationNodeId }
            : {}),
        },
      });
    });
  }

  async createMaterialVersion(caseId: string, materialId: string, dto: CreateMaterialVersionDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertCaseWritable(tx, caseId);
      const material = await tx.applicationMaterial.findFirst({
        where: { id: materialId, applicationCaseId: caseId },
      });
      if (!material)
        throw this.notFound(
          ErrorCodes.APPLICATION_MATERIAL_NOT_FOUND,
          'Application material not found',
        );
      const latest = await tx.materialVersion.aggregate({
        where: { applicationMaterialId: materialId },
        _max: { versionNumber: true },
      });
      return tx.materialVersion.create({
        data: {
          applicationMaterialId: materialId,
          versionNumber: (latest._max.versionNumber ?? 0) + 1,
          fileName: dto.fileName,
          ...(dto.storageKey !== undefined ? { storageKey: dto.storageKey } : {}),
          ...(dto.checksum !== undefined ? { checksum: dto.checksum } : {}),
          ...(dto.fileSize !== undefined ? { fileSize: dto.fileSize } : {}),
          ...(dto.note !== undefined ? { note: dto.note } : {}),
          ...(dto.reviewStatus !== undefined ? { reviewStatus: dto.reviewStatus } : {}),
          ...(dto.isFinal !== undefined ? { isFinal: dto.isFinal } : {}),
        },
      });
    });
  }

  async createEvidence(caseId: string, dto: CreateEvidenceRecordDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertCaseWritable(tx, caseId);
      await this.assertEvidenceLinks(tx, caseId, dto.requirementIds ?? [], dto.materialIds ?? []);
      return tx.evidenceRecord.create({
        data: {
          applicationCaseId: caseId,
          title: dto.title,
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.sourceUri !== undefined ? { sourceUri: dto.sourceUri } : {}),
          ...(dto.collectedAt !== undefined ? { collectedAt: new Date(dto.collectedAt) } : {}),
          links: {
            create: [
              ...(dto.requirementIds ?? []).map((applicationRequirementId) => ({
                applicationRequirementId,
              })),
              ...(dto.materialIds ?? []).map((applicationMaterialId) => ({
                applicationMaterialId,
              })),
            ],
          },
        },
        include: { links: true },
      });
    });
  }

  async createCorrection(caseId: string, dto: CreateCorrectionRecordDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertCaseWritable(tx, caseId);
      if (dto.submissionRecordId) await this.assertSubmission(tx, caseId, dto.submissionRecordId);
      await this.assertMaterialVersions(tx, caseId, dto.materialVersionIds ?? []);
      return tx.correctionRecord.create({
        data: {
          applicationCaseId: caseId,
          title: dto.title,
          ...(dto.details !== undefined ? { details: dto.details } : {}),
          ...(dto.dueAt !== undefined ? { dueAt: new Date(dto.dueAt) } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.submissionRecordId !== undefined
            ? { submissionRecordId: dto.submissionRecordId }
            : {}),
          materialVersions: {
            create: (dto.materialVersionIds ?? []).map((materialVersionId) => ({
              materialVersionId,
            })),
          },
        },
        include: { materialVersions: true },
      });
    });
  }

  async createSubmission(caseId: string, dto: CreateSubmissionRecordDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertCaseWritable(tx, caseId);
      await this.assertMaterialVersions(tx, caseId, dto.materialVersionIds);
      const submission = await tx.submissionRecord.create({
        data: {
          applicationCaseId: caseId,
          ...(dto.referenceNumber !== undefined ? { referenceNumber: dto.referenceNumber } : {}),
          ...(dto.submittedByName !== undefined ? { submittedByName: dto.submittedByName } : {}),
          ...(dto.submittedAt !== undefined ? { submittedAt: new Date(dto.submittedAt) } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.note !== undefined ? { note: dto.note } : {}),
          materialVersions: {
            create: dto.materialVersionIds.map((materialVersionId) => ({ materialVersionId })),
          },
        },
        include: { materialVersions: true },
      });
      if (submission.status === SubmissionStatus.SUBMITTED) {
        await tx.applicationCase.update({
          where: { id: caseId },
          data: { status: ApplicationCaseStatus.SUBMITTED },
        });
      }
      return submission;
    });
  }

  private caseDetailsInclude() {
    return {
      project: { select: { id: true, code: true, name: true } },
      workflowTemplate: { select: { id: true, name: true, version: true } },
      nodes: { orderBy: [{ sequence: 'asc' as const }, { id: 'asc' as const }] },
      requirements: {
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
        include: { evidenceLinks: true },
      },
      materials: {
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
        include: {
          versions: { orderBy: [{ versionNumber: 'asc' as const }] },
          evidenceLinks: true,
        },
      },
      evidenceRecords: { orderBy: [{ createdAt: 'desc' as const }], include: { links: true } },
      corrections: {
        orderBy: [{ createdAt: 'desc' as const }],
        include: { materialVersions: true },
      },
      submissions: {
        orderBy: [{ createdAt: 'desc' as const }],
        include: { materialVersions: true },
      },
    } satisfies Prisma.ApplicationCaseInclude;
  }

  private async assertNodeCompletionAllowed(
    tx: DatabaseClient,
    caseId: string,
    node: {
      prerequisiteNodeCodes: string[];
      requiredRequirementCodes: string[];
      requiredMaterialCodes: string[];
    },
  ) {
    const [prerequisites, requirements, materials] = await Promise.all([
      node.prerequisiteNodeCodes.length
        ? tx.applicationNode.findMany({
            where: { applicationCaseId: caseId, code: { in: node.prerequisiteNodeCodes } },
            select: { code: true, status: true },
          })
        : [],
      node.requiredRequirementCodes.length
        ? tx.applicationRequirement.findMany({
            where: { applicationCaseId: caseId, code: { in: node.requiredRequirementCodes } },
            select: { code: true, status: true, isRequired: true },
          })
        : [],
      node.requiredMaterialCodes.length
        ? tx.applicationMaterial.findMany({
            where: { applicationCaseId: caseId, code: { in: node.requiredMaterialCodes } },
            select: { code: true, isRequired: true, versions: { select: { id: true } } },
          })
        : [],
    ]);
    const missingPrerequisiteCodes = node.prerequisiteNodeCodes.filter(
      (code) =>
        prerequisites.find((item) => item.code === code)?.status !==
        ApplicationNodeStatus.COMPLETED,
    );
    const missingRequirementCodes = node.requiredRequirementCodes.filter((code) => {
      const requirement = requirements.find((item) => item.code === code);
      return !requirement || requirement.status !== RequirementStatus.SATISFIED;
    });
    const missingMaterialCodes = node.requiredMaterialCodes.filter((code) => {
      const material = materials.find((item) => item.code === code);
      return !material || material.versions.length === 0;
    });
    if (
      missingPrerequisiteCodes.length ||
      missingRequirementCodes.length ||
      missingMaterialCodes.length
    ) {
      throw new AppError({
        code: ErrorCodes.APPLICATION_NODE_COMPLETION_BLOCKED,
        message: 'Application node prerequisites are incomplete',
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        details: { missingPrerequisiteCodes, missingRequirementCodes, missingMaterialCodes },
      });
    }
  }

  private async assertCaseWritable(tx: DatabaseClient, caseId: string) {
    const applicationCase = await tx.applicationCase.findFirst({ where: { id: caseId } });
    if (!applicationCase)
      throw this.notFound(ErrorCodes.APPLICATION_CASE_NOT_FOUND, 'Application case not found');
    if (applicationCase.archivedAt) {
      throw new AppError({
        code: ErrorCodes.APPLICATION_CASE_ARCHIVED,
        message: 'Application case is archived',
        statusCode: HttpStatus.CONFLICT,
      });
    }
    return applicationCase;
  }

  private async assertActiveProject(tx: DatabaseClient, projectId: string) {
    const project = await tx.project.findFirst({
      where: { id: projectId, archivedAt: null },
      select: { id: true },
    });
    if (!project)
      throw this.notFound(
        ErrorCodes.APPLICATION_PROJECT_NOT_FOUND,
        'Application project not found',
      );
  }

  private async assertCaseNode(tx: DatabaseClient, caseId: string, nodeId: string) {
    const node = await tx.applicationNode.findFirst({
      where: { id: nodeId, applicationCaseId: caseId },
      select: { id: true },
    });
    if (!node)
      throw this.notFound(ErrorCodes.APPLICATION_NODE_NOT_FOUND, 'Application node not found');
  }

  private async assertEvidenceLinks(
    tx: DatabaseClient,
    caseId: string,
    requirementIds: string[],
    materialIds: string[],
  ) {
    const [requirements, materials] = await Promise.all([
      requirementIds.length
        ? tx.applicationRequirement.count({
            where: { id: { in: requirementIds }, applicationCaseId: caseId },
          })
        : 0,
      materialIds.length
        ? tx.applicationMaterial.count({
            where: { id: { in: materialIds }, applicationCaseId: caseId },
          })
        : 0,
    ]);
    if (requirements !== requirementIds.length || materials !== materialIds.length) {
      throw new AppError({
        code: ErrorCodes.APPLICATION_CASE_NOT_FOUND,
        message: 'Evidence links must belong to the application case',
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
  }

  private async assertSubmission(tx: DatabaseClient, caseId: string, submissionId: string) {
    const submission = await tx.submissionRecord.findFirst({
      where: { id: submissionId, applicationCaseId: caseId },
      select: { id: true },
    });
    if (!submission)
      throw this.notFound(
        ErrorCodes.APPLICATION_SUBMISSION_NOT_FOUND,
        'Application submission not found',
      );
  }

  private async assertMaterialVersions(
    tx: DatabaseClient,
    caseId: string,
    materialVersionIds: string[],
  ) {
    if (!materialVersionIds.length) return;
    const count = await tx.materialVersion.count({
      where: { id: { in: materialVersionIds }, applicationMaterial: { applicationCaseId: caseId } },
    });
    if (count !== materialVersionIds.length) {
      throw new AppError({
        code: ErrorCodes.APPLICATION_MATERIAL_VERSION_NOT_FOUND,
        message: 'Material version not found in application case',
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
  }

  private assertTemplateNodes(nodes: WorkflowTemplateNodeDto[]) {
    const codeSet = new Set(nodes.map((node) => node.code));
    if (
      codeSet.size !== nodes.length ||
      nodes.some(
        (node) =>
          new Set(node.prerequisiteNodeCodes ?? []).size !==
            (node.prerequisiteNodeCodes ?? []).length ||
          (node.prerequisiteNodeCodes ?? []).some(
            (code) => code === node.code || !codeSet.has(code),
          ),
      )
    ) {
      throw new AppError({
        code: ErrorCodes.APPLICATION_TEMPLATE_INVALID,
        message: 'Workflow template nodes contain invalid codes or prerequisites',
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
  }

  private toTemplateNodeData(node: WorkflowTemplateNodeDto) {
    return {
      code: node.code,
      title: node.title,
      ...(node.description !== undefined ? { description: node.description } : {}),
      sequence: node.sequence,
      ...(node.prerequisiteNodeCodes !== undefined
        ? { prerequisiteNodeCodes: node.prerequisiteNodeCodes }
        : {}),
      ...(node.requiredRequirementCodes !== undefined
        ? { requiredRequirementCodes: node.requiredRequirementCodes }
        : {}),
      ...(node.requiredMaterialCodes !== undefined
        ? { requiredMaterialCodes: node.requiredMaterialCodes }
        : {}),
      ...(node.isRequired !== undefined ? { isRequired: node.isRequired } : {}),
    };
  }

  private toCaseUpdateData(dto: UpdateApplicationCaseDto) {
    return {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.subjectName !== undefined ? { subjectName: dto.subjectName } : {}),
      ...(dto.region !== undefined ? { region: dto.region } : {}),
      ...(dto.organization !== undefined ? { organization: dto.organization } : {}),
      ...(dto.batch !== undefined ? { batch: dto.batch } : {}),
      ...(dto.deadlineAt !== undefined ? { deadlineAt: new Date(dto.deadlineAt) } : {}),
      ...(dto.collaboratorNames !== undefined ? { collaboratorNames: dto.collaboratorNames } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };
  }

  private pagination(query: { page?: number; pageSize?: number }) {
    const page = query.page && query.page > 0 ? query.page : DEFAULT_PAGE;
    const pageSize =
      query.pageSize && query.pageSize > 0
        ? Math.min(query.pageSize, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;
    return { page, pageSize };
  }

  private throwIfDuplicateCode(error: unknown): never | void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError({
        code: ErrorCodes.APPLICATION_CASE_CODE_EXISTS,
        message: 'Application case code already exists',
        statusCode: HttpStatus.CONFLICT,
      });
    }
  }

  private notFound(code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string) {
    return new AppError({ code, message, statusCode: HttpStatus.NOT_FOUND });
  }
}
