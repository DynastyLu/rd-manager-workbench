import { Injectable } from '@nestjs/common';
import { ProjectHealth } from '@prisma/client';

export interface ProjectHealthInput {
  today: Date;
  overdueCriticalTasks: number;
  missedMilestones: number;
  dueSoonMilestones: number;
  overdueTasks: number;
}

export interface ProjectHealthResult {
  health: ProjectHealth;
  reasons: string[];
}

@Injectable()
export class ProjectHealthService {
  calculate(input: ProjectHealthInput): ProjectHealthResult {
    if (input.missedMilestones > 0 || input.overdueCriticalTasks > 0) {
      return {
        health: ProjectHealth.RED,
        reasons: [
          ...(input.missedMilestones > 0 ? [`${input.missedMilestones} 个里程碑已延期`] : []),
          ...(input.overdueCriticalTasks > 0
            ? [`${input.overdueCriticalTasks} 项关键任务逾期`]
            : []),
        ],
      };
    }

    if (input.overdueTasks > 0 || input.dueSoonMilestones > 0) {
      return {
        health: ProjectHealth.YELLOW,
        reasons: [
          ...(input.overdueTasks > 0 ? [`${input.overdueTasks} 项任务逾期`] : []),
          ...(input.dueSoonMilestones > 0 ? [`${input.dueSoonMilestones} 个关键里程碑临期`] : []),
        ],
      };
    }

    return { health: ProjectHealth.GREEN, reasons: [] };
  }
}
