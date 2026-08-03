import { Injectable } from '@nestjs/common';
import { Prisma, ProjectHealth, TaskStatus } from '@prisma/client';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { DataScopeService } from '../../../iam/application/data-scope.service';

const ACTIVE_TASK_STATUSES = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED];

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly dataScope: DataScopeService,
    private readonly requestContext: RequestContextService,
  ) {}

  async getDashboard() {
    const principal = this.requestContext.requirePrincipal();
    const taskScope = this.dataScope.tasks(principal, 'task.read');
    const projectScope = this.dataScope.projects(principal, 'project.read');
    const { startOfToday, startOfTomorrow, startOfEighthDay } = this.getLocalDayBounds();
    const visibleTaskScope: Prisma.WorkTaskWhereInput = {
      archivedAt: null,
      AND: [
        taskScope,
        { OR: [{ projectId: null }, { project: { is: { archivedAt: null } } }] },
      ],
    };
    const visibleProjectScope: Prisma.ProjectWhereInput = {
      AND: [projectScope, { archivedAt: null }],
    };

    const [todayActions, overdueTasks, dueSoonMilestones, projects, recentProgressReports] =
      await Promise.all([
        this.prisma.workTask.findMany({
          where: {
            ...visibleTaskScope,
            status: { in: ACTIVE_TASK_STATUSES },
            dueAt: { gte: startOfToday, lt: startOfTomorrow },
          },
          orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
          include: { project: { select: { id: true, code: true, name: true } } },
        }),
        this.prisma.workTask.findMany({
          where: {
            ...visibleTaskScope,
            status: { in: ACTIVE_TASK_STATUSES },
            dueAt: { lt: startOfToday },
          },
          orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
          include: { project: { select: { id: true, code: true, name: true } } },
        }),
        this.prisma.milestone.findMany({
          where: {
            plannedAt: { gte: startOfToday, lt: startOfEighthDay },
            status: { not: 'COMPLETED' },
            project: { is: visibleProjectScope },
          },
          orderBy: [{ plannedAt: 'asc' }, { id: 'asc' }],
          include: { project: { select: { id: true, code: true, name: true } } },
        }),
        this.prisma.project.findMany({
          where: visibleProjectScope,
          select: {
            id: true,
            code: true,
            name: true,
            healthSnapshots: {
              orderBy: [{ calculatedAt: 'desc' }, { id: 'desc' }],
              take: 1,
              select: { health: true, reasons: true, calculatedAt: true },
            },
          },
        }),
        this.prisma.progressReport.findMany({
          where: { project: { is: visibleProjectScope } },
          orderBy: [{ reportedAt: 'desc' }, { id: 'desc' }],
          take: 10,
          include: { project: { select: { id: true, code: true, name: true } } },
        }),
      ]);

    const latestProjectHealth = projects.map((project) => {
      const snapshot = project.healthSnapshots[0];
      return {
        id: project.id,
        code: project.code,
        name: project.name,
        health: snapshot?.health ?? ProjectHealth.GREEN,
        reasons: this.toReasons(snapshot?.reasons),
        calculatedAt: snapshot?.calculatedAt ?? null,
      };
    });

    const healthDistribution = latestProjectHealth.reduce(
      (distribution, project) => ({
        ...distribution,
        [project.health]: distribution[project.health] + 1,
      }),
      { GREEN: 0, YELLOW: 0, RED: 0 } as Record<ProjectHealth, number>,
    );

    return {
      todayActions,
      overdueTasks,
      dueSoonMilestones,
      healthDistribution,
      projectsNeedingAttention: latestProjectHealth
        .filter(({ health }) => health === ProjectHealth.YELLOW || health === ProjectHealth.RED)
        .sort(
          (left, right) =>
            (right.calculatedAt?.getTime() ?? 0) - (left.calculatedAt?.getTime() ?? 0) ||
            right.id.localeCompare(left.id),
        ),
      recentProgressReports,
    };
  }

  private getLocalDayBounds() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const startOfEighthDay = new Date(startOfToday);
    startOfEighthDay.setDate(startOfEighthDay.getDate() + 8);

    return { startOfToday, startOfTomorrow, startOfEighthDay };
  }

  private toReasons(value: Prisma.JsonValue | undefined) {
    return Array.isArray(value)
      ? value.filter((reason): reason is string => typeof reason === 'string')
      : [];
  }
}
