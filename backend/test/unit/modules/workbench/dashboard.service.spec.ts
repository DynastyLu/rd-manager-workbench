import { DataScopeService } from '../../../../src/modules/iam/application/data-scope.service';
import { PERMISSIONS } from '../../../../src/modules/iam/domain/permission-catalog';
import type { AuthenticatedPrincipal } from '../../../../src/modules/iam/domain/principal';
import { RequestContextService } from '../../../../src/infrastructure/context/request-context.service';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { DashboardService } from '../../../../src/modules/workbench/dashboard/application/dashboard.service';
import { DashboardController } from '../../../../src/modules/workbench/dashboard/interface/http/dashboard.controller';
import { REQUIRED_PERMISSIONS_KEY } from '../../../../src/modules/iam/interface/http/permissions.decorator';

describe('DashboardService', () => {
  const principal: AuthenticatedPrincipal = {
    userId: 'employee-a-user',
    employeeId: 'employee-a',
    username: 'employee-a',
    sessionId: 'session-a',
    mustChangePassword: false,
    roleCodes: ['EMPLOYEE'],
    permissions: [],
    permissionVersion: 1,
  };

  it('returns every dashboard bucket with zero health distribution when no records exist', async () => {
    const prisma = {
      workTask: { findMany: jest.fn().mockResolvedValue([]) },
      milestone: { findMany: jest.fn().mockResolvedValue([]) },
      project: { findMany: jest.fn().mockResolvedValue([]) },
      progressReport: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PlatformPrismaService;
    const dataScope = {
      tasks: jest.fn().mockReturnValue({}),
      projects: jest.fn().mockReturnValue({}),
    } as unknown as DataScopeService;
    const requestContext = {
      requirePrincipal: jest.fn().mockReturnValue(principal),
    } as unknown as RequestContextService;
    const service = new DashboardService(prisma, dataScope, requestContext);

    await expect(service.getDashboard()).resolves.toEqual({
      todayActions: [],
      overdueTasks: [],
      dueSoonMilestones: [],
      healthDistribution: { GREEN: 0, YELLOW: 0, RED: 0 },
      projectsNeedingAttention: [],
      recentProgressReports: [],
    });
  });

  it('applies the current principal task and project scopes to every dashboard query', async () => {
    const taskScope = { OR: [{ ownerUserId: principal.userId }] };
    const projectScope = { OR: [{ ownerUserId: principal.userId }] };
    const visibleProjectScope = { AND: [projectScope, { archivedAt: null }] };
    const prisma = {
      workTask: { findMany: jest.fn().mockResolvedValue([]) },
      milestone: { findMany: jest.fn().mockResolvedValue([]) },
      project: { findMany: jest.fn().mockResolvedValue([]) },
      progressReport: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PlatformPrismaService;
    const dataScope = {
      tasks: jest.fn().mockReturnValue(taskScope),
      projects: jest.fn().mockReturnValue(projectScope),
    } as unknown as DataScopeService;
    const requestContext = {
      requirePrincipal: jest.fn().mockReturnValue(principal),
    } as unknown as RequestContextService;
    const service = new DashboardService(prisma, dataScope, requestContext);

    await service.getDashboard();

    expect(requestContext.requirePrincipal).toHaveBeenCalledTimes(1);
    expect(dataScope.tasks).toHaveBeenCalledWith(principal, 'task.read');
    expect(dataScope.projects).toHaveBeenCalledWith(principal, 'project.read');
    expect(prisma.workTask.findMany).toHaveBeenCalledTimes(2);
    for (const [query] of (prisma.workTask.findMany as jest.Mock).mock.calls) {
      expect(query.where).toEqual(
        expect.objectContaining({
          archivedAt: null,
          AND: expect.arrayContaining([taskScope]),
        }),
      );
    }
    expect(prisma.milestone.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          project: { is: visibleProjectScope },
        }),
      }),
    );
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: visibleProjectScope,
      }),
    );
    expect(prisma.progressReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          project: { is: visibleProjectScope },
        },
      }),
    );
  });

  it('declares the project and task read permissions on the dashboard endpoint', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        DashboardController.prototype.getDashboard,
      ),
    ).toEqual([PERMISSIONS.PROJECT_READ, PERMISSIONS.TASK_READ]);
  });
});
