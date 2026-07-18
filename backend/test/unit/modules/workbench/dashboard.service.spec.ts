import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { DashboardService } from '../../../../src/modules/workbench/dashboard/application/dashboard.service';

describe('DashboardService', () => {
  it('returns every dashboard bucket with zero health distribution when no records exist', async () => {
    const prisma = {
      workTask: { findMany: jest.fn().mockResolvedValue([]) },
      milestone: { findMany: jest.fn().mockResolvedValue([]) },
      project: { findMany: jest.fn().mockResolvedValue([]) },
      progressReport: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PlatformPrismaService;
    const service = new DashboardService(prisma);

    await expect(service.getDashboard()).resolves.toEqual({
      todayActions: [],
      overdueTasks: [],
      dueSoonMilestones: [],
      healthDistribution: { GREEN: 0, YELLOW: 0, RED: 0 },
      projectsNeedingAttention: [],
      recentProgressReports: [],
    });
  });
});
