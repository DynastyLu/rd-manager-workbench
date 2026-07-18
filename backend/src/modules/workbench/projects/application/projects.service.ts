import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { CreateProjectDto } from '../interface/http/dto/create-project.dto';
import { ListProjectsQueryDto } from '../interface/http/dto/list-projects-query.dto';
import { UpdateProjectDto } from '../interface/http/dto/update-project.dto';

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
  >
>;

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  async create(dto: CreateProjectDto) {
    try {
      return await this.prisma.project.create({
        data: { code: dto.code, name: dto.name, ...this.toProjectFields(dto) },
      });
    } catch (error) {
      this.throwIfDuplicateCode(error);
      throw error;
    }
  }

  async list(query: ListProjectsQueryDto) {
    const page = this.toPage(query.page);
    const pageSize = this.toPageSize(query.pageSize);
    const where: Prisma.ProjectWhereInput = {
      archivedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.project.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  async get(id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, archivedAt: null },
      include: {
        milestones: {
          orderBy: [{ plannedAt: 'asc' }, { id: 'asc' }],
        },
        tasks: {
          where: { archivedAt: null },
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
      throw new NotFoundException('Project not found');
    }

    const { healthSnapshots, tasks, ...projectDetails } = project;
    return {
      ...projectDetails,
      tasks: tasks.map(({ dependencies, ...task }) => ({
        ...task,
        dependencyIds: dependencies.map(({ dependsOnTaskId }) => dependsOnTaskId),
      })),
      latestHealthSnapshot: healthSnapshots[0] ?? null,
    };
  }

  async update(id: string, dto: UpdateProjectDto) {
    try {
      const result = await this.prisma.project.updateMany({
        where: { id, archivedAt: null },
        data: this.toProjectUpdateData(dto),
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
    const result = await this.prisma.project.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: new Date() },
    });

    if (result.count === 0) {
      throw new NotFoundException('Project not found');
    }
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
