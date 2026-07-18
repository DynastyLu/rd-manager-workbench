import { Injectable } from '@nestjs/common';
import { Prisma, RiskLevel, RiskStatus, TaskStatus } from '@prisma/client';
import { ProjectHealthService } from './project-health.service';

type Transaction = Prisma.TransactionClient;

@Injectable()
export class ProjectHealthSnapshotService {
  constructor(private readonly projectHealthService: ProjectHealthService) {}

  async recalculate(tx: Transaction, projectId: string): Promise<void> {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`rd-manager-workbench:project-health:${projectId}`}))`,
    );
    const now = new Date();
    const dueSoon = new Date(now);
    dueSoon.setDate(dueSoon.getDate() + 7);
    const activeStatuses = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED];
    const [missedMilestones, dueSoonMilestones, overdueTasks, overdueCriticalTasks, openHighRisks] =
      await Promise.all([
        tx.milestone.count({ where: { projectId, status: 'MISSED' } }),
        tx.milestone.count({ where: { projectId, isCritical: true, plannedAt: { gte: now, lte: dueSoon }, status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
        tx.workTask.count({ where: { projectId, archivedAt: null, dueAt: { lt: now }, status: { in: activeStatuses } } }),
        tx.workTask.count({ where: { projectId, archivedAt: null, priority: 'CRITICAL', dueAt: { lt: now }, status: { in: activeStatuses } } }),
        tx.risk.count({ where: { projectId, archivedAt: null, status: { not: RiskStatus.CLOSED }, level: { in: [RiskLevel.HIGH, RiskLevel.CRITICAL] } } }),
      ]);
    const result = this.projectHealthService.calculate({
      today: now,
      missedMilestones,
      dueSoonMilestones,
      overdueTasks,
      overdueCriticalTasks,
      openHighRisks,
    });
    await tx.projectHealthSnapshot.create({ data: { projectId, health: result.health, reasons: result.reasons, calculatedAt: now } });
  }
}
