import { HttpStatus, Injectable } from '@nestjs/common';
import { AgreementStatus, FileAssetStatus, Prisma, ProjectStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { TasksService } from '../../tasks/application/tasks.service';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { DataScopeService } from '../../../iam/application/data-scope.service';
import {
  CreateCommunicationDto,
  CreatePartnerAgreementDto,
  CreatePartnerContactDto,
  CreatePartnerDto,
  CreatePartnerProjectDto,
  CreateSourceTaskDto,
  ListCommunicationsQueryDto,
  ListPartnersQueryDto,
  UpdateCommunicationDto,
  UpdatePartnerAgreementDto,
  UpdatePartnerContactDto,
  UpdatePartnerDto,
} from '../interface/http/dto/management.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const PARTNER_LIST_INCLUDE = {
  _count: {
    select: {
      contacts: { where: { archivedAt: null } },
      agreements: { where: { archivedAt: null, status: AgreementStatus.ACTIVE } },
      projects: true,
      fileAssets: { where: { status: FileAssetStatus.ACTIVE } },
    },
  },
} satisfies Prisma.PartnerInclude;

type PartnerListEntity = Prisma.PartnerGetPayload<{ include: typeof PARTNER_LIST_INCLUDE }>;

@Injectable()
export class PartnersService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly tasks: TasksService,
    private readonly requestContext: RequestContextService,
    private readonly dataScope: DataScopeService,
  ) {}

  async list(query: ListPartnersQueryDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const principal = this.requestContext.requirePrincipal();
    const followUpRange: Prisma.DateTimeNullableFilter = {
      ...(query.nextFollowUpFrom ? { gte: new Date(query.nextFollowUpFrom) } : {}),
      ...(query.nextFollowUpBefore ? { lte: new Date(query.nextFollowUpBefore) } : {}),
    };
    const hasFollowUpRange = Boolean(query.nextFollowUpFrom || query.nextFollowUpBefore);
    const where: Prisma.PartnerWhereInput = {
      AND: [
        {
          archivedAt: null,
          ...(query.q
            ? {
                OR: [
                  { name: { contains: query.q, mode: Prisma.QueryMode.insensitive } },
                  { shortName: { contains: query.q, mode: Prisma.QueryMode.insensitive } },
                  { category: { contains: query.q, mode: Prisma.QueryMode.insensitive } },
                ],
              }
            : {}),
          ...(query.projectId ? { projects: { some: { projectId: query.projectId } } } : {}),
          ...(hasFollowUpRange
            ? {
                communications: {
                  some: {
                    archivedAt: null,
                    nextFollowUpAt: followUpRange,
                  },
                },
              }
            : {}),
        },
        this.dataScope.partners(principal),
      ],
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.partner.findMany({
        where,
        include: PARTNER_LIST_INCLUDE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.partner.count({ where }),
    ]);
    const partnerIds = data.map(({ id }) => id);
    const [lastCommunications, nextFollowUps] = partnerIds.length
      ? await Promise.all([
          this.prisma.communicationRecord.groupBy({
            by: ['partnerId'],
            where: { partnerId: { in: partnerIds }, archivedAt: null },
            _max: { occurredAt: true },
          }),
          this.prisma.communicationRecord.groupBy({
            by: ['partnerId'],
            where: {
              partnerId: { in: partnerIds },
              archivedAt: null,
              nextFollowUpAt: hasFollowUpRange ? followUpRange : { not: null },
            },
            _min: { nextFollowUpAt: true },
          }),
        ])
      : [[], []];
    const lastCommunicationByPartner = new Map(
      lastCommunications.map((item) => [item.partnerId, item._max.occurredAt]),
    );
    const nextFollowUpByPartner = new Map(
      nextFollowUps.map((item) => [item.partnerId, item._min.nextFollowUpAt]),
    );
    return {
      data: data.map((partner) =>
        this.toPartnerListItem(
          partner,
          lastCommunicationByPartner.get(partner.id) ?? null,
          nextFollowUpByPartner.get(partner.id) ?? null,
        ),
      ),
      meta: { page, pageSize, total },
    };
  }

  async get(id: string) {
    const principal = this.requestContext.requirePrincipal();
    const entity = await this.prisma.partner.findFirst({
      where: { AND: [{ id, archivedAt: null }, this.dataScope.partners(principal)] },
      include: {
        contacts: { where: { archivedAt: null }, orderBy: { updatedAt: 'desc' as const } },
        agreements: { where: { archivedAt: null }, orderBy: { updatedAt: 'desc' as const } },
        communications: {
          where: { AND: [{ archivedAt: null }, this.dataScope.communications(principal)] },
          orderBy: { occurredAt: 'desc' as const },
          include: { contact: true, project: true, task: true },
        },
        projects: {
          orderBy: { createdAt: 'desc' as const },
          include: { project: true },
        },
        _count: {
          select: { fileAssets: { where: { status: FileAssetStatus.ACTIVE } } },
        },
      },
    });
    if (!entity) throw this.notFound(ErrorCodes.PARTNER_NOT_FOUND, 'Partner not found');
    const { _count, ...fields } = entity;
    return { ...fields, fileCount: _count.fileAssets };
  }

  async create(dto: CreatePartnerDto) {
    const partner = await this.prisma.$transaction(async (tx) => {
      await this.assertActiveProjects(tx, dto.projectIds ?? []);
      return tx.partner.create({
        data: {
          ...this.partnerCreateFields(dto),
          ...(dto.projectIds?.length
            ? { projects: { create: dto.projectIds.map((projectId) => ({ projectId })) } }
            : {}),
        },
      });
    });
    return this.get(partner.id);
  }

  async update(id: string, dto: UpdatePartnerDto) {
    await this.prisma.$transaction(async (tx) => {
      await this.acquirePartnerLock(tx, id);
      await this.assertActivePartner(tx, id);
      if (dto.projectIds !== undefined) await this.assertActiveProjects(tx, dto.projectIds);
      await tx.partner.update({
        where: { id },
        data: this.partnerUpdateFields(dto),
      });
      if (dto.projectIds !== undefined) {
        await this.syncPartnerProjects(tx, id, dto.projectIds);
      }
    });
    return this.get(id);
  }

  async archive(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.acquirePartnerLock(tx, id);
      await this.assertActivePartner(tx, id);
      const [contacts, agreements, communications, projects, files] = await Promise.all([
        tx.partnerContact.count({ where: { partnerId: id, archivedAt: null } }),
        tx.partnerAgreement.count({ where: { partnerId: id, archivedAt: null } }),
        tx.communicationRecord.count({ where: { partnerId: id, archivedAt: null } }),
        tx.partnerProject.count({ where: { partnerId: id } }),
        tx.fileAsset.count({ where: { partnerId: id, status: FileAssetStatus.ACTIVE } }),
      ]);
      if (contacts + agreements + communications + projects + files > 0) {
        throw new AppError({
          code: ErrorCodes.PARTNER_HAS_ACTIVE_RECORDS,
          message: 'Partner has active related records',
          statusCode: HttpStatus.CONFLICT,
          details: { contacts, agreements, communications, projects, files },
        });
      }
      await tx.partner.update({ where: { id }, data: { archivedAt: new Date() } });
    });
  }

  async linkProject(partnerId: string, projectId: string, dto: CreatePartnerProjectDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.acquirePartnerLock(tx, partnerId);
        await this.assertActivePartner(tx, partnerId);
        await this.assertActiveProject(tx, projectId);
        const existing = await tx.partnerProject.findUnique({
          where: { partnerId_projectId: { partnerId, projectId } },
        });
        if (existing) {
          throw new AppError({
            code: ErrorCodes.PARTNER_PROJECT_EXISTS,
            message: 'Partner project link already exists',
            statusCode: HttpStatus.CONFLICT,
          });
        }
        return tx.partnerProject.create({ data: { partnerId, projectId, ...dto } });
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError({
          code: ErrorCodes.PARTNER_PROJECT_EXISTS,
          message: 'Partner project link already exists',
          statusCode: HttpStatus.CONFLICT,
        });
      }
      throw error;
    }
  }

  async unlinkProject(partnerId: string, projectId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.acquirePartnerLock(tx, partnerId);
      await this.assertActivePartner(tx, partnerId);
      const link = await tx.partnerProject.findUnique({
        where: { partnerId_projectId: { partnerId, projectId } },
      });
      if (!link) {
        throw this.notFound(ErrorCodes.PARTNER_PROJECT_NOT_FOUND, 'Partner project link not found');
      }
      const communications = await tx.communicationRecord.count({
        where: { partnerId, projectId, archivedAt: null },
      });
      if (communications > 0) {
        throw new AppError({
          code: ErrorCodes.PARTNER_HAS_ACTIVE_RECORDS,
          message: 'Partner project link is used by active communications',
          statusCode: HttpStatus.CONFLICT,
          details: { communications },
        });
      }
      await tx.partnerProject.delete({
        where: { partnerId_projectId: { partnerId, projectId } },
      });
    });
  }

  async createContact(partnerId: string, dto: CreatePartnerContactDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquirePartnerLock(tx, partnerId);
      await this.assertActivePartner(tx, partnerId);
      return tx.partnerContact.create({ data: { partnerId, ...dto } });
    });
  }

  async updateContact(partnerId: string, id: string, dto: UpdatePartnerContactDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquirePartnerLock(tx, partnerId);
      await this.assertActivePartner(tx, partnerId);
      const existing = await tx.partnerContact.findFirst({
        where: { id, partnerId, archivedAt: null },
      });
      if (!existing) {
        throw this.notFound(ErrorCodes.PARTNER_CONTACT_NOT_FOUND, 'Partner contact not found');
      }
      return tx.partnerContact.update({ where: { id }, data: dto });
    });
  }

  async archiveContact(partnerId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.acquirePartnerLock(tx, partnerId);
      await this.assertActivePartner(tx, partnerId);
      const result = await tx.partnerContact.updateMany({
        where: { id, partnerId, archivedAt: null },
        data: { archivedAt: new Date() },
      });
      if (!result.count) {
        throw this.notFound(ErrorCodes.PARTNER_CONTACT_NOT_FOUND, 'Partner contact not found');
      }
    });
  }

  async createAgreement(partnerId: string, dto: CreatePartnerAgreementDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquirePartnerLock(tx, partnerId);
      await this.assertActivePartner(tx, partnerId);
      return tx.partnerAgreement.create({
        data: {
          partnerId,
          ...dto,
          ...(dto.startAt !== undefined ? { startAt: new Date(dto.startAt) } : {}),
          ...(dto.endAt !== undefined ? { endAt: new Date(dto.endAt) } : {}),
        },
      });
    });
  }

  async updateAgreement(partnerId: string, id: string, dto: UpdatePartnerAgreementDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquirePartnerLock(tx, partnerId);
      await this.assertActivePartner(tx, partnerId);
      const existing = await tx.partnerAgreement.findFirst({
        where: { id, partnerId, archivedAt: null },
      });
      if (!existing) {
        throw this.notFound(ErrorCodes.PARTNER_AGREEMENT_NOT_FOUND, 'Partner agreement not found');
      }
      return tx.partnerAgreement.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.startAt !== undefined
            ? { startAt: dto.startAt === null ? null : new Date(dto.startAt) }
            : {}),
          ...(dto.endAt !== undefined
            ? { endAt: dto.endAt === null ? null : new Date(dto.endAt) }
            : {}),
        },
      });
    });
  }

  async archiveAgreement(partnerId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.acquirePartnerLock(tx, partnerId);
      await this.assertActivePartner(tx, partnerId);
      const result = await tx.partnerAgreement.updateMany({
        where: { id, partnerId, archivedAt: null },
        data: { archivedAt: new Date() },
      });
      if (!result.count) {
        throw this.notFound(ErrorCodes.PARTNER_AGREEMENT_NOT_FOUND, 'Partner agreement not found');
      }
    });
  }

  async listCommunications(partnerId: string, query: ListCommunicationsQueryDto) {
    await this.assertActivePartner(this.prisma, partnerId);
    const principal = this.requestContext.requirePrincipal();
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where: Prisma.CommunicationRecordWhereInput = {
      AND: [
        {
          partnerId,
          archivedAt: null,
          ...(query.nextFollowUpBefore
            ? { nextFollowUpAt: { lte: new Date(query.nextFollowUpBefore) } }
            : {}),
        },
        this.dataScope.communications(principal),
      ],
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.communicationRecord.findMany({
        where,
        include: { contact: true, project: true, task: true },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.communicationRecord.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async createCommunication(partnerId: string, dto: CreateCommunicationDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquirePartnerLock(tx, partnerId);
      await this.assertActivePartner(tx, partnerId);
      await this.assertCommunicationReferences(tx, partnerId, dto.contactId, dto.projectId);
      return tx.communicationRecord.create({
        data: {
          partnerId,
          ...dto,
          occurredAt: new Date(dto.occurredAt),
          ...(dto.nextFollowUpAt !== undefined
            ? { nextFollowUpAt: new Date(dto.nextFollowUpAt) }
            : {}),
        },
      });
    });
  }

  async updateCommunication(partnerId: string, id: string, dto: UpdateCommunicationDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquirePartnerLock(tx, partnerId);
      await this.assertActivePartner(tx, partnerId);
      const existing = await tx.communicationRecord.findFirst({
        where: { id, partnerId, archivedAt: null },
      });
      if (!existing) {
        throw this.notFound(ErrorCodes.COMMUNICATION_NOT_FOUND, 'Communication not found');
      }
      const contactId = dto.contactId !== undefined ? dto.contactId : existing.contactId;
      const projectId = dto.projectId !== undefined ? dto.projectId : existing.projectId;
      await this.assertCommunicationReferences(tx, partnerId, contactId, projectId);
      return tx.communicationRecord.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.occurredAt !== undefined ? { occurredAt: new Date(dto.occurredAt) } : {}),
          ...(dto.nextFollowUpAt !== undefined
            ? {
                nextFollowUpAt: dto.nextFollowUpAt === null ? null : new Date(dto.nextFollowUpAt),
              }
            : {}),
        },
      });
    });
  }

  async archiveCommunication(partnerId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.acquirePartnerLock(tx, partnerId);
      await this.assertActivePartner(tx, partnerId);
      const result = await tx.communicationRecord.updateMany({
        where: { id, partnerId, archivedAt: null },
        data: { archivedAt: new Date() },
      });
      if (!result.count) {
        throw this.notFound(ErrorCodes.COMMUNICATION_NOT_FOUND, 'Communication not found');
      }
    });
  }

  async createTaskForCommunication(id: string, input: CreateSourceTaskDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`rd-manager-workbench:communication-task:${id}`}))`,
      );
      const communication = await tx.communicationRecord.findFirst({
        where: { id, archivedAt: null },
      });
      if (!communication) {
        throw this.notFound(ErrorCodes.COMMUNICATION_NOT_FOUND, 'Communication not found');
      }
      if (communication.taskId) {
        return {
          task: await this.findExistingCommunicationTask(tx, communication.taskId),
          alreadyExists: true,
        };
      }
      const task = await this.tasks.createTaskInTransaction(tx, {
        ...input,
        projectId: input.projectId ?? communication.projectId ?? undefined,
        sourceType: 'COMMUNICATION',
        sourceId: communication.id,
      });
      const linked = await tx.communicationRecord.updateMany({
        where: { id, taskId: null },
        data: { taskId: task.id },
      });
      if (linked.count) return { task, alreadyExists: false };
      const current = await tx.communicationRecord.findUnique({
        where: { id },
        select: { taskId: true },
      });
      if (!current?.taskId) {
        throw new AppError({
          code: ErrorCodes.COMMUNICATION_TASK_EXISTS,
          message: 'Communication task could not be linked',
          statusCode: HttpStatus.CONFLICT,
        });
      }
      return {
        task: await this.findExistingCommunicationTask(tx, current.taskId),
        alreadyExists: true,
      };
    });
  }

  private toPartnerListItem(
    partner: PartnerListEntity,
    lastCommunicationAt: Date | null,
    nextFollowUpAt: Date | null,
  ) {
    const { _count, ...fields } = partner;
    return {
      ...fields,
      contactCount: _count.contacts,
      activeAgreementCount: _count.agreements,
      projectCount: _count.projects,
      fileCount: _count.fileAssets,
      lastCommunicationAt,
      nextFollowUpAt,
    };
  }

  private partnerCreateFields(dto: CreatePartnerDto): Prisma.PartnerUncheckedCreateInput {
    return {
      name: dto.name,
      ...(dto.shortName !== undefined ? { shortName: dto.shortName } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.address !== undefined ? { address: dto.address } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
    };
  }

  private partnerUpdateFields(dto: UpdatePartnerDto): Prisma.PartnerUpdateInput {
    return {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.shortName !== undefined ? { shortName: dto.shortName } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.address !== undefined ? { address: dto.address } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
    };
  }

  private async syncPartnerProjects(
    tx: Prisma.TransactionClient,
    partnerId: string,
    requestedProjectIds: string[],
  ) {
    const existing = await tx.partnerProject.findMany({
      where: { partnerId },
      select: { projectId: true },
    });
    const existingIds = new Set(existing.map(({ projectId }) => projectId));
    const requestedIds = new Set(requestedProjectIds);
    const removedIds = [...existingIds].filter((projectId) => !requestedIds.has(projectId));
    const addedIds = [...requestedIds].filter((projectId) => !existingIds.has(projectId));
    if (removedIds.length) {
      const communications = await tx.communicationRecord.count({
        where: {
          partnerId,
          projectId: { in: removedIds },
          archivedAt: null,
        },
      });
      if (communications > 0) {
        throw new AppError({
          code: ErrorCodes.PARTNER_HAS_ACTIVE_RECORDS,
          message: 'Partner project links are used by active communications',
          statusCode: HttpStatus.CONFLICT,
          details: { communications },
        });
      }
      await tx.partnerProject.deleteMany({
        where: { partnerId, projectId: { in: removedIds } },
      });
    }
    if (addedIds.length) {
      await tx.partnerProject.createMany({
        data: addedIds.map((projectId) => ({ partnerId, projectId })),
        skipDuplicates: true,
      });
    }
  }

  private acquirePartnerLock(tx: Prisma.TransactionClient, partnerId: string) {
    return tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`rd-manager-workbench:partner:${partnerId}`}))`,
    );
  }

  private async assertActivePartner(
    client: PlatformPrismaService | Prisma.TransactionClient,
    id: string,
  ) {
    const partner = await client.partner.findFirst({ where: { id, archivedAt: null } });
    if (!partner) throw this.notFound(ErrorCodes.PARTNER_NOT_FOUND, 'Partner not found');
    return partner;
  }

  private async assertActiveProject(client: Prisma.TransactionClient, id: string) {
    const project = await client.project.findFirst({
      where: { id, archivedAt: null, status: ProjectStatus.ACTIVE },
    });
    if (!project) throw this.notFound(ErrorCodes.PROJECT_NOT_FOUND, 'Project not found');
    return project;
  }

  private async assertActiveProjects(client: Prisma.TransactionClient, ids: string[]) {
    if (!ids.length) return;
    const projects = await client.project.findMany({
      where: { id: { in: ids }, archivedAt: null, status: ProjectStatus.ACTIVE },
      select: { id: true },
    });
    if (projects.length !== ids.length) {
      throw this.notFound(ErrorCodes.PROJECT_NOT_FOUND, 'Project not found');
    }
  }

  private async assertCommunicationReferences(
    client: Prisma.TransactionClient,
    partnerId: string,
    contactId?: string | null,
    projectId?: string | null,
  ) {
    if (contactId) {
      const contact = await client.partnerContact.findFirst({
        where: { id: contactId, partnerId, archivedAt: null },
      });
      if (!contact) {
        throw this.notFound(ErrorCodes.PARTNER_CONTACT_NOT_FOUND, 'Partner contact not found');
      }
    }
    if (projectId) {
      await this.assertActiveProject(client, projectId);
      const link = await client.partnerProject.findUnique({
        where: { partnerId_projectId: { partnerId, projectId } },
      });
      if (!link) {
        throw this.notFound(ErrorCodes.PARTNER_PROJECT_NOT_FOUND, 'Partner project link not found');
      }
    }
  }

  private async findExistingCommunicationTask(tx: Prisma.TransactionClient, taskId: string) {
    const task = await tx.workTask.findUnique({
      where: { id: taskId },
      include: {
        dependencies: { select: { dependsOnTaskId: true } },
        reminder: true,
        later: true,
      },
    });
    if (!task) throw this.notFound(ErrorCodes.TASK_NOT_FOUND, 'Task not found');
    const { dependencies, ...fields } = task;
    return {
      ...fields,
      dependencyIds: dependencies.map(({ dependsOnTaskId }) => dependsOnTaskId),
    };
  }

  private notFound(code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string) {
    return new AppError({ code, message, statusCode: HttpStatus.NOT_FOUND });
  }
}
