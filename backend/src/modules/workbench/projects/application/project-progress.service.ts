import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import {
  calculateMilestoneProgress,
  calculateProjectProgress,
  calculateScheduleProgress,
  type CompletionSource,
  type ProjectWeightMode,
  resolveMilestoneWeights,
  type ScheduleState,
} from '../domain/project-progress';

type DatabaseClient = PlatformPrismaService | Prisma.TransactionClient;

export interface CalculatedMilestoneProgress {
  id: string;
  completionPercent: number;
  completionSource: CompletionSource;
  effectiveWeightPercent: number;
  linkedTaskCount: number;
}

export interface ProjectProgressSummary {
  actualPercent: number | null;
  timePercent: number | null;
  variancePercent: number | null;
  scheduleState: ScheduleState;
  weightMode: ProjectWeightMode;
  currentMilestoneId: string | null;
  milestones: CalculatedMilestoneProgress[];
}

export interface ProgressRecalculationTrigger {
  sourceType: 'TASK_CHANGE' | 'MILESTONE_CHANGE' | 'SYSTEM_RECALCULATION';
  summary: string;
  taskId?: string;
  milestoneId?: string;
  now?: Date;
}

const toNumber = (value: Prisma.Decimal | number | null): number | null => {
  if (value === null) return null;
  return typeof value === 'number' ? value : value.toNumber();
};

@Injectable()
export class ProjectProgressService {
  async getSummary(
    client: DatabaseClient,
    projectId: string,
    now = new Date(),
  ): Promise<ProjectProgressSummary> {
    const [project, milestones] = await Promise.all([
      client.project.findFirst({
        where: { id: projectId, archivedAt: null },
        select: {
          id: true,
          plannedStartAt: true,
          plannedEndAt: true,
          weightMode: true,
        },
      }),
      client.milestone.findMany({
        where: { projectId },
        include: {
          tasks: {
            where: { archivedAt: null },
            select: { id: true, status: true, completionPercent: true },
          },
        },
        orderBy: [
          { plannedStartAt: 'asc' },
          { plannedEndAt: 'asc' },
          { id: 'asc' },
        ],
      }),
    ]);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const weightMode = project.weightMode as ProjectWeightMode;
    const weights = resolveMilestoneWeights(
      weightMode,
      milestones.map((milestone) => ({
        id: milestone.id,
        weightPercent: toNumber(milestone.weightPercent),
      })),
    );
    const calculatedMilestones = milestones.map((milestone) => {
      const progress = calculateMilestoneProgress({
        status: milestone.status,
        manualCompletionPercent: toNumber(milestone.manualCompletionPercent),
        tasks: milestone.tasks,
      });
      return {
        id: milestone.id,
        completionPercent: progress.percent,
        completionSource: progress.source,
        effectiveWeightPercent: weights.get(milestone.id) ?? 0,
        linkedTaskCount: progress.linkedTaskCount,
      };
    });
    const actualPercent = calculateProjectProgress(
      calculatedMilestones.map((milestone) => ({
        percent: milestone.completionPercent,
        effectiveWeightPercent: milestone.effectiveWeightPercent,
      })),
    );
    const schedule = calculateScheduleProgress({
      plannedStartAt: project.plannedStartAt,
      plannedEndAt: project.plannedEndAt,
      now,
      actualPercent,
    });
    const currentMilestone =
      milestones.find((milestone) => milestone.status === 'IN_PROGRESS') ??
      milestones.find((milestone) => milestone.status === 'PENDING') ??
      null;

    return {
      actualPercent,
      ...schedule,
      weightMode,
      currentMilestoneId: currentMilestone?.id ?? null,
      milestones: calculatedMilestones,
    };
  }

  async recalculate(
    client: DatabaseClient,
    projectId: string,
    trigger: ProgressRecalculationTrigger,
  ): Promise<ProjectProgressSummary> {
    await client.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'project-progress:' + projectId}))`,
    );
    const summary = await this.getSummary(client, projectId, trigger.now);
    if (summary.actualPercent === null) {
      return summary;
    }

    const latestReport = await client.progressReport.findFirst({
      where: { projectId },
      orderBy: [{ reportedAt: 'desc' }, { id: 'desc' }],
      select: { completionPercent: true },
    });
    const previousPercent = latestReport ? toNumber(latestReport.completionPercent) : 0;

    if (previousPercent === summary.actualPercent) {
      return summary;
    }

    await client.progressReport.create({
      data: {
        projectId,
        reportedAt: trigger.now ?? new Date(),
        summary: trigger.summary,
        completionPercent: Math.round(summary.actualPercent),
        previousPercent,
        sourceType: trigger.sourceType,
        ...(trigger.taskId ? { taskId: trigger.taskId } : {}),
        ...(trigger.milestoneId ? { milestoneId: trigger.milestoneId } : {}),
        changeSnapshot: {
          actualPercent: summary.actualPercent,
          timePercent: summary.timePercent,
          variancePercent: summary.variancePercent,
          scheduleState: summary.scheduleState,
          milestones: summary.milestones.map((milestone) => ({ ...milestone })),
        } as Prisma.InputJsonValue,
      },
    });

    return summary;
  }
}
