import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';

type DatabaseClient = PlatformPrismaService | Prisma.TransactionClient;
type PlanEntityType = 'TASK' | 'MILESTONE';

export interface CreatePlanBaselineInput {
  name?: string;
}

export interface ScheduleChangeInput {
  entityType: PlanEntityType;
  entityId: string;
  nextDate: string;
  reason: string;
}

interface PlanTask {
  id: string;
  projectId: string | null;
  milestoneId: string | null;
  title: string;
  status: string;
  dueAt: Date | null;
  dependencies: Array<{
    dependsOnTaskId: string;
    dependsOnTask: { projectId: string | null };
  }>;
}

interface LoadedPlan {
  id: string;
  name?: string;
  plannedStartAt?: Date | null;
  plannedEndAt?: Date | null;
  milestones: Array<{
    id: string;
    name: string;
    plannedAt: Date | null;
    plannedStartAt: Date | null;
    plannedEndAt: Date | null;
    isCritical: boolean;
  }>;
  tasks: PlanTask[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ProjectPlanService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  async createBaseline(projectId: string, input: CreatePlanBaselineInput = {}) {
    return this.prisma.$transaction(async (tx) => {
      const plan = await this.loadPlan(tx, projectId);
      const criticalPath = this.criticalPathForTasks(plan.tasks);
      const criticalIds = new Set(criticalPath.criticalTaskIds);
      const version = (await tx.projectPlanBaseline.count({ where: { projectId } })) + 1;

      return tx.projectPlanBaseline.create({
        data: {
          projectId,
          version,
          name: input.name?.trim() || `计划基线 V${version}`,
          projectPlannedStartAt: plan.plannedStartAt ?? null,
          projectPlannedEndAt: plan.plannedEndAt ?? null,
          milestoneSnapshots: {
            create: plan.milestones.map((milestone) => ({
              milestoneId: milestone.id,
              name: milestone.name,
              plannedAt: milestone.plannedAt,
              plannedStartAt: milestone.plannedStartAt,
              plannedEndAt: milestone.plannedEndAt,
              isCritical:
                milestone.isCritical ||
                plan.tasks.some(
                  (task) => task.milestoneId === milestone.id && criticalIds.has(task.id),
                ),
            })),
          },
          taskSnapshots: {
            create: plan.tasks.map((task) => ({
              taskId: task.id,
              milestoneId: task.milestoneId,
              title: task.title,
              status: task.status as never,
              dueAt: task.dueAt,
              dependencyIds: task.dependencies.map(({ dependsOnTaskId }) => dependsOnTaskId),
              isCritical: criticalIds.has(task.id),
            })),
          },
        },
        include: { milestoneSnapshots: true, taskSnapshots: true },
      });
    });
  }

  async listBaselines(projectId: string) {
    await this.assertProject(projectId);
    return this.prisma.projectPlanBaseline.findMany({
      where: { projectId },
      orderBy: [{ version: 'desc' }],
      include: {
        milestoneSnapshots: true,
        taskSnapshots: true,
        _count: { select: { milestoneSnapshots: true, taskSnapshots: true } },
      },
    });
  }

  async getBaseline(projectId: string, baselineId: string) {
    const baseline = await this.prisma.projectPlanBaseline.findFirst({
      where: { id: baselineId, projectId },
      include: { milestoneSnapshots: true, taskSnapshots: true },
    });
    if (!baseline) throw new NotFoundException('Project plan baseline not found');
    return baseline;
  }

  async listChanges(projectId: string) {
    await this.assertProject(projectId);
    return this.prisma.projectPlanChange.findMany({
      where: { projectId },
      orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
    });
  }

  async calculateCriticalPath(projectId: string) {
    const plan = await this.loadPlan(this.prisma, projectId);
    return this.criticalPathForTasks(plan.tasks);
  }

  async previewScheduleImpact(projectId: string, input: ScheduleChangeInput) {
    return this.previewScheduleImpactWithClient(this.prisma, projectId, input);
  }

  async applyScheduleChange(projectId: string, input: ScheduleChangeInput) {
    return this.prisma.$transaction(async (tx) => {
      const impact = await this.previewScheduleImpactWithClient(tx, projectId, input);
      if (input.entityType === 'TASK') {
        await tx.workTask.update({
          where: { id: input.entityId },
          data: { dueAt: new Date(input.nextDate) },
        });
      } else {
        await tx.milestone.update({
          where: { id: input.entityId },
          data: { plannedEndAt: new Date(input.nextDate) },
        });
      }
      const change = await tx.projectPlanChange.create({
        data: {
          projectId,
          entityType: input.entityType,
          entityId: input.entityId,
          field: impact.field,
          beforeValue: impact.beforeValue ?? Prisma.JsonNull,
          afterValue: impact.afterValue,
          reason: input.reason.trim(),
          impactPreview: impact as unknown as Prisma.InputJsonValue,
        },
      });
      return { change, impact };
    });
  }

  private async previewScheduleImpactWithClient(
    client: DatabaseClient,
    projectId: string,
    input: ScheduleChangeInput,
  ) {
    if (!input.reason.trim()) throw new BadRequestException('Schedule change reason is required');
    const nextDate = new Date(input.nextDate);
    if (Number.isNaN(nextDate.getTime())) throw new BadRequestException('Invalid schedule date');
    const plan = await this.loadPlan(client, projectId);
    const taskById = new Map(plan.tasks.map((task) => [task.id, task]));
    const criticalPath = this.criticalPathForTasks(plan.tasks);
    const criticalIds = new Set(criticalPath.criticalTaskIds);

    let currentDate: Date | null;
    let field: 'dueAt' | 'plannedEndAt';
    let seedTaskIds: string[];
    if (input.entityType === 'TASK') {
      const task = taskById.get(input.entityId);
      if (!task) throw new NotFoundException('Project task not found');
      currentDate = task.dueAt;
      field = 'dueAt';
      seedTaskIds = [task.id];
    } else {
      const milestone = plan.milestones.find((item) => item.id === input.entityId);
      if (!milestone) throw new NotFoundException('Project milestone not found');
      currentDate = milestone.plannedEndAt ?? milestone.plannedAt;
      field = 'plannedEndAt';
      seedTaskIds = plan.tasks
        .filter((task) => task.milestoneId === milestone.id)
        .map((task) => task.id);
    }

    const delayDays = currentDate
      ? Math.round((nextDate.getTime() - currentDate.getTime()) / DAY_MS)
      : 0;
    const affectedTaskIds = this.collectAffectedTaskIds(plan.tasks, seedTaskIds);
    const affectedTasks = affectedTaskIds.map((taskId) => {
      const task = taskById.get(taskId)!;
      const afterDueAt = taskId === input.entityId
        ? nextDate
        : task.dueAt && delayDays > 0
          ? new Date(task.dueAt.getTime() + delayDays * DAY_MS)
          : task.dueAt;
      return {
        id: task.id,
        title: task.title,
        beforeDueAt: task.dueAt?.toISOString() ?? null,
        afterDueAt: afterDueAt?.toISOString() ?? null,
        isCritical: criticalIds.has(task.id),
      };
    });

    return {
      entityType: input.entityType,
      entityId: input.entityId,
      field,
      beforeValue: currentDate?.toISOString() ?? null,
      afterValue: nextDate.toISOString(),
      delayDays,
      affectedTaskIds,
      affectedTasks,
      affectsCriticalPath: affectedTaskIds.some((id) => criticalIds.has(id)),
    };
  }

  private criticalPathForTasks(tasks: PlanTask[]) {
    this.assertDependencyProjects(tasks);
    if (!tasks.length) {
      return { criticalTaskIds: [], terminalTaskId: null, totalSteps: 0 };
    }
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const memo = new Map<string, string[]>();
    const visiting = new Set<string>();
    const pathTo = (taskId: string): string[] => {
      const cached = memo.get(taskId);
      if (cached) return cached;
      if (visiting.has(taskId)) throw new BadRequestException('Task dependencies contain a cycle');
      visiting.add(taskId);
      const task = taskById.get(taskId);
      if (!task) return [];
      const dependencyPaths = task.dependencies
        .map(({ dependsOnTaskId }) => pathTo(dependsOnTaskId))
        .sort((left, right) => right.length - left.length || left.join('/').localeCompare(right.join('/')));
      const path = [...(dependencyPaths[0] ?? []), taskId];
      visiting.delete(taskId);
      memo.set(taskId, path);
      return path;
    };
    const ranked = tasks
      .map((task) => ({ task, path: pathTo(task.id) }))
      .sort((left, right) =>
        right.path.length - left.path.length ||
        (right.task.dueAt?.getTime() ?? 0) - (left.task.dueAt?.getTime() ?? 0) ||
        left.task.id.localeCompare(right.task.id),
      );
    const critical = ranked[0];
    return {
      criticalTaskIds: critical.path,
      terminalTaskId: critical.task.id,
      totalSteps: critical.path.length,
    };
  }

  private collectAffectedTaskIds(tasks: PlanTask[], seedTaskIds: string[]) {
    const dependents = new Map<string, string[]>();
    for (const task of tasks) {
      for (const { dependsOnTaskId } of task.dependencies) {
        dependents.set(dependsOnTaskId, [...(dependents.get(dependsOnTaskId) ?? []), task.id]);
      }
    }
    const affected = new Set(seedTaskIds);
    const queue = [...seedTaskIds];
    while (queue.length) {
      const current = queue.shift()!;
      for (const dependentId of dependents.get(current) ?? []) {
        if (affected.has(dependentId)) continue;
        affected.add(dependentId);
        queue.push(dependentId);
      }
    }
    return tasks.map((task) => task.id).filter((taskId) => affected.has(taskId));
  }

  private assertDependencyProjects(tasks: PlanTask[]) {
    for (const task of tasks) {
      for (const dependency of task.dependencies) {
        if (dependency.dependsOnTask.projectId !== task.projectId) {
          throw new BadRequestException('Task dependency belongs to another project');
        }
      }
    }
  }

  private async loadPlan(client: DatabaseClient, projectId: string): Promise<LoadedPlan> {
    const project = await client.project.findFirst({
      where: { id: projectId, archivedAt: null },
      select: {
        id: true,
        name: true,
        plannedStartAt: true,
        plannedEndAt: true,
        milestones: {
          orderBy: [{ plannedEndAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            name: true,
            plannedAt: true,
            plannedStartAt: true,
            plannedEndAt: true,
            isCritical: true,
          },
        },
        tasks: {
          where: { archivedAt: null },
          orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            projectId: true,
            milestoneId: true,
            title: true,
            status: true,
            dueAt: true,
            dependencies: {
              select: {
                dependsOnTaskId: true,
                dependsOnTask: { select: { projectId: true } },
              },
            },
          },
        },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    const plan = project as unknown as LoadedPlan;
    this.assertDependencyProjects(plan.tasks);
    return plan;
  }

  private async assertProject(projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, archivedAt: null },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');
  }
}
