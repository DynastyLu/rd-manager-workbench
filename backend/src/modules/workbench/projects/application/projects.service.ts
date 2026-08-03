import { BadRequestException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DataScopeService } from '../../../../modules/iam/application/data-scope.service';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { CreateProjectDto } from '../interface/http/dto/create-project.dto';
import { ListProjectsQueryDto } from '../interface/http/dto/list-projects-query.dto';
import { UpdateProjectDto } from '../interface/http/dto/update-project.dto';
import { ProjectProgressService } from './project-progress.service';
import { ProjectWorkItemViewDto } from '../interface/http/dto/project-plan.dto';
import type { PermissionCode } from '../../../../modules/iam/domain/permission-catalog';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

type ProjectWriteDto = CreateProjectDto | UpdateProjectDto;
type ProjectFields = Partial<
  Pick<
    Prisma.ProjectCreateInput,
    | 'type'
    | 'researchDirection'
    | 'objective'
    | 'expectedOutcome'
    | 'leadName'
    | 'participantNames'
    | 'plannedStartAt'
    | 'plannedEndAt'
    | 'actualStartAt'
    | 'actualEndAt'
    | 'phase'
    | 'status'
    | 'weightMode'
    | 'healthOverride'
  >
>;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly dataScope: DataScopeService,
    private readonly requestContext: RequestContextService,
    private readonly projectProgressService?: ProjectProgressService,
  ) {}

  async create(dto: CreateProjectDto) {
    const principal = this.requestContext.requirePrincipal();
    try {
      return await this.prisma.project.create({
        data: {
          code: dto.code,
          name: dto.name,
          createdByUserId: principal.userId,
          updatedByUserId: principal.userId,
          ownerUserId: principal.userId,
          ...this.toProjectFields(dto),
        },
      });
    } catch (error) {
      this.throwIfDuplicateCode(error);
      throw error;
    }
  }

  async list(query: ListProjectsQueryDto) {
    const principal = this.requestContext.requirePrincipal();
    const page = this.toPage(query.page);
    const pageSize = this.toPageSize(query.pageSize);
    const scopeWhere = this.dataScope.projects(principal, 'project.read');
    const searchWhere = query.search
      ? {
          OR: [
            { code: { contains: query.search, mode: 'insensitive' as const } },
            { name: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : undefined;
    const where: Prisma.ProjectWhereInput = {
      archivedAt: null,
      ...(Object.keys(scopeWhere).length > 0 && searchWhere
        ? { AND: [scopeWhere, searchWhere] }
        : Object.keys(scopeWhere).length > 0
          ? scopeWhere
          : searchWhere ?? {}),
      ...(query.ids ? { id: { in: query.ids } } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        include: {
          healthSnapshots: {
            orderBy: [{ calculatedAt: 'desc' }, { id: 'desc' }],
            take: 1,
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      data: data.map(({ healthSnapshots, ...project }) => ({
        ...project,
        health: project.healthOverride ?? healthSnapshots[0]?.health ?? null,
      })),
      meta: { page, pageSize, total },
    };
  }

  async get(id: string) {
    const principal = this.requestContext.requirePrincipal();
    const project = await this.prisma.project.findFirst({
      where: { id, archivedAt: null, ...this.dataScope.projects(principal, 'project.read') },
      include: {
        milestones: {
          orderBy: [
            { plannedStartAt: 'asc' },
            { plannedEndAt: 'asc' },
            { plannedAt: 'asc' },
            { id: 'asc' },
          ],
        },
        tasks: {
          where: {
            AND: [
              { archivedAt: null },
              this.dataScope.tasks(principal, 'task.read'),
            ],
          },
          orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
          include: { dependencies: { select: { dependsOnTaskId: true } } },
        },
        progressReports: { orderBy: [{ reportedAt: 'desc' }, { id: 'desc' }] },
        healthSnapshots: {
          orderBy: [{ calculatedAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
    });

    if (!project) {
      await this.assertProjectExistsOrThrow(id);
      return null as never;
    }

    const progressSummary = this.projectProgressService
      ? await this.projectProgressService.getSummary(this.prisma, id)
      : null;
    const milestoneProgress = new Map(
      progressSummary?.milestones.map((milestone) => [milestone.id, milestone]) ?? [],
    );
    const { healthSnapshots, tasks, milestones, progressReports, ...projectDetails } = project;
    return {
      ...projectDetails,
      milestones: milestones.map((milestone) => ({
        ...milestone,
        weightPercent: milestone.weightPercent?.toNumber() ?? null,
        manualCompletionPercent: milestone.manualCompletionPercent?.toNumber() ?? null,
        ...(milestoneProgress.get(milestone.id) ?? {}),
      })),
      tasks: tasks.map(({ dependencies, ...task }) => ({
        ...task,
        dependencyIds: dependencies.map(({ dependsOnTaskId }) => dependsOnTaskId),
      })),
      progressReports: progressReports.map((report) => ({
        ...report,
        completionPercent: report.completionPercent.toNumber(),
        previousPercent: report.previousPercent?.toNumber() ?? null,
      })),
      progressSummary,
      latestHealthSnapshot: healthSnapshots[0] ?? null,
      effectiveHealth: projectDetails.healthOverride ?? healthSnapshots[0]?.health ?? null,
    };
  }

  async update(id: string, dto: UpdateProjectDto) {
    const principal = this.requestContext.requirePrincipal();
    await this.assertAccessible(id, 'project.update');
    try {
      if (dto.weightMode === 'CUSTOM') {
        const milestones = await this.prisma.milestone.findMany({
          where: { projectId: id },
          select: { weightPercent: true },
        });
        if (milestones.length > 0) {
          const totalHundredths = milestones.reduce(
            (total, milestone) =>
              total + Math.round((milestone.weightPercent?.toNumber() ?? 0) * 100),
            0,
          );
          if (totalHundredths !== 10_000) {
            throw new BadRequestException(
              `启用自定义权重前，所有里程碑权重之和必须为 100%，当前为 ${totalHundredths / 100}%`,
            );
          }
        }
      }
      const result = await this.prisma.project.updateMany({
        where: { id, archivedAt: null },
        data: { ...this.toProjectUpdateData(dto), updatedByUserId: principal.userId },
      });

      if (result.count === 0) {
        throw new NotFoundException('Project not found');
      }

      const project = await this.prisma.project.findUnique({ where: { id } });
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      return project;
    } catch (error) {
      this.throwIfDuplicateCode(error);
      throw error;
    }
  }

  async archive(id: string) {
    const principal = this.requestContext.requirePrincipal();
    await this.assertAccessible(id, 'project.delete');
    const result = await this.prisma.project.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: new Date(), updatedByUserId: principal.userId },
    });

    if (result.count === 0) {
      throw new NotFoundException('Project not found');
    }
  }

  async updateWorkItemView(id: string, config: ProjectWorkItemViewDto) {
    const principal = this.requestContext.requirePrincipal();
    await this.assertAccessible(id, 'project.update');
    const result = await this.prisma.project.updateMany({
      where: { id, archivedAt: null },
      data: { workItemViewConfig: config as unknown as Prisma.InputJsonValue, updatedByUserId: principal.userId },
    });
    if (result.count === 0) throw new NotFoundException('Project not found');
    return config;
  }

  private async assertAccessible(id: string, permissionCode: PermissionCode) {
    const principal = this.requestContext.requirePrincipal();
    const accessible = await this.prisma.project.findFirst({
      where: { id, archivedAt: null, ...this.dataScope.projects(principal, permissionCode) },
      select: { id: true },
    });
    if (!accessible) {
      await this.assertProjectExistsOrThrow(id);
    }
  }

  private async assertProjectExistsOrThrow(id: string): Promise<never> {
    const exists = await this.prisma.project.findFirst({
      where: { id, archivedAt: null },
      select: { id: true },
    });
    if (exists) {
      throw new AppError({
        code: ErrorCodes.PERMISSION_DENIED,
        message: 'Access to this project is not allowed',
        statusCode: HttpStatus.FORBIDDEN,
      });
    }
    throw new NotFoundException('Project not found');
  }

  private toProjectUpdateData(dto: UpdateProjectDto): Prisma.ProjectUpdateManyMutationInput {
    return {
      ...(dto.code !== undefined ? { code: dto.code } : {}),
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...this.toProjectFields(dto),
    };
  }

  private toProjectFields(dto: ProjectWriteDto): ProjectFields {
    return {
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.researchDirection !== undefined ? { researchDirection: dto.researchDirection } : {}),
      ...(dto.objective !== undefined ? { objective: dto.objective } : {}),
      ...(dto.expectedOutcome !== undefined ? { expectedOutcome: dto.expectedOutcome } : {}),
      ...(dto.leadName !== undefined ? { leadName: dto.leadName } : {}),
      ...(dto.participantNames !== undefined ? { participantNames: dto.participantNames } : {}),
      ...(typeof dto.plannedStartAt === 'string'
        ? { plannedStartAt: new Date(dto.plannedStartAt) }
        : {}),
      ...(typeof dto.plannedEndAt === 'string' ? { plannedEndAt: new Date(dto.plannedEndAt) } : {}),
      ...(typeof dto.actualStartAt === 'string'
        ? { actualStartAt: new Date(dto.actualStartAt) }
        : {}),
      ...(typeof dto.actualEndAt === 'string' ? { actualEndAt: new Date(dto.actualEndAt) } : {}),
      ...(dto.phase !== undefined ? { phase: dto.phase } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.weightMode !== undefined ? { weightMode: dto.weightMode } : {}),
      ...(dto.healthOverride !== undefined ? { healthOverride: dto.healthOverride } : {}),
    };
  }

  private toPage(value: number | undefined) {
    return value && value > 0 ? value : DEFAULT_PAGE;
  }

  private toPageSize(value: number | undefined) {
    if (!value || value < 1) {
      return DEFAULT_PAGE_SIZE;
    }

    return Math.min(value, MAX_PAGE_SIZE);
  }

  private throwIfDuplicateCode(error: unknown): never | void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      error.meta.target.includes('code')
    ) {
      throw new AppError({
        code: ErrorCodes.PROJECT_CODE_EXISTS,
        message: 'Project code already exists',
        statusCode: HttpStatus.CONFLICT,
      });
    }
  }
}
