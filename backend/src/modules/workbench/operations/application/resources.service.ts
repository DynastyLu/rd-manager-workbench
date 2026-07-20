import { HttpStatus, Injectable } from '@nestjs/common';
import { LoadEntryKind, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { CreateResourceDto, CreateResourceLoadDto, CreateResourceSkillDto, ListResourcesQueryDto, LoadSummaryQueryDto, UpdateResourceDto, UpdateResourceLoadDto, UpdateResourceSkillDto } from '../interface/http/dto/resources.dto';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_WEEKS = 13;

@Injectable()
export class ResourcesService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  async list(query: ListResourcesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Prisma.ResourceProfileWhereInput = {
      archivedAt: null,
      ...(query.q ? { OR: [{ displayName: { contains: query.q, mode: 'insensitive' } }, { roleTitle: { contains: query.q, mode: 'insensitive' } }] } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.resourceProfile.findMany({ where, include: { skills: { orderBy: { name: 'asc' } } }, orderBy: [{ displayName: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.resourceProfile.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async get(id: string) {
    const resource = await this.prisma.resourceProfile.findFirst({ where: { id, archivedAt: null }, include: { skills: { orderBy: { name: 'asc' } }, loadEntries: { where: { archivedAt: null }, orderBy: { weekStartAt: 'desc' } } } });
    if (!resource) throw this.notFound(ErrorCodes.RESOURCE_NOT_FOUND, 'Resource not found');
    return resource;
  }

  async create(dto: CreateResourceDto) {
    try { return await this.prisma.resourceProfile.create({ data: dto }); }
    catch (error) { this.throwDuplicate(error); throw error; }
  }

  async update(id: string, dto: UpdateResourceDto) {
    await this.get(id);
    try { return await this.prisma.resourceProfile.update({ where: { id }, data: dto }); }
    catch (error) { this.throwDuplicate(error); throw error; }
  }

  async archive(id: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockActiveResource(tx, id, true);
      const active = await tx.resourceLoadEntry.count({ where: { resourceId: id, archivedAt: null } });
      if (active) throw this.invalidReference('Archive load entries before archiving resource');
      await tx.resourceProfile.update({ where: { id }, data: { archivedAt: new Date() } });
    });
  }

  async createSkill(resourceId: string, dto: CreateResourceSkillDto) {
    await this.assertResource(resourceId);
    return this.prisma.resourceSkill.upsert({
      where: { resourceId_name: { resourceId, name: dto.name } },
      create: {
        resourceId,
        name: dto.name,
        level: dto.level,
        evidence: dto.evidence,
        assessedAt: dto.assessedAt ? new Date(dto.assessedAt) : undefined,
      },
      update: this.skillData(dto),
    });
  }

  async updateSkill(resourceId: string, id: string, dto: UpdateResourceSkillDto) {
    await this.assertResource(resourceId);
    const result = await this.prisma.resourceSkill.updateMany({ where: { id, resourceId }, data: this.skillData(dto) });
    if (!result.count) throw this.notFound(ErrorCodes.RESOURCE_SKILL_NOT_FOUND, 'Skill not found');
    return this.prisma.resourceSkill.findUniqueOrThrow({ where: { id } });
  }

  async deleteSkill(resourceId: string, id: string) {
    await this.assertResource(resourceId);
    const result = await this.prisma.resourceSkill.deleteMany({ where: { id, resourceId } });
    if (!result.count) throw this.notFound(ErrorCodes.RESOURCE_SKILL_NOT_FOUND, 'Skill not found');
  }

  async createLoadEntry(resourceId: string, dto: CreateResourceLoadDto) {
    const weekStartAt = this.utcMonday(dto.weekStartAt);
    this.assertReferenceShape(dto.kind, dto);
    return this.prisma.$transaction(async (tx) => {
      await this.lockActiveResource(tx, resourceId);
      await this.lockActiveReference(tx, dto.kind, dto);
      return tx.resourceLoadEntry.create({ data: { resourceId, ...this.loadData(dto, weekStartAt) } });
    });
  }

  async updateLoadEntry(resourceId: string, id: string, dto: UpdateResourceLoadDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockActiveResource(tx, resourceId);
      const current = await tx.resourceLoadEntry.findFirst({ where: { id, resourceId, archivedAt: null } });
      if (!current) throw this.notFound(ErrorCodes.RESOURCE_LOAD_ENTRY_NOT_FOUND, 'Load entry not found');
      const merged: CreateResourceLoadDto = {
        weekStartAt: dto.weekStartAt ?? current.weekStartAt.toISOString().slice(0, 10),
        kind: dto.kind ?? current.kind,
        nonProjectRdItemId: dto.nonProjectRdItemId !== undefined ? dto.nonProjectRdItemId ?? undefined : current.nonProjectRdItemId ?? undefined,
        projectId: dto.projectId !== undefined ? dto.projectId ?? undefined : current.projectId ?? undefined,
        taskId: dto.taskId !== undefined ? dto.taskId ?? undefined : current.taskId ?? undefined,
        plannedHours: dto.plannedHours ?? Number(current.plannedHours),
        note: dto.note !== undefined ? dto.note ?? undefined : current.note ?? undefined,
      };
      const weekStartAt = this.utcMonday(merged.weekStartAt);
      this.assertReferenceShape(merged.kind, merged);
      await this.lockActiveReference(tx, merged.kind, merged);
      return tx.resourceLoadEntry.update({ where: { id }, data: this.loadData(merged, weekStartAt) });
    });
  }

  async archiveLoadEntry(resourceId: string, id: string) {
    await this.assertResource(resourceId);
    const result = await this.prisma.resourceLoadEntry.updateMany({ where: { id, resourceId, archivedAt: null }, data: { archivedAt: new Date() } });
    if (!result.count) throw this.notFound(ErrorCodes.RESOURCE_LOAD_ENTRY_NOT_FOUND, 'Load entry not found');
  }

  async loadSummary(query: LoadSummaryQueryDto) {
    const from = this.utcMonday(query.fromWeek);
    const to = this.utcMonday(query.toWeek);
    const weekCount = Math.floor((to.getTime() - from.getTime()) / WEEK_MS) + 1;
    if (weekCount < 1 || weekCount > MAX_WEEKS) throw new AppError({ code: ErrorCodes.RESOURCE_LOAD_RANGE_INVALID, message: 'Resource load range must contain between 1 and 13 weeks', statusCode: HttpStatus.UNPROCESSABLE_ENTITY });
    const resources = await this.prisma.resourceProfile.findMany({ where: { archivedAt: null }, orderBy: [{ displayName: 'asc' }, { id: 'asc' }], include: { loadEntries: { where: { archivedAt: null, weekStartAt: { gte: from, lte: to } }, orderBy: [{ weekStartAt: 'asc' }, { id: 'asc' }] } } });
    const weeks = Array.from({ length: weekCount }, (_, index) => new Date(from.getTime() + index * WEEK_MS));
    return resources.map(({ loadEntries, ...resource }) => ({
      ...resource,
      weeks: weeks.map((week) => {
        const entries = loadEntries.filter((entry) => entry.weekStartAt.getTime() === week.getTime());
        const byKind: Partial<Record<LoadEntryKind, number>> = {};
        for (const entry of entries) byKind[entry.kind] = (byKind[entry.kind] ?? 0) + Number(entry.plannedHours);
        const plannedHours = Number(entries.reduce((sum, entry) => sum + Number(entry.plannedHours), 0).toFixed(2));
        const capacityHours = resource.weeklyCapacityHours;
        const percent = capacityHours ? Number(((plannedHours / capacityHours) * 100).toFixed(2)) : plannedHours > 0 ? null : 0;
        return { weekStartAt: week.toISOString().slice(0, 10), plannedHours, capacityHours, percent, overloaded: plannedHours > capacityHours, byKind, entries: entries.map((entry) => ({ ...entry, plannedHours: Number(entry.plannedHours) })) };
      }),
    }));
  }

  private skillData(dto: CreateResourceSkillDto | UpdateResourceSkillDto) {
    return { ...(dto.name !== undefined ? { name: dto.name } : {}), ...(dto.level !== undefined ? { level: dto.level } : {}), ...(dto.evidence !== undefined ? { evidence: dto.evidence } : {}), ...(dto.assessedAt !== undefined ? { assessedAt: dto.assessedAt === null ? null : new Date(dto.assessedAt) } : {}) };
  }

  private loadData(dto: CreateResourceLoadDto, weekStartAt: Date) {
    return { weekStartAt, kind: dto.kind, nonProjectRdItemId: dto.nonProjectRdItemId ?? null, projectId: dto.projectId ?? null, taskId: dto.taskId ?? null, plannedHours: dto.plannedHours, note: dto.note ?? null };
  }

  private utcMonday(value: string) {
    const source = value.slice(0, 10);
    const date = new Date(`${source}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.getUTCDay() !== 1 || source !== date.toISOString().slice(0, 10)) throw this.invalidReference('weekStartAt must be a valid Monday in UTC');
    return date;
  }

  private assertReferenceShape(kind: LoadEntryKind, dto: { nonProjectRdItemId?: string; projectId?: string; taskId?: string }) {
    const references = [dto.nonProjectRdItemId, dto.projectId, dto.taskId].filter(Boolean);
    if ((kind === LoadEntryKind.OTHER && references.length) || (kind !== LoadEntryKind.OTHER && references.length !== 1)) throw this.invalidReference('Load entry reference does not match its kind');
  }

  private async lockActiveResource(client: Prisma.TransactionClient, id: string, forUpdate = false) {
    const rows = await client.$queryRaw<Array<{ id: string }>>(forUpdate
      ? Prisma.sql`SELECT id FROM app.resource_profiles WHERE id = ${id} AND archived_at IS NULL FOR UPDATE`
      : Prisma.sql`SELECT id FROM app.resource_profiles WHERE id = ${id} AND archived_at IS NULL FOR KEY SHARE`);
    if (!rows.length) throw this.notFound(ErrorCodes.RESOURCE_NOT_FOUND, 'Resource not found');
  }

  private async lockActiveReference(client: Prisma.TransactionClient, kind: LoadEntryKind, dto: { nonProjectRdItemId?: string; projectId?: string; taskId?: string }) {
    if (kind === LoadEntryKind.OTHER) return;
    const rows = kind === LoadEntryKind.NON_PROJECT_RD
      ? await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM app.non_project_rd_items WHERE id = ${dto.nonProjectRdItemId} AND archived_at IS NULL FOR KEY SHARE`)
      : kind === LoadEntryKind.PROJECT
        ? await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM app.projects WHERE id = ${dto.projectId} AND archived_at IS NULL FOR KEY SHARE`)
        : await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM app.tasks WHERE id = ${dto.taskId} AND archived_at IS NULL FOR KEY SHARE`);
    if (!rows.length) throw this.invalidReference('Load entry reference is missing, archived or mismatched');
  }

  private async assertResource(id: string) {
    const resource = await this.prisma.resourceProfile.findFirst({ where: { id, archivedAt: null }, select: { id: true } });
    if (!resource) throw this.notFound(ErrorCodes.RESOURCE_NOT_FOUND, 'Resource not found');
  }
  private throwDuplicate(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError({ code: ErrorCodes.RESOURCE_NAME_EXISTS, message: 'Resource name already exists', statusCode: HttpStatus.CONFLICT });
  }
  private invalidReference(message: string) { return new AppError({ code: ErrorCodes.RESOURCE_LOAD_REFERENCE_INVALID, message, statusCode: HttpStatus.UNPROCESSABLE_ENTITY }); }
  private notFound(code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string) { return new AppError({ code, message, statusCode: HttpStatus.NOT_FOUND }); }
}
