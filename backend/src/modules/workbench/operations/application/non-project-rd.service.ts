import { HttpStatus, Injectable } from '@nestjs/common';
import {
  NonProjectOutcomeStatus,
  NonProjectRdKind,
  NonProjectRdStatus,
  Prisma,
  ProjectStatus,
  TaskStatus,
} from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { TasksService } from '../../tasks/application/tasks.service';
import {
  CreateNonProjectRdDto,
  CreateNonProjectRdOutcomeDto,
  CreateNonProjectTaskDto,
  ListNonProjectRdQueryDto,
  UpdateNonProjectRdDto,
  UpdateNonProjectRdOutcomeDto,
} from '../interface/http/dto/non-project-rd.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const ACTIVE_TASK_STATUSES: TaskStatus[] = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.BLOCKED,
];
const TASK_RESPONSE_INCLUDE = {
  dependencies: { select: { dependsOnTaskId: true } },
  reminder: true,
  later: true,
} satisfies Prisma.WorkTaskInclude;

type DatabaseClient = PlatformPrismaService | Prisma.TransactionClient;
type ItemWriteDto = CreateNonProjectRdDto | UpdateNonProjectRdDto;

@Injectable()
export class NonProjectRdService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly tasks: TasksService,
  ) {}

  async list(query: ListNonProjectRdQueryDto) {
    this.assertDateRange(query.plannedFrom, query.plannedTo, 'Planned range');
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const q = query.q?.trim();
    const where: Prisma.NonProjectRdItemWhereInput = {
      archivedAt: null,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { title: { contains: q, mode: 'insensitive' } },
              { objective: { contains: q, mode: 'insensitive' } },
              { expectedOutcome: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.plannedFrom
        ? { plannedEndAt: { gte: new Date(query.plannedFrom) } }
        : {}),
      ...(query.plannedTo ? { plannedStartAt: { lte: new Date(query.plannedTo) } } : {}),
    };
    const include = {
      outcomes: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
      project: { select: { id: true, code: true, name: true } },
      task: { select: { id: true, title: true, status: true } },
    } satisfies Prisma.NonProjectRdItemInclude;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.nonProjectRdItem.findMany({
        where,
        include,
        orderBy: [{ plannedEndAt: 'asc' }, { updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.nonProjectRdItem.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async get(id: string) {
    return this.findActiveItem(this.prisma, id);
  }

  async create(dto: CreateNonProjectRdDto) {
    const normalized = this.normalizeCreate(dto);
    await this.assertProject(this.prisma, normalized.projectId);
    this.assertItemRules(normalized, []);
    try {
      return await this.prisma.nonProjectRdItem.create({
        data: this.toItemCreateData(normalized),
        include: {
          outcomes: true,
          project: { select: { id: true, code: true, name: true } },
          task: { select: { id: true, title: true, status: true } },
        },
      });
    } catch (error) {
      this.throwCodeConflict(error);
      throw error;
    }
  }

  async update(id: string, dto: UpdateNonProjectRdDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.acquireOutcomeLock(tx, id);
        const current = await this.findActiveItem(tx, id);
        const normalized = this.normalizeUpdate(dto);
        if (normalized.projectId !== undefined) {
          await this.assertProject(tx, normalized.projectId);
        }
        const merged = { ...current, ...normalized };
        this.assertItemRules(merged, current.outcomes);
        const result = await tx.nonProjectRdItem.updateMany({
          where: { id, archivedAt: null },
          data: this.toItemUpdateData(normalized),
        });
        if (!result.count) throw this.itemNotFound();
        return this.findActiveItem(tx, id);
      });
    } catch (error) {
      this.throwCodeConflict(error);
      throw error;
    }
  }

  async archive(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireOutcomeLock(tx, id);
      const item = await this.findActiveItem(tx, id);
      const [activeLoads, activeTasks, activeFiles] = await Promise.all([
        tx.resourceLoadEntry.count({
          where: { nonProjectRdItemId: id, archivedAt: null },
        }),
        tx.workTask.count({
          where: {
            archivedAt: null,
            status: { in: ACTIVE_TASK_STATUSES },
            OR: [
              ...(item.taskId ? [{ id: item.taskId }] : []),
              { sourceType: 'NON_PROJECT_RD', sourceId: id },
            ],
          },
        }),
        tx.fileAsset.count({
          where: { nonProjectRdItemId: id, status: 'ACTIVE' },
        }),
      ]);
      if (activeLoads || activeTasks || activeFiles) {
        throw new AppError({
          code: ErrorCodes.NON_PROJECT_RD_REFERENCE_INVALID,
          message: 'Archive active loads and tasks before archiving this R&D item',
          statusCode: HttpStatus.CONFLICT,
          details: {
            activeLoadCount: activeLoads,
            activeTaskCount: activeTasks,
            activeFileCount: activeFiles,
          },
        });
      }
      const result = await tx.nonProjectRdItem.updateMany({
        where: { id, archivedAt: null },
        data: { archivedAt: new Date() },
      });
      if (!result.count) throw this.itemNotFound();
    });
  }

  async listOutcomes(itemId: string) {
    await this.findActiveItem(this.prisma, itemId);
    return this.prisma.nonProjectRdOutcome.findMany({
      where: { itemId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async createOutcome(itemId: string, dto: CreateNonProjectRdOutcomeDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireOutcomeLock(tx, itemId);
      await this.findActiveItem(tx, itemId);
      return tx.nonProjectRdOutcome.create({
        data: {
          itemId,
          title: this.required(dto.title, 'Outcome title'),
          ...this.toOutcomeData(dto),
        },
      });
    });
  }

  async updateOutcome(
    itemId: string,
    outcomeId: string,
    dto: UpdateNonProjectRdOutcomeDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireOutcomeLock(tx, itemId);
      const item = await this.findActiveItem(tx, itemId);
      const current = item.outcomes.find(({ id }) => id === outcomeId);
      if (!current) throw this.outcomeNotFound();
      const data = this.toOutcomeData(dto);
      this.assertOutcomeMutationAllowed(item, outcomeId, dto.status ?? current.status);
      const result = await tx.nonProjectRdOutcome.updateMany({
        where: { id: outcomeId, itemId },
        data,
      });
      if (!result.count) throw this.outcomeNotFound();
      const outcome = await tx.nonProjectRdOutcome.findUnique({ where: { id: outcomeId } });
      if (!outcome) throw this.outcomeNotFound();
      return outcome;
    });
  }

  async deleteOutcome(itemId: string, outcomeId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireOutcomeLock(tx, itemId);
      const item = await this.findActiveItem(tx, itemId);
      if (!item.outcomes.some(({ id }) => id === outcomeId)) throw this.outcomeNotFound();
      this.assertOutcomeMutationAllowed(item, outcomeId, null);
      const result = await tx.nonProjectRdOutcome.deleteMany({
        where: { id: outcomeId, itemId },
      });
      if (!result.count) throw this.outcomeNotFound();
    });
  }

  async projectSuggestion(id: string) {
    const item = await this.findActiveItem(this.prisma, id);
    const rootCode = `NPRD-${item.code}`;
    let code = rootCode;
    let suffix = 2;
    while (await this.prisma.project.findFirst({ where: { code }, select: { id: true } })) {
      code = `${rootCode}-${suffix}`;
      suffix += 1;
    }
    return {
      code,
      name: item.suggestedProjectName ?? item.title,
      type: item.kind,
      objective: item.objective,
      expectedOutcome: item.expectedOutcome,
      plannedStartAt: item.plannedStartAt,
      plannedEndAt: item.plannedEndAt,
    };
  }

  async createTask(id: string, dto: CreateNonProjectTaskDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`rd-manager-workbench:non-project-rd-task:${id}`}))`,
      );
      const item = await tx.nonProjectRdItem.findFirst({
        where: { id, archivedAt: null },
        select: { id: true, title: true, projectId: true, taskId: true },
      });
      if (!item) throw this.itemNotFound();
      if (item.taskId) {
        return this.taskResult(
          item.id,
          await this.findExistingTask(tx, item.taskId),
          true,
        );
      }
      const task = await this.tasks.createTaskInTransaction(tx, {
        ...dto,
        title: this.required(dto.title, 'Task title'),
        ...(dto.description !== undefined
          ? { description: this.required(dto.description, 'Task description') }
          : {}),
        ...(dto.assigneeName !== undefined
          ? { assigneeName: this.required(dto.assigneeName, 'Task assignee') }
          : {}),
        projectId:
          dto.projectId !== undefined
            ? this.required(dto.projectId, 'Task project')
            : item.projectId ?? undefined,
        sourceType: 'NON_PROJECT_RD',
        sourceId: item.id,
      });
      const linked = await tx.nonProjectRdItem.updateMany({
        where: { id: item.id, taskId: null, archivedAt: null },
        data: { taskId: task.id },
      });
      if (linked.count) return this.taskResult(item.id, task, false);

      const current = await tx.nonProjectRdItem.findUnique({
        where: { id: item.id },
        select: { taskId: true },
      });
      if (!current?.taskId) {
        throw new AppError({
          code: ErrorCodes.NON_PROJECT_TASK_EXISTS,
          message: 'The source task could not be linked',
          statusCode: HttpStatus.CONFLICT,
        });
      }
      return this.taskResult(
        item.id,
        await this.findExistingTask(tx, current.taskId),
        true,
      );
    });
  }

  private async findActiveItem(client: DatabaseClient, id: string) {
    const item = await client.nonProjectRdItem.findFirst({
      where: { id, archivedAt: null },
      include: {
        outcomes: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
        project: { select: { id: true, code: true, name: true } },
        task: { select: { id: true, title: true, status: true } },
      },
    });
    if (!item) throw this.itemNotFound();
    return item;
  }

  private async assertProject(client: DatabaseClient, projectId?: string | null) {
    if (!projectId) return;
    const project = await client.project.findFirst({
      where: { id: projectId, archivedAt: null, status: ProjectStatus.ACTIVE },
      select: { id: true },
    });
    if (!project) {
      throw new AppError({
        code: ErrorCodes.NON_PROJECT_RD_REFERENCE_INVALID,
        message: 'Project must reference an active project',
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
  }

  private async acquireOutcomeLock(tx: Prisma.TransactionClient, itemId: string) {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`rd-manager-workbench:non-project-rd-outcomes:${itemId}`}))`,
    );
  }

  private assertOutcomeMutationAllowed(
    item: {
      status: NonProjectRdStatus;
      outcomeWaivedReason: string | null;
      outcomes: Array<{ id: string; status: NonProjectOutcomeStatus }>;
    },
    outcomeId: string,
    nextStatus: NonProjectOutcomeStatus | null,
  ) {
    if (
      item.status !== NonProjectRdStatus.COMPLETED ||
      this.hasText(item.outcomeWaivedReason)
    ) {
      return;
    }
    const retainsVerifiedOutcome = item.outcomes.some(({ id, status }) =>
      id === outcomeId
        ? nextStatus === NonProjectOutcomeStatus.VERIFIED
        : status === NonProjectOutcomeStatus.VERIFIED,
    );
    if (!retainsVerifiedOutcome) {
      throw new AppError({
        code: ErrorCodes.NON_PROJECT_RD_COMPLETION_BLOCKED,
        message: 'A completed item must retain a verified outcome or an explicit waiver reason',
        statusCode: HttpStatus.CONFLICT,
      });
    }
  }

  private assertItemRules(
    item: {
      kind: NonProjectRdKind;
      plannedStartAt?: string | Date | null;
      plannedEndAt?: string | Date | null;
      actualStartAt?: string | Date | null;
      actualEndAt?: string | Date | null;
      impactScope?: string | null;
      severity?: string | null;
      status?: NonProjectRdStatus;
      outcomeWaivedReason?: string | null;
    },
    outcomes: Array<{ status: NonProjectOutcomeStatus }>,
  ) {
    this.assertDateRange(item.plannedStartAt, item.plannedEndAt, 'Planned dates');
    this.assertDateRange(item.actualStartAt, item.actualEndAt, 'Actual dates');
    if (
      item.kind !== NonProjectRdKind.TECH_DEBT &&
      (this.hasText(item.impactScope) || this.hasText(item.severity))
    ) {
      throw new AppError({
        code: ErrorCodes.NON_PROJECT_RD_REFERENCE_INVALID,
        message: 'Impact scope and severity are only allowed for technical debt',
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
    if (
      item.status === NonProjectRdStatus.COMPLETED &&
      !outcomes.some(({ status }) => status === NonProjectOutcomeStatus.VERIFIED) &&
      !this.hasText(item.outcomeWaivedReason)
    ) {
      throw new AppError({
        code: ErrorCodes.NON_PROJECT_RD_COMPLETION_BLOCKED,
        message: 'Completion requires a verified outcome or an explicit waiver reason',
        statusCode: HttpStatus.CONFLICT,
      });
    }
  }

  private assertDateRange(
    from: string | Date | null | undefined,
    to: string | Date | null | undefined,
    label: string,
  ) {
    if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
      throw new AppError({
        code: ErrorCodes.NON_PROJECT_RD_REFERENCE_INVALID,
        message: `${label} must start before they end`,
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
  }

  private normalizeCreate(dto: CreateNonProjectRdDto): CreateNonProjectRdDto {
    return {
      ...dto,
      code: this.required(dto.code, 'Code'),
      title: this.required(dto.title, 'Title'),
      ...this.normalizeOptionalStrings(dto),
    };
  }

  private normalizeUpdate(dto: UpdateNonProjectRdDto): UpdateNonProjectRdDto {
    return {
      ...dto,
      ...(dto.code !== undefined ? { code: this.required(dto.code, 'Code') } : {}),
      ...(dto.title !== undefined ? { title: this.required(dto.title, 'Title') } : {}),
      ...this.normalizeOptionalStrings(dto),
    };
  }

  private normalizeOptionalStrings(dto: ItemWriteDto) {
    const output: Record<string, string | null> = {};
    const keys = [
      'objective',
      'expectedOutcome',
      'ownerName',
      'impactScope',
      'severity',
      'suggestedProjectName',
      'projectId',
      'outcomeWaivedReason',
    ] as const;
    for (const key of keys) {
      const value = dto[key];
      if (value !== undefined) {
        output[key] = value === null ? null : this.required(value, this.fieldLabel(key));
      }
    }
    return output;
  }

  private toItemCreateData(dto: CreateNonProjectRdDto): Prisma.NonProjectRdItemUncheckedCreateInput {
    return {
      code: dto.code,
      kind: dto.kind,
      title: dto.title,
      ...this.toItemFields(dto),
    };
  }

  private toItemUpdateData(dto: UpdateNonProjectRdDto): Prisma.NonProjectRdItemUncheckedUpdateManyInput {
    return {
      ...(dto.code !== undefined ? { code: dto.code } : {}),
      ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...this.toItemFields(dto),
    };
  }

  private toItemFields(dto: ItemWriteDto) {
    return {
      ...(dto.objective !== undefined ? { objective: dto.objective } : {}),
      ...(dto.expectedOutcome !== undefined ? { expectedOutcome: dto.expectedOutcome } : {}),
      ...(dto.ownerName !== undefined ? { ownerName: dto.ownerName } : {}),
      ...(dto.plannedStartAt !== undefined
        ? { plannedStartAt: dto.plannedStartAt === null ? null : new Date(dto.plannedStartAt) }
        : {}),
      ...(dto.plannedEndAt !== undefined
        ? { plannedEndAt: dto.plannedEndAt === null ? null : new Date(dto.plannedEndAt) }
        : {}),
      ...(dto.actualStartAt !== undefined
        ? { actualStartAt: dto.actualStartAt === null ? null : new Date(dto.actualStartAt) }
        : {}),
      ...(dto.actualEndAt !== undefined
        ? { actualEndAt: dto.actualEndAt === null ? null : new Date(dto.actualEndAt) }
        : {}),
      ...(dto.plannedPersonHours !== undefined
        ? { plannedPersonHours: dto.plannedPersonHours ?? 0 }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.impactScope !== undefined ? { impactScope: dto.impactScope } : {}),
      ...(dto.severity !== undefined ? { severity: dto.severity } : {}),
      ...(dto.suggestedProjectName !== undefined
        ? { suggestedProjectName: dto.suggestedProjectName }
        : {}),
      ...(dto.projectId !== undefined ? { projectId: dto.projectId } : {}),
      ...(dto.outcomeWaivedReason !== undefined
        ? { outcomeWaivedReason: dto.outcomeWaivedReason }
        : {}),
    };
  }

  private toOutcomeData(dto: CreateNonProjectRdOutcomeDto | UpdateNonProjectRdOutcomeDto) {
    const status = dto.status;
    return {
      ...(dto.title !== undefined ? { title: this.required(dto.title, 'Outcome title') } : {}),
      ...(dto.summary !== undefined
        ? {
            summary:
              dto.summary === null ? null : this.required(dto.summary, 'Outcome summary'),
          }
        : {}),
      ...(status !== undefined ? { status } : {}),
      ...(dto.verifiedAt !== undefined
        ? { verifiedAt: dto.verifiedAt === null ? null : new Date(dto.verifiedAt) }
        : status === NonProjectOutcomeStatus.VERIFIED
          ? { verifiedAt: new Date() }
          : status !== undefined
            ? { verifiedAt: null }
            : {}),
      ...(dto.evidenceNote !== undefined
        ? {
            evidenceNote:
              dto.evidenceNote === null
                ? null
                : this.required(dto.evidenceNote, 'Outcome evidence note'),
          }
        : {}),
    };
  }

  private async findExistingTask(tx: Prisma.TransactionClient, taskId: string) {
    const task = await tx.workTask.findUnique({
      where: { id: taskId },
      include: TASK_RESPONSE_INCLUDE,
    });
    if (!task) {
      throw new AppError({
        code: ErrorCodes.NON_PROJECT_TASK_EXISTS,
        message: 'The linked task no longer exists',
        statusCode: HttpStatus.CONFLICT,
      });
    }
    const { dependencies, ...rest } = task;
    return {
      ...rest,
      dependencyIds: dependencies.map(({ dependsOnTaskId }) => dependsOnTaskId),
    };
  }

  private taskResult(itemId: string, task: unknown, alreadyExists: boolean) {
    return {
      task,
      alreadyExists,
      source: {
        type: 'NON_PROJECT_RD' as const,
        id: itemId,
        path: `/library/operations?tab=non-project-rd&recordId=${encodeURIComponent(itemId)}`,
      },
    };
  }

  private required(value: string, label: string) {
    const normalized = value.trim();
    if (!normalized) {
      throw new AppError({
        code: ErrorCodes.NON_PROJECT_RD_REFERENCE_INVALID,
        message: `${label} cannot be empty`,
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
    return normalized;
  }

  private fieldLabel(field: string) {
    return field.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`);
  }

  private hasText(value?: string | null) {
    return Boolean(value?.trim());
  }

  private throwCodeConflict(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError({
        code: ErrorCodes.NON_PROJECT_RD_CODE_EXISTS,
        message: 'Non-project R&D code already exists',
        statusCode: HttpStatus.CONFLICT,
      });
    }
  }

  private itemNotFound() {
    return new AppError({
      code: ErrorCodes.NON_PROJECT_RD_NOT_FOUND,
      message: 'Non-project R&D item not found',
      statusCode: HttpStatus.NOT_FOUND,
    });
  }

  private outcomeNotFound() {
    return new AppError({
      code: ErrorCodes.NON_PROJECT_OUTCOME_NOT_FOUND,
      message: 'Non-project R&D outcome not found',
      statusCode: HttpStatus.NOT_FOUND,
    });
  }
}
