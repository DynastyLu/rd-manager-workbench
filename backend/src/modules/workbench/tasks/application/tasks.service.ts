import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, ReminderSourceType, TaskStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { ProjectHealthService } from '../../projects/application/project-health.service';
import { ProjectHealthSnapshotService } from '../../projects/application/project-health-snapshot.service';
import {
  ProjectProgressService,
  type ProgressRecalculationTrigger,
} from '../../projects/application/project-progress.service';
import { CreateMilestoneDto } from '../interface/http/dto/create-milestone.dto';
import { CreateProgressReportDto } from '../interface/http/dto/create-progress-report.dto';
import { CreateTaskDto } from '../interface/http/dto/create-task.dto';
import {
  ListMyWorkQueryDto,
  MyWorkView,
} from '../interface/http/dto/list-my-work-query.dto';
import { ListTasksQueryDto } from '../interface/http/dto/list-tasks-query.dto';
import { UpdateMilestoneDto } from '../interface/http/dto/update-milestone.dto';
import { UpdateProgressReportDto } from '../interface/http/dto/update-progress-report.dto';
import { UpdateTaskDto } from '../interface/http/dto/update-task.dto';
import { UpsertTaskLaterDto } from '../interface/http/dto/upsert-task-later.dto';
import { UpsertTaskReminderDto } from '../interface/http/dto/upsert-task-reminder.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
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
    private readonly healthSnapshotService?: ProjectHealthSnapshotService,
    private readonly projectProgressService?: ProjectProgressService,
  ) {}

  async createTask(dto: CreateTaskDto) {
    return this.prisma.$transaction(async (tx) => {
      return this.createTaskInTransaction(tx, dto);
    });
  }

  async createTaskInTransaction(tx: Prisma.TransactionClient, dto: CreateTaskDto) {
    this.assertCompleteSourceReference(dto.sourceType, dto.sourceId);
    await this.acquireTaskGraphLock(tx);
    await this.assertTaskReferences(tx, dto);
    await this.assertCompletionAllowed(tx, dto.status, dto.dependencyIds ?? []);
    await this.acquireProjectHealthLocks(tx, [dto.projectId]);
    const task = await tx.workTask.create({
        data: {
          title: dto.title,
          ...this.toTaskFields(dto),
          completionPercent: dto.status === TaskStatus.DONE ? 100 : (dto.completionPercent ?? 0),
          ...(dto.status === TaskStatus.DONE ? { completedAt: new Date() } : {}),
          ...(dto.dependencyIds?.length
            ? {
                dependencies: {
                  create: dto.dependencyIds.map((dependsOnTaskId) => ({ dependsOnTaskId })),
                },
              }
            : {}),
        },
        include: TASK_RESPONSE_INCLUDE,
    });
    if (task.projectId) {
      await this.recalculateHealth(tx, task.projectId);
      await this.recalculateProgress(tx, task.projectId, {
        sourceType: 'TASK_CHANGE',
        taskId: task.id,
        milestoneId: task.milestoneId ?? undefined,
        summary: `创建工作项：${task.title}`,
      });
    }
    return this.toTaskResponse(task);
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
        include: TASK_RESPONSE_INCLUDE,
      }),
      this.prisma.workTask.count({ where }),
    ]);
    return { data: data.map((task) => this.toTaskResponse(task)), meta: { page, pageSize, total } };
  }

  async getTask(id: string) {
    const task = await this.prisma.workTask.findFirst({
      where: { id, archivedAt: null },
      include: TASK_RESPONSE_INCLUDE,
    });
    if (!task) throw this.notFound(ErrorCodes.TASK_NOT_FOUND, 'Task not found');
    return this.toTaskResponse(task);
  }

  async listMyWork(query: ListMyWorkQueryDto, now = new Date()) {
    const data = await this.prisma.workTask.findMany({
      where: {
        ...this.buildMyWorkWhere(query.view, now),
        ...(query.projectId ? { projectId: query.projectId } : {}),
      },
      orderBy: [{ dueAt: 'asc' }, { updatedAt: 'desc' }, { id: 'desc' }],
      include: TASK_RESPONSE_INCLUDE,
    });
    return {
      data: data.map((task) => this.toTaskResponse(task)),
      meta: { page: 1, pageSize: data.length, total: data.length },
    };
  }

  async upsertLater(taskId: string, dto: UpsertTaskLaterDto) {
    await this.assertActionableTask(taskId);
    return this.prisma.taskLater.upsert({
      where: { taskId },
      create: { taskId, deferredUntil: new Date(dto.deferredUntil) },
      update: { deferredUntil: new Date(dto.deferredUntil) },
    });
  }

  async deleteLater(taskId: string): Promise<void> {
    await this.assertTaskExists(taskId);
    await this.prisma.taskLater.deleteMany({ where: { taskId } });
  }

  async upsertReminder(taskId: string, dto: UpsertTaskReminderDto) {
    await this.assertActionableTask(taskId);
    const remindAt = new Date(dto.remindAt);
    return this.prisma.$transaction(async (tx) => {
      const existingReminder = await tx.taskReminder.findUnique({
        where: { taskId },
        select: { remindAt: true },
      });
      if (existingReminder) {
        await this.archiveTaskReminderRule(tx, taskId, existingReminder.remindAt, new Date());
      }
      await tx.reminderRule.upsert({
        where: {
          sourceType_sourceId_remindAt: {
            sourceType: ReminderSourceType.TASK,
            sourceId: taskId,
            remindAt,
          },
        },
        create: {
          sourceType: ReminderSourceType.TASK,
          sourceId: taskId,
          remindAt,
        },
        update: { archivedAt: null },
      });
      return tx.taskReminder.upsert({
        where: { taskId },
        create: { taskId, remindAt },
        update: { remindAt, dismissedAt: null },
      });
    });
  }

  async deleteReminder(taskId: string): Promise<void> {
    await this.assertTaskExists(taskId);
    await this.prisma.$transaction(async (tx) => {
      const existingReminder = await tx.taskReminder.findUnique({
        where: { taskId },
        select: { remindAt: true },
      });
      await tx.taskReminder.deleteMany({ where: { taskId } });
      if (existingReminder) {
        await this.archiveTaskReminderRule(tx, taskId, existingReminder.remindAt, new Date());
      }
    });
  }

  async updateTask(id: string, dto: UpdateTaskDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireTaskGraphLock(tx);
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
        sourceType: dto.sourceType !== undefined ? dto.sourceType : existing.sourceType,
        sourceId: dto.sourceId !== undefined ? dto.sourceId : existing.sourceId,
      };
      this.assertCompleteSourceReference(merged.sourceType, merged.sourceId);
      await this.assertTaskReferences(tx, merged, id);
      await this.assertProjectMoveDoesNotSplitHierarchy(
        tx,
        existing.projectId,
        merged.projectId,
        id,
      );
      await this.assertCompletionAllowed(tx, merged.status, merged.dependencyIds);
      await this.acquireProjectHealthLocks(tx, [existing.projectId, merged.projectId]);
      if (dto.status === TaskStatus.DONE || dto.status === TaskStatus.CANCELLED) {
        await tx.taskReminder.deleteMany({ where: { taskId: id } });
        await tx.taskLater.deleteMany({ where: { taskId: id } });
        await this.archiveTaskReminderRules(tx, id, new Date());
      }
      const task = await tx.workTask.update({
        where: { id },
        data: {
          ...this.toTaskFields(dto),
          ...(dto.status === TaskStatus.DONE
            ? { completionPercent: 100 }
            : dto.completionPercent !== undefined
              ? { completionPercent: dto.completionPercent }
              : {}),
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
        include: TASK_RESPONSE_INCLUDE,
      });
      const healthProjectIds = [existing.projectId, task.projectId].filter(
        (projectId): projectId is string => Boolean(projectId),
      );
      for (const projectId of new Set(healthProjectIds))
        await this.recalculateHealth(tx, projectId);
      for (const projectId of new Set(healthProjectIds)) {
        await this.recalculateProgress(tx, projectId, {
          sourceType: 'TASK_CHANGE',
          taskId: task.id,
          milestoneId: task.milestoneId ?? existing.milestoneId ?? undefined,
          summary: `更新工作项：${task.title}`,
        });
      }
      return this.toTaskResponse(task);
    });
  }

  async archiveTask(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireTaskGraphLock(tx);
      const task = await tx.workTask.findFirst({ where: { id, archivedAt: null } });
      if (!task) throw this.notFound(ErrorCodes.TASK_NOT_FOUND, 'Task not found');
      await this.acquireProjectHealthLocks(tx, [task.projectId]);
      await tx.taskReminder.deleteMany({ where: { taskId: id } });
      await tx.taskLater.deleteMany({ where: { taskId: id } });
      await this.archiveTaskReminderRules(tx, id, new Date());
      await tx.workTask.update({ where: { id }, data: { archivedAt: new Date() } });
      if (task.projectId) {
        await this.recalculateHealth(tx, task.projectId);
        await this.recalculateProgress(tx, task.projectId, {
          sourceType: 'TASK_CHANGE',
          taskId: task.id,
          milestoneId: task.milestoneId ?? undefined,
          summary: `归档工作项：${task.title}`,
        });
      }
    });
  }

  async createMilestone(projectId: string, dto: CreateMilestoneDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireProjectHealthLocks(tx, [projectId]);
      await this.assertActiveProject(tx, projectId);
      this.assertMilestoneRange(dto.plannedStartAt, dto.plannedEndAt);
      const milestone = await tx.milestone.create({
        data: {
          projectId,
          name: dto.name,
          ...(dto.plannedAt !== undefined ? { plannedAt: new Date(dto.plannedAt) } : {}),
          ...(dto.plannedStartAt !== undefined
            ? { plannedStartAt: new Date(dto.plannedStartAt) }
            : {}),
          ...(dto.plannedEndAt !== undefined
            ? { plannedEndAt: new Date(dto.plannedEndAt) }
            : {}),
          ...(dto.actualAt !== undefined ? { actualAt: new Date(dto.actualAt) } : {}),
          ...(dto.ownerName !== undefined ? { ownerName: dto.ownerName } : {}),
          ...(dto.isCritical !== undefined ? { isCritical: dto.isCritical } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.weightPercent !== undefined ? { weightPercent: dto.weightPercent } : {}),
          ...(dto.manualCompletionPercent !== undefined
            ? { manualCompletionPercent: dto.manualCompletionPercent }
            : {}),
        },
      });
      await this.recalculateHealth(tx, projectId);
      await this.recalculateProgress(tx, projectId, {
        sourceType: 'MILESTONE_CHANGE',
        milestoneId: milestone.id,
        summary: `创建里程碑：${milestone.name}`,
      });
      return milestone;
    });
  }

  async updateMilestone(projectId: string, milestoneId: string, dto: UpdateMilestoneDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireProjectHealthLocks(tx, [projectId]);
      await this.assertActiveProject(tx, projectId);
      const milestone = await tx.milestone.findFirst({ where: { id: milestoneId, projectId } });
      if (!milestone) throw this.notFound(ErrorCodes.MILESTONE_NOT_FOUND, 'Milestone not found');
      this.assertMilestoneRange(
        dto.plannedStartAt ?? milestone.plannedStartAt?.toISOString(),
        dto.plannedEndAt ?? milestone.plannedEndAt?.toISOString(),
      );
      const updated = await tx.milestone.update({
        where: { id: milestoneId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.plannedAt !== undefined ? { plannedAt: new Date(dto.plannedAt) } : {}),
          ...(dto.plannedStartAt !== undefined
            ? { plannedStartAt: new Date(dto.plannedStartAt) }
            : {}),
          ...(dto.plannedEndAt !== undefined
            ? { plannedEndAt: new Date(dto.plannedEndAt) }
            : {}),
          ...(dto.actualAt !== undefined ? { actualAt: new Date(dto.actualAt) } : {}),
          ...(dto.ownerName !== undefined ? { ownerName: dto.ownerName } : {}),
          ...(dto.isCritical !== undefined ? { isCritical: dto.isCritical } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.weightPercent !== undefined ? { weightPercent: dto.weightPercent } : {}),
          ...(dto.manualCompletionPercent !== undefined
            ? { manualCompletionPercent: dto.manualCompletionPercent }
            : {}),
        },
      });
      await this.recalculateHealth(tx, projectId);
      await this.recalculateProgress(tx, projectId, {
        sourceType: 'MILESTONE_CHANGE',
        milestoneId: updated.id,
        summary: `更新里程碑：${updated.name}`,
      });
      return updated;
    });
  }

  async deleteMilestone(projectId: string, milestoneId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireProjectHealthLocks(tx, [projectId]);
      await this.assertActiveProject(tx, projectId);
      const milestone = await tx.milestone.findFirst({ where: { id: milestoneId, projectId } });
      if (!milestone) throw this.notFound(ErrorCodes.MILESTONE_NOT_FOUND, 'Milestone not found');
      await tx.milestone.delete({ where: { id: milestoneId } });
      await this.recalculateHealth(tx, projectId);
      await this.recalculateProgress(tx, projectId, {
        sourceType: 'MILESTONE_CHANGE',
        milestoneId,
        summary: `删除里程碑：${milestone.name}`,
      });
    });
  }

  async createProgressReport(projectId: string, dto: CreateProgressReportDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireProjectHealthLocks(tx, [projectId]);
      await this.assertActiveProject(tx, projectId);
      const progressSummary = await this.projectProgressService?.getSummary(tx, projectId);
      const report = await tx.progressReport.create({
        data: {
          projectId,
          summary: dto.summary,
          completionPercent: progressSummary?.actualPercent ?? 0,
          sourceType: 'MANUAL',
          reportedAt: new Date(dto.reportedAt),
          ...(dto.milestoneId !== undefined ? { milestoneId: dto.milestoneId } : {}),
          ...(dto.blockers !== undefined ? { blockers: dto.blockers } : {}),
          ...(dto.completedResults !== undefined
            ? { completedResults: dto.completedResults }
            : {}),
          ...(dto.nextSteps !== undefined ? { nextSteps: dto.nextSteps } : {}),
        },
      });
      await this.recalculateHealth(tx, projectId);
      return report;
    });
  }

  async updateProgressReport(
    projectId: string,
    reportId: string,
    dto: UpdateProgressReportDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireProjectHealthLocks(tx, [projectId]);
      await this.assertActiveProject(tx, projectId);
      const report = await tx.progressReport.findFirst({ where: { id: reportId, projectId } });
      if (!report) {
        throw this.notFound(ErrorCodes.PROGRESS_REPORT_NOT_FOUND, 'Progress report not found');
      }
      if (report.sourceType !== 'MANUAL') {
        throw new AppError({
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'System progress reports cannot be edited',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }
      const updated = await tx.progressReport.update({
        where: { id: reportId },
        data: {
          ...(dto.reportedAt !== undefined ? { reportedAt: new Date(dto.reportedAt) } : {}),
          ...(dto.summary !== undefined ? { summary: dto.summary } : {}),
          ...(dto.milestoneId !== undefined ? { milestoneId: dto.milestoneId } : {}),
          ...(dto.blockers !== undefined ? { blockers: dto.blockers } : {}),
          ...(dto.completedResults !== undefined
            ? { completedResults: dto.completedResults }
            : {}),
          ...(dto.nextSteps !== undefined ? { nextSteps: dto.nextSteps } : {}),
        },
      });
      await this.recalculateHealth(tx, projectId);
      return updated;
    });
  }

  async deleteProgressReport(projectId: string, reportId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireProjectHealthLocks(tx, [projectId]);
      await this.assertActiveProject(tx, projectId);
      const report = await tx.progressReport.findFirst({ where: { id: reportId, projectId } });
      if (!report) {
        throw this.notFound(ErrorCodes.PROGRESS_REPORT_NOT_FOUND, 'Progress report not found');
      }
      if (report.sourceType !== 'MANUAL') {
        throw new AppError({
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'System progress reports cannot be deleted',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }
      await tx.progressReport.delete({ where: { id: reportId } });
      await this.recalculateHealth(tx, projectId);
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
      ...(dto.completionPercent !== undefined
        ? { completionPercent: dto.completionPercent }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.dueAt !== undefined ? { dueAt: new Date(dto.dueAt) } : {}),
      ...(dto.sourceType !== undefined ? { sourceType: dto.sourceType } : {}),
      ...(dto.sourceId !== undefined ? { sourceId: dto.sourceId } : {}),
    };
  }

  private async recalculateProgress(
    client: Prisma.TransactionClient,
    projectId: string,
    trigger: ProgressRecalculationTrigger,
  ) {
    await this.projectProgressService?.recalculate(client, projectId, trigger);
  }

  private assertMilestoneRange(plannedStartAt?: string, plannedEndAt?: string) {
    if (
      plannedStartAt &&
      plannedEndAt &&
      new Date(plannedEndAt).getTime() < new Date(plannedStartAt).getTime()
    ) {
      throw new AppError({
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Milestone planned end must not be before planned start',
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }
  }

  private buildMyWorkWhere(view: MyWorkView, now: Date): Prisma.WorkTaskWhereInput {
    const activeTaskWhere: Prisma.WorkTaskWhereInput = {
      archivedAt: null,
      status: { in: ACTIVE_TASK_STATUSES },
    };
    const visibleOutsideLater: Prisma.WorkTaskWhereInput = {
      OR: [
        { later: { is: null } },
        { later: { is: { deferredUntil: { lte: now } } } },
      ],
    };
    const { dayStart, nextDayStart, weekStart, nextWeekStart } =
      this.getShanghaiBoundaries(now);

    switch (view) {
      case MyWorkView.INBOX:
        return { ...activeTaskWhere, dueAt: null, ...visibleOutsideLater };
      case MyWorkView.TODAY:
        return {
          ...activeTaskWhere,
          dueAt: { gte: dayStart, lt: nextDayStart },
          ...visibleOutsideLater,
        };
      case MyWorkView.WEEK:
        return {
          ...activeTaskWhere,
          dueAt: { gte: weekStart, lt: nextWeekStart },
          ...visibleOutsideLater,
        };
      case MyWorkView.OVERDUE:
        return { ...activeTaskWhere, dueAt: { lt: now }, ...visibleOutsideLater };
      case MyWorkView.LATER:
        return { ...activeTaskWhere, later: { isNot: null } };
      case MyWorkView.COMPLETED:
        return { archivedAt: null, status: TaskStatus.DONE };
    }
  }

  private getShanghaiBoundaries(now: Date) {
    const shiftedNow = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
    const dayStart = new Date(
      Date.UTC(
        shiftedNow.getUTCFullYear(),
        shiftedNow.getUTCMonth(),
        shiftedNow.getUTCDate(),
      ) - SHANGHAI_OFFSET_MS,
    );
    const daysSinceMonday = (shiftedNow.getUTCDay() + 6) % 7;
    const weekStart = new Date(dayStart.getTime() - daysSinceMonday * DAY_MS);
    return {
      dayStart,
      nextDayStart: new Date(dayStart.getTime() + DAY_MS),
      weekStart,
      nextWeekStart: new Date(weekStart.getTime() + 7 * DAY_MS),
    };
  }

  private async assertActionableTask(taskId: string): Promise<void> {
    const task = await this.prisma.workTask.findFirst({
      where: { id: taskId, archivedAt: null },
      select: { id: true, status: true },
    });
    if (!task) throw this.notFound(ErrorCodes.TASK_NOT_FOUND, 'Task not found');
    if (!ACTIVE_TASK_STATUSES.includes(task.status)) {
      throw this.unprocessable(
        ErrorCodes.TASK_INVALID_REFERENCE,
        'Completed or cancelled tasks cannot be deferred or reminded',
      );
    }
  }

  private async assertTaskExists(taskId: string): Promise<void> {
    const task = await this.prisma.workTask.findFirst({
      where: { id: taskId, archivedAt: null },
      select: { id: true },
    });
    if (!task) throw this.notFound(ErrorCodes.TASK_NOT_FOUND, 'Task not found');
  }

  private async archiveTaskReminderRules(
    tx: Prisma.TransactionClient,
    taskId: string,
    archivedAt: Date,
  ) {
    await tx.reminderRule.updateMany({
      where: {
        sourceType: ReminderSourceType.TASK,
        sourceId: taskId,
        archivedAt: null,
      },
      data: { archivedAt },
    });
  }

  private async archiveTaskReminderRule(
    tx: Prisma.TransactionClient,
    taskId: string,
    remindAt: Date,
    archivedAt: Date,
  ) {
    await tx.reminderRule.updateMany({
      where: {
        sourceType: ReminderSourceType.TASK,
        sourceId: taskId,
        remindAt,
        archivedAt: null,
      },
      data: { archivedAt },
    });
  }

  private assertCompleteSourceReference(sourceType: string | null | undefined, sourceId: string | null | undefined) {
    const normalizedType = sourceType?.trim();
    const normalizedId = sourceId?.trim();
    if (Boolean(normalizedType) !== Boolean(normalizedId)) {
      throw this.unprocessable(
        ErrorCodes.SOURCE_REFERENCE_INCOMPLETE,
        'Task sourceType and sourceId must be supplied together',
      );
    }
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
      if (taskId) await this.assertNoHierarchyCycle(tx, taskId, candidate.parentId);
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
    let frontier = dependencyIds;
    const visited = new Set<string>();
    while (frontier.length) {
      if (frontier.includes(taskId)) {
        throw this.unprocessable(
          ErrorCodes.TASK_DEPENDENCY_CYCLE,
          'Task dependencies cannot form a cycle',
        );
      }
      const batch = frontier.filter((taskId) => !visited.has(taskId));
      if (!batch.length) return;
      batch.forEach((taskId) => visited.add(taskId));
      const edges = await tx.taskDependency.findMany({
        where: {
          taskId: { in: batch },
          task: { archivedAt: null },
          dependsOnTask: { archivedAt: null },
        },
        select: { taskId: true, dependsOnTaskId: true },
      });
      frontier = edges.map(({ dependsOnTaskId }) => dependsOnTaskId);
    }
  }

  private async assertNoHierarchyCycle(tx: DatabaseClient, taskId: string, parentId: string) {
    let ancestorId: string | null = parentId;
    const visited = new Set<string>();
    while (ancestorId) {
      if (ancestorId === taskId || visited.has(ancestorId)) {
        throw this.unprocessable(
          ErrorCodes.TASK_INVALID_REFERENCE,
          'Task hierarchy cannot form a cycle',
        );
      }
      visited.add(ancestorId);
      const ancestor = await tx.workTask.findFirst({
        where: { id: ancestorId, archivedAt: null },
        select: { parentId: true },
      });
      if (!ancestor) throw this.notFound(ErrorCodes.TASK_NOT_FOUND, 'Parent task not found');
      ancestorId = ancestor.parentId;
    }
  }

  private async assertProjectMoveDoesNotSplitHierarchy(
    tx: DatabaseClient,
    currentProjectId: string | null,
    nextProjectId: string | null,
    taskId: string,
  ) {
    if (currentProjectId === nextProjectId) return;
    const childCount = await tx.workTask.count({ where: { parentId: taskId } });
    if (childCount) {
      throw this.unprocessable(
        ErrorCodes.TASK_INVALID_REFERENCE,
        'A task with children cannot move to another project',
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
    if (this.healthSnapshotService) {
      await this.healthSnapshotService.recalculate(tx as Prisma.TransactionClient, projectId);
      return;
    }
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
      openHighRisks: 0,
    });
    await tx.projectHealthSnapshot.create({
      data: { projectId, health: health.health, reasons: health.reasons, calculatedAt: now },
    });
  }

  private async acquireTaskGraphLock(tx: DatabaseClient) {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`rd-manager-workbench:task-graph`}))`,
    );
  }

  private async acquireProjectHealthLocks(
    tx: DatabaseClient,
    projectIds: Array<string | null | undefined>,
  ) {
    const sortedProjectIds = [
      ...new Set(projectIds.filter((projectId): projectId is string => Boolean(projectId))),
    ].sort();
    for (const projectId of sortedProjectIds) {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`rd-manager-workbench:project-health:${projectId}`}))`,
      );
    }
  }

  private toTaskResponse<T extends { dependencies: Array<{ dependsOnTaskId: string }> }>(task: T) {
    const { dependencies, ...taskFields } = task;
    return {
      ...taskFields,
      dependencyIds: dependencies.map(({ dependsOnTaskId }) => dependsOnTaskId),
    };
  }

  private notFound(code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string) {
    return new AppError({ code, message, statusCode: HttpStatus.NOT_FOUND });
  }

  private unprocessable(code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string) {
    return new AppError({ code, message, statusCode: HttpStatus.UNPROCESSABLE_ENTITY });
  }
}
