import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, RiskStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { ProjectHealthSnapshotService } from '../../projects/application/project-health-snapshot.service';
import { CreateRiskDto, ListRisksQueryDto, UpdateRiskDto } from '../interface/http/dto/management.dto';
import { ManagementReferenceService } from './management-reference.service';

@Injectable()
export class RisksService {
  constructor(private readonly prisma: PlatformPrismaService, private readonly references: ManagementReferenceService, private readonly health: ProjectHealthSnapshotService) {}
  async list(query: ListRisksQueryDto) {
    const page = query.page ?? 1; const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Prisma.RiskWhereInput = { archivedAt: null, ...(query.projectId ? { projectId: query.projectId } : {}), ...(query.status ? { status: query.status } : {}), ...(query.level ? { level: query.level } : {}) };
    const [data, total] = await this.prisma.$transaction([this.prisma.risk.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }), this.prisma.risk.count({ where })]);
    return { data, meta: { page, pageSize, total } };
  }
  async get(id: string) { const entity = await this.prisma.risk.findFirst({ where: { id, archivedAt: null } }); if (!entity) throw this.notFound(); return entity; }
  async create(dto: CreateRiskDto) { return this.prisma.$transaction((tx) => this.createRiskInTransaction(tx, dto)); }
  async createRiskInTransaction(tx: Prisma.TransactionClient, dto: CreateRiskDto) {
    await this.references.assertReference(tx, dto);
    const entity = await tx.risk.create({ data: { ...this.fields(dto), status: dto.status ?? RiskStatus.OPEN, closedAt: dto.status === RiskStatus.CLOSED ? new Date() : null } as Prisma.RiskUncheckedCreateInput });
    if (entity.projectId) await this.health.recalculate(tx, entity.projectId); return entity;
  }
  async update(id: string, dto: UpdateRiskDto) { return this.prisma.$transaction(async (tx) => { const old = await tx.risk.findFirst({ where: { id, archivedAt: null } }); if (!old) throw this.notFound(); const refs = { projectId: dto.projectId ?? old.projectId ?? undefined, milestoneId: dto.milestoneId ?? old.milestoneId ?? undefined, taskId: dto.taskId ?? old.taskId ?? undefined }; await this.references.assertReference(tx, refs); const status = dto.status ?? old.status; const entity = await tx.risk.update({ where: { id }, data: { ...this.fields(dto), ...refs, status, closedAt: status === RiskStatus.CLOSED ? (old.closedAt ?? new Date()) : null } }); for (const projectId of new Set([old.projectId, entity.projectId].filter(Boolean) as string[])) await this.health.recalculate(tx, projectId); return entity; }); }
  async archive(id: string) { await this.prisma.$transaction(async (tx) => { const entity = await tx.risk.findFirst({ where: { id, archivedAt: null } }); if (!entity) throw this.notFound(); await tx.risk.update({ where: { id }, data: { archivedAt: new Date() } }); if (entity.projectId) await this.health.recalculate(tx, entity.projectId); }); }
  private fields(dto: Partial<CreateRiskDto>) { return { ...(dto.title !== undefined ? { title: dto.title } : {}), ...(dto.description !== undefined ? { description: dto.description } : {}), ...(dto.likelihood !== undefined ? { likelihood: dto.likelihood } : {}), ...(dto.impact !== undefined ? { impact: dto.impact } : {}), ...(dto.level !== undefined ? { level: dto.level } : {}), ...(dto.mitigation !== undefined ? { mitigation: dto.mitigation } : {}), ...(dto.ownerName !== undefined ? { ownerName: dto.ownerName } : {}), ...(dto.projectId !== undefined ? { projectId: dto.projectId } : {}), ...(dto.milestoneId !== undefined ? { milestoneId: dto.milestoneId } : {}), ...(dto.taskId !== undefined ? { taskId: dto.taskId } : {}) }; }
  private notFound() { return new AppError({ code: ErrorCodes.RISK_NOT_FOUND, message: 'Risk not found', statusCode: HttpStatus.NOT_FOUND }); }
}
