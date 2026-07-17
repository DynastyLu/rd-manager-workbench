import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { ProjectHealthService } from '../../projects/application/project-health.service';
import { CreateMilestoneDto } from '../interface/http/dto/create-milestone.dto';
import { CreateProgressReportDto } from '../interface/http/dto/create-progress-report.dto';
import { CreateTaskDto } from '../interface/http/dto/create-task.dto';
import { ListTasksQueryDto } from '../interface/http/dto/list-tasks-query.dto';
import { UpdateMilestoneDto } from '../interface/http/dto/update-milestone.dto';
import { UpdateTaskDto } from '../interface/http/dto/update-task.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
type DatabaseClient = PlatformPrismaService | Prisma.TransactionClient;
interface TaskReferenceInput {
  projectId?: string | null;
  milestoneId?: string | null;
  parentId?: string | null;
  dependencyIds?: string[];
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly projectHealthService: ProjectHealthService,
  ) {}

  async createTask(dto: CreateTaskDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertTaskReferences(tx, dto);
      await this.assertCompletionAllowed(tx, dto.status, dto.dependencyIds ?? []);
      const task = await tx.workTask.create({
        data: {
          title: dto.title,
          ...this.toTaskFields(dto),
          ...(dto.status === TaskStatus.DONE ? { completedAt: new Date() } : {}),
          ...(dto.dependencyIds?.length
            ? {
                dependencies: {
                  create: dto.dependencyIds.map((dependsOnTaskId) => ({ dependsOnTaskId })),
                },
              }
            : {}),
        },
      });
      if (task.projectId) await this.recalculateHealth(tx, task.projectId);
      return task;
    });
  }

  async listTasks(query: ListTasksQueryDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const now = new Date();
    const incompleteStatuses: TaskStatus[] = [
      TaskStatus.TODO,
      TaskStatus.IN_PROGRESS,
      TaskStatus.BLOCKED,
    ];
    const where: Prisma.WorkTaskWhereInput = {
      archivedAt: null,
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.assigneeName ? { assigneeName: query.assigneeName } : {}),
      ...(query.dueBefore ? { dueAt: { lte: new Date(query.dueBefore) } } : {}),
      ...(query.overdue ? { dueAt: { lt: now }, status: { in: incompleteStatuses } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.workTask.findMany({
        where,
        orderBy: [{ dueAt: 'asc' }, { updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.workTask.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async getTask(id: string) {
    const task = await this.prisma.workTask.findFirst({ where: { id, archivedAt: null } });
    if (!task) throw this.notFound(ErrorCodes.TASK_NOT_FOUND, 'Task not found');
    return task;
  }

  async updateTask(id: string, dto: UpdateTaskDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.workTask.findFirst({
        where: { id, archivedAt: null },
        include: { dependencies: { select: { dependsOnTaskId: true } } },
      });
      if (!existing) throw this.notFound(ErrorCodes.TASK_NOT_FOUND, 'Task not found');
      const merged = {
        projectId: dto.projectId !== undefined ? dto.projectId : existing.projectId,
        milestoneId: dto.milestoneId !== undefined ? dto.milestoneId : existing.milestoneId,
        parentId: dto.parentId !== undefined ? dto.parentId : existing.parentId,
        dependencyIds:
          dto.dependencyIds ?? existing.dependencies.map(({ dependsOnTaskId }) => dependsOnTaskId),
        status: dto.status ?? existing.status,
      };
      await this.assertTaskReferences(tx, merged, id);
      await this.assertCompletionAllowed(tx, merged.status, merged.dependencyIds);
      const task = await tx.workTask.update({
        where: { id },
        data: {
          ...this.toTaskFields(dto),
          ...(dto.status !== undefined && dto.status !== existing.status
            ? { completedAt: dto.status === TaskStatus.DONE ? new Date() : null }
            : {}),
          ...(dto.dependencyIds !== undefined
            ? {
                dependencies: {
                  deleteMany: {},
                  ...(dto.dependencyIds.length
                    ? { create: dto.dependencyIds.map((dependsOnTaskId) => ({ dependsOnTaskId })) }
                    : {}),
                },
              }
            : {}),
        },
      });
      const healthProjectIds = [existing.projectId, task.projectId].filter(
        (projectId): projectId is string => Boolean(projectId),
      );
      for (const projectId of new Set(healthProjectIds))
        await this.recalculateHealth(tx, projectId);
      return task;
    });
  }

  async archiveTask(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.workTask.findFirst({ where: { id, archivedAt: null } });
      if (!task) throw this.notFound(ErrorCodes.TASK_NOT_FOUND, 'Task not found');
      await tx.workTask.update({ where: { id }, data: { archivedAt: new Date() } });
      if (task.projectId) await this.recalculateHealth(tx, task.projectId);
    });
  }

  async createMilestone(projectId: string, dto: CreateMilestoneDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveProject(tx, projectId);
      const milestone = await tx.milestone.create({
        data: {
          projectId,
          name: dto.name,
          ...(dto.plannedAt !== undefined ? { plannedAt: new Date(dto.plannedAt) } : {}),
          ...(dto.actualAt !== undefined ? { actualAt: new Date(dto.actualAt) } : {}),
          ...(dto.ownerName !== undefined ? { ownerName: dto.ownerName } : {}),
          ...(dto.isCritical !== undefined ? { isCritical: dto.isCritical } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
      });
      await this.recalculateHealth(tx, projectId);
      return milestone;
    });
  }

  async updateMilestone(projectId: string, milestoneId: string, dto: UpdateMilestoneDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveProject(tx, projectId);
      const milestone = await tx.milestone.findFirst({ where: { id: milestoneId, projectId } });
      if (!milestone) throw this.notFound(ErrorCodes.MILESTONE_NOT_FOUND, 'Milestone not found');
      const updated = await tx.milestone.update({
        where: { id: milestoneId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.plannedAt !== undefined ? { plannedAt: new Date(dto.plannedAt) } : {}),
          ...(dto.actualAt !== undefined ? { actualAt: new Date(dto.actualAt) } : {}),
          ...(dto.ownerName !== undefined ? { ownerName: dto.ownerName } : {}),
          ...(dto.isCritical !== undefined ? { isCritical: dto.isCritical } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
      });
      await this.recalculateHealth(tx, projectId);
      return updated;
    });
  }

  async createProgressReport(projectId: string, dto: CreateProgressReportDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveProject(tx, projectId);
      const report = await tx.progressReport.create({
        data: {
          projectId,
          summary: dto.summary,
          completionPercent: dto.completionPercent,
          ...(dto.reportedAt !== undefined
            ? { reportedAt: new Date(dto.reportedAt) }
            : { reportedAt: new Date() }),
          ...(dto.blockers !== undefined ? { blockers: dto.blockers } : {}),
        },
      });
      await this.recalculateHealth(tx, projectId);
      return report;
    });
  }

  private toTaskFields(dto: Partial<CreateTaskDto>) {
    return {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.projectId !== undefined ? { projectId: dto.projectId } : {}),
      ...(dto.milestoneId !== undefined ? { milestoneId: dto.milestoneId } : {}),
      ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.assigneeName !== undefined ? { assigneeName: dto.assigneeName } : {}),
      ...(dto.collaboratorNames !== undefined ? { collaboratorNames: dto.collaboratorNames } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.dueAt !== undefined ? { dueAt: new Date(dto.dueAt) } : {}),
      ...(dto.sourceType !== undefined ? { sourceType: dto.sourceType } : {}),
      ...(dto.sourceId !== undefined ? { sourceId: dto.sourceId } : {}),
    };
  }

  private async assertTaskReferences(
    tx: DatabaseClient,
    candidate: TaskReferenceInput,
    taskId?: string,
  ) {
    if (candidate.projectId) await this.assertActiveProject(tx, candidate.projectId);
    if (candidate.milestoneId) {
      if (!candidate.projectId) {
        throw this.unprocessable(
          ErrorCodes.MILESTONE_PROJECT_MISMATCH,
          'A milestone requires a project',
        );
      }
      const milestone = await tx.milestone.findUnique({ where: { id: candidate.milestoneId } });
      if (!milestone) throw this.notFound(ErrorCodes.MILESTONE_NOT_FOUND, 'Milestone not found');
      if (milestone.projectId !== candidate.projectId) {
        throw this.unprocessable(
          ErrorCodes.MILESTONE_PROJECT_MISMATCH,
          'Milestone belongs to another project',
        );
      }
    }
    if (candidate.parentId) {
      if (candidate.parentId === taskId) {
        throw this.unprocessable(
          ErrorCodes.TASK_INVALID_REFERENCE,
          'Task cannot be its own parent',
        );
      }
      const parent = await tx.workTask.findFirst({
        where: { id: candidate.parentId, archivedAt: null },
      });
      if (!parent) throw this.notFound(ErrorCodes.TASK_NOT_FOUND, 'Parent task not found');
      if (parent.projectId !== (candidate.projectId ?? null)) {
        throw this.unprocessable(
          ErrorCodes.TASK_INVALID_REFERENCE,
          'Parent task belongs to another project',
        );
      }
    }
    const dependencyIds = candidate.dependencyIds ?? [];
    if (new Set(dependencyIds).size !== dependencyIds.length) {
      throw this.unprocessable(
        ErrorCodes.TASK_INVALID_REFERENCE,
        'Duplicate task dependencies are not allowed',
      );
    }
    if (taskId && dependencyIds.includes(taskId)) {
      throw this.unprocessable(ErrorCodes.TASK_INVALID_REFERENCE, 'Task cannot depend on itself');
    }
    if (!dependencyIds.length) return;
    const dependencies = await tx.workTask.findMany({
      where: { id: { in: dependencyIds }, archivedAt: null },
      select: { id: true },
    });
    if (dependencies.length !== dependencyIds.length) {
      throw this.notFound(ErrorCodes.TASK_NOT_FOUND, 'Dependency task not found');
    }
    if (taskId) await this.assertNoDependencyCycle(tx, taskId, dependencyIds);
  }

  private async assertCompletionAllowed(
    tx: DatabaseClient,
    status: TaskStatus | undefined,
    dependencyIds: string[],
  ) {
    if (status !== TaskStatus.DONE || !dependencyIds.length) return;
    const incompleteCount = await tx.workTask.count({
      where: { id: { in: dependencyIds }, archivedAt: null, status: { not: TaskStatus.DONE } },
    });
    if (incompleteCount) {
      throw this.unprocessable(
        ErrorCodes.TASK_DEPENDENCY_INCOMPLETE,
        'A task cannot be completed before its dependencies',
      );
    }
  }

  private async assertNoDependencyCycle(
    tx: DatabaseClient,
    taskId: string,
    dependencyIds: string[],
  ) {
    const edges = await tx.taskDependency.findMany({
      where: { task: { archivedAt: null }, dependsOnTask: { archivedAt: null } },
      select: { taskId: true, dependsOnTaskId: true },
    });
    const adjacency = new Map<string, string[]>();
    for (const edge of edges) {
      if (edge.taskId === taskId) continue;
      adjacency.set(edge.taskId, [...(adjacency.get(edge.taskId) ?? []), edge.dependsOnTaskId]);
    }
    adjacency.set(taskId, dependencyIds);
    const reachesTask = (currentId: string, seen: Set<string>): boolean => {
      if (currentId === taskId) return true;
      if (seen.has(currentId)) return false;
      seen.add(currentId);
      return (adjacency.get(currentId) ?? []).some((nextId) => reachesTask(nextId, seen));
    };
    if (dependencyIds.some((dependencyId) => reachesTask(dependencyId, new Set()))) {
      throw this.unprocessable(
        ErrorCodes.TASK_DEPENDENCY_CYCLE,
        'Task dependencies cannot form a cycle',
      );
    }
  }

  private async assertActiveProject(tx: DatabaseClient, projectId: string) {
    const project = await tx.project.findFirst({
      where: { id: projectId, archivedAt: null },
      select: { id: true },
    });
    if (!project) throw this.notFound(ErrorCodes.PROJECT_NOT_FOUND, 'Project not found');
  }

  private async recalculateHealth(tx: DatabaseClient, projectId: string) {
    const now = new Date();
    const dueSoon = new Date(now);
    dueSoon.setDate(dueSoon.getDate() + 7);
    const activeStatuses: TaskStatus[] = [
      TaskStatus.TODO,
      TaskStatus.IN_PROGRESS,
      TaskStatus.BLOCKED,
    ];
    const [missedMilestones, dueSoonMilestones, overdueTasks, overdueCriticalTasks] =
      await Promise.all([
        tx.milestone.count({ where: { projectId, status: 'MISSED' } }),
        tx.milestone.count({
          where: {
            projectId,
            isCritical: true,
            plannedAt: { gte: now, lte: dueSoon },
            status: { in: ['PENDING', 'IN_PROGRESS'] },
          },
        }),
        tx.workTask.count({
          where: {
            projectId,
            archivedAt: null,
            dueAt: { lt: now },
            status: { in: activeStatuses },
          },
        }),
        tx.workTask.count({
          where: {
            projectId,
            archivedAt: null,
            priority: 'CRITICAL',
            dueAt: { lt: now },
            status: { in: activeStatuses },
          },
        }),
      ]);
    const health = this.projectHealthService.calculate({
      today: now,
      missedMilestones,
      dueSoonMilestones,
      overdueTasks,
      overdueCriticalTasks,
    });
    await tx.projectHealthSnapshot.create({
      data: { projectId, health: health.health, reasons: health.reasons },
    });
  }

  private notFound(code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string) {
    return new AppError({ code, message, statusCode: HttpStatus.NOT_FOUND });
  }

  private unprocessable(code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string) {
    return new AppError({ code, message, statusCode: HttpStatus.UNPROCESSABLE_ENTITY });
  }
}
