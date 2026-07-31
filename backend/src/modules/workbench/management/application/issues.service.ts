import { HttpStatus, Injectable } from '@nestjs/common';
import { IssueStatus, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { CreateIssueDto, ListIssuesQueryDto, UpdateIssueDto } from '../interface/http/dto/management.dto';
import { ManagementReferenceService } from './management-reference.service';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { DataScopeService } from '../../../iam/application/data-scope.service';

@Injectable()
export class IssuesService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly references: ManagementReferenceService,
    private readonly requestContext: RequestContextService,
    private readonly dataScope: DataScopeService,
  ) {}
  async list(query: ListIssuesQueryDto) { const page = query.page ?? 1; const pageSize = Math.min(query.pageSize ?? 20, 100); const principal = this.requestContext.requirePrincipal(); const where: Prisma.IssueWhereInput = { AND: [{ archivedAt: null, ...(query.projectId ? { projectId: query.projectId } : {}), ...(query.status ? { status: query.status } : {}), ...(query.overdue ? { dueAt: { lt: new Date() }, status: { notIn: [IssueStatus.CLOSED, IssueStatus.RESOLVED] } } : {}) }, this.dataScope.issues(principal)] }; const [data, total] = await this.prisma.$transaction([this.prisma.issue.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip: (page-1)*pageSize, take: pageSize }), this.prisma.issue.count({ where })]); return { data, meta: { page, pageSize, total } }; }
  async get(id: string) { const principal = this.requestContext.requirePrincipal(); const entity = await this.prisma.issue.findFirst({ where: { AND: [{ id, archivedAt: null }, this.dataScope.issues(principal)] } }); if (!entity) throw this.notFound(); return entity; }
  async create(dto: CreateIssueDto) { const principal = this.requestContext.requirePrincipal(); return this.prisma.$transaction(async (tx) => { await this.references.assertReference(tx, dto); this.assertClose(dto.status, dto.verificationResult); return tx.issue.create({ data: { ...this.fields(dto), status: dto.status ?? IssueStatus.OPEN, closedAt: dto.status === IssueStatus.CLOSED ? new Date() : null, createdByUserId: principal.userId, updatedByUserId: principal.userId, ownerUserId: principal.userId } as Prisma.IssueUncheckedCreateInput }); }); }
  async update(id: string, dto: UpdateIssueDto) { const principal = this.requestContext.requirePrincipal(); return this.prisma.$transaction(async (tx) => { const old = await tx.issue.findFirst({ where: { id, archivedAt: null } }); if (!old) throw this.notFound(); const refs = { projectId: dto.projectId ?? old.projectId ?? undefined, milestoneId: dto.milestoneId ?? old.milestoneId ?? undefined, taskId: dto.taskId ?? old.taskId ?? undefined }; await this.references.assertReference(tx, refs); const status = dto.status ?? old.status; const verificationResult = dto.verificationResult ?? old.verificationResult; this.assertClose(status, verificationResult); return tx.issue.update({ where: { id }, data: { ...this.fields(dto), ...refs, status, verificationResult, closedAt: status === IssueStatus.CLOSED ? (old.closedAt ?? new Date()) : null, updatedByUserId: principal.userId } }); }); }
  async archive(id: string) { const result = await this.prisma.issue.updateMany({ where: { id, archivedAt: null }, data: { archivedAt: new Date() } }); if (!result.count) throw this.notFound(); }
  private assertClose(status?: IssueStatus, verificationResult?: string | null) { if (status === IssueStatus.CLOSED && !verificationResult?.trim()) throw new AppError({ code: ErrorCodes.MANAGEMENT_REFERENCE_INVALID, message: 'Closing an issue requires verificationResult', statusCode: HttpStatus.UNPROCESSABLE_ENTITY }); }
  private fields(dto: Partial<CreateIssueDto>) { return { ...(dto.title !== undefined ? { title: dto.title } : {}), ...(dto.description !== undefined ? { description: dto.description } : {}), ...(dto.impactObject !== undefined ? { impactObject: dto.impactObject } : {}), ...(dto.proposedResolution !== undefined ? { proposedResolution: dto.proposedResolution } : {}), ...(dto.ownerName !== undefined ? { ownerName: dto.ownerName } : {}), ...(dto.dueAt !== undefined ? { dueAt: new Date(dto.dueAt) } : {}), ...(dto.verificationResult !== undefined ? { verificationResult: dto.verificationResult } : {}), ...(dto.projectId !== undefined ? { projectId: dto.projectId } : {}), ...(dto.milestoneId !== undefined ? { milestoneId: dto.milestoneId } : {}), ...(dto.taskId !== undefined ? { taskId: dto.taskId } : {}) }; }
  private notFound() { return new AppError({ code: ErrorCodes.ISSUE_NOT_FOUND, message: 'Issue not found', statusCode: HttpStatus.NOT_FOUND }); }
}
