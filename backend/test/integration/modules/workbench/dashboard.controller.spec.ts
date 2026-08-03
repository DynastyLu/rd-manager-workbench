import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataScope, PrismaClient } from '@prisma/client';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { PERMISSIONS } from '../../../../src/modules/iam/domain/permission-catalog';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';
import { authenticatedRequest } from '../../../helpers/authenticated-request';

const localDay = (offset: number) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
};

const atLocalHour = (offset: number, hour: number) => {
  const date = localDay(offset);
  date.setHours(hour, 0, 0, 0);
  return date;
};

describe('Dashboard API', () => {
  const prefix = `TEST-DASHBOARD-${Date.now()}`;
  const prisma = new PrismaClient();
  let app: INestApplication;
  let authenticated: Awaited<ReturnType<typeof authenticatedRequest>>;
  let missingProjectRead: Awaited<ReturnType<typeof authenticatedRequest>>;
  let missingTaskRead: Awaited<ReturnType<typeof authenticatedRequest>>;
  let employeeA: Awaited<ReturnType<typeof authenticatedRequest>>;
  let employeeB: Awaited<ReturnType<typeof authenticatedRequest>>;
  let baselineHealthDistribution: { GREEN: number; YELLOW: number; RED: number };

  const createProject = (suffix: string, archivedAt: Date | null = null) =>
    prisma.project.create({
      data: {
        code: `${prefix}-${suffix}`,
        name: `${prefix}-${suffix}`,
        archivedAt,
      },
    });

  beforeAll(async () => {
    const { AppModule } = await import('../../../../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureBodyParser(app);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(app.get(HttpExceptionFilter));
    app.useGlobalInterceptors(app.get(ResponseInterceptor));
    await app.init();
    authenticated = await authenticatedRequest(app, prisma, `${prefix}-ROLE`, [
      { code: PERMISSIONS.PROJECT_READ, dataScope: DataScope.ALL },
      { code: PERMISSIONS.TASK_READ, dataScope: DataScope.ALL },
    ]);
    missingProjectRead = await authenticatedRequest(
      app,
      prisma,
      `${prefix}-MISSING-PROJECT-READ`,
      [{ code: PERMISSIONS.TASK_READ, dataScope: DataScope.ALL }],
    );
    missingTaskRead = await authenticatedRequest(app, prisma, `${prefix}-MISSING-TASK-READ`, [
      { code: PERMISSIONS.PROJECT_READ, dataScope: DataScope.ALL },
    ]);
    employeeA = await authenticatedRequest(app, prisma, `${prefix}-EMPLOYEE-A`, [
      { code: PERMISSIONS.PROJECT_READ, dataScope: DataScope.SELF },
      { code: PERMISSIONS.TASK_READ, dataScope: DataScope.SELF },
    ]);
    employeeB = await authenticatedRequest(app, prisma, `${prefix}-EMPLOYEE-B`, [
      { code: PERMISSIONS.PROJECT_READ, dataScope: DataScope.INVOLVED },
      { code: PERMISSIONS.TASK_READ, dataScope: DataScope.INVOLVED },
    ]);
  });

  afterAll(async () => {
    await prisma.workTask.deleteMany({ where: { title: { startsWith: prefix } } });
    await prisma.project.deleteMany({ where: { code: { startsWith: prefix } } });
    for (const fixture of [
      employeeB,
      employeeA,
      missingTaskRead,
      missingProjectRead,
      authenticated,
    ]) {
      if (!fixture) continue;
      await prisma.loginAudit.deleteMany({ where: { userId: fixture.user.id } });
      await prisma.authSession.deleteMany({ where: { userId: fixture.user.id } });
      await prisma.userRole.deleteMany({ where: { userId: fixture.user.id } });
      await prisma.rolePermission.deleteMany({ where: { roleId: fixture.role.id } });
      await prisma.user.delete({ where: { id: fixture.user.id } });
      await prisma.role.delete({ where: { id: fixture.role.id } });
      await prisma.resourceProfile.delete({ where: { id: fixture.employee.id } });
    }
    await prisma.$disconnect();
    await app?.close();
  });

  it('returns the standard response envelope and all dashboard bucket keys', async () => {
    const response = await authenticated.agent.get('/api/dashboard').expect(200);

    expect(response.body.success).toBe(true);
    expect(Object.keys(response.body.data).sort()).toEqual([
      'dueSoonMilestones',
      'healthDistribution',
      'overdueTasks',
      'projectsNeedingAttention',
      'recentProgressReports',
      'todayActions',
    ]);
    expect(response.body.data.todayActions).toEqual(expect.any(Array));
    expect(response.body.data.overdueTasks).toEqual(expect.any(Array));
    expect(response.body.data.dueSoonMilestones).toEqual(expect.any(Array));
    expect(response.body.data.projectsNeedingAttention).toEqual(expect.any(Array));
    expect(response.body.data.recentProgressReports).toEqual(expect.any(Array));
    expect(Object.keys(response.body.data.healthDistribution).sort()).toEqual([
      'GREEN',
      'RED',
      'YELLOW',
    ]);
    baselineHealthDistribution = response.body.data.healthDistribution;
  });

  it('requires both project.read and task.read through the real permission guard', async () => {
    for (const fixture of [missingProjectRead, missingTaskRead]) {
      const response = await fixture.agent.get('/api/dashboard').expect(403);
      expect(response.body).toMatchObject({
        success: false,
        error: { code: 'PERMISSION_DENIED' },
      });
    }
  });

  it('groups only in-window non-archived work and uses the latest health snapshot tie breaker', async () => {
    const greenProject = await createProject('GREEN');
    const attentionProject = await createProject('ATTENTION');
    const archivedProject = await createProject('ARCHIVED', atLocalHour(-1, 12));
    const tieCalculatedAt = atLocalHour(-1, 8);

    await prisma.workTask.createMany({
      data: [
        {
          projectId: greenProject.id,
          title: `${prefix} today`,
          status: 'TODO',
          dueAt: atLocalHour(0, 12),
        },
        {
          projectId: greenProject.id,
          title: `${prefix} blocked today`,
          status: 'BLOCKED',
          dueAt: atLocalHour(0, 16),
        },
        {
          projectId: greenProject.id,
          title: `${prefix} overdue`,
          status: 'IN_PROGRESS',
          dueAt: atLocalHour(-1, 12),
        },
        {
          projectId: greenProject.id,
          title: `${prefix} done today`,
          status: 'DONE',
          dueAt: atLocalHour(0, 13),
        },
        {
          projectId: greenProject.id,
          title: `${prefix} tomorrow`,
          status: 'TODO',
          dueAt: atLocalHour(1, 12),
        },
        {
          projectId: greenProject.id,
          title: `${prefix} archived task`,
          status: 'TODO',
          dueAt: atLocalHour(0, 14),
          archivedAt: atLocalHour(-1, 12),
        },
        {
          projectId: archivedProject.id,
          title: `${prefix} archived project task`,
          status: 'TODO',
          dueAt: atLocalHour(0, 15),
        },
      ],
    });

    await prisma.milestone.createMany({
      data: [
        {
          projectId: greenProject.id,
          name: `${prefix} today milestone`,
          plannedAt: atLocalHour(0, 9),
        },
        {
          projectId: greenProject.id,
          name: `${prefix} seventh day milestone`,
          plannedAt: atLocalHour(7, 9),
        },
        {
          projectId: greenProject.id,
          name: `${prefix} eighth day milestone`,
          plannedAt: atLocalHour(8, 9),
        },
        {
          projectId: greenProject.id,
          name: `${prefix} completed milestone`,
          plannedAt: atLocalHour(1, 9),
          status: 'COMPLETED',
        },
        {
          projectId: archivedProject.id,
          name: `${prefix} archived milestone`,
          plannedAt: atLocalHour(1, 9),
        },
      ],
    });

    await prisma.progressReport.createMany({
      data: [
        {
          projectId: attentionProject.id,
          summary: `${prefix} recent progress`,
          completionPercent: 50,
          reportedAt: atLocalHour(0, 10),
        },
        {
          projectId: archivedProject.id,
          summary: `${prefix} archived progress`,
          completionPercent: 10,
          reportedAt: atLocalHour(0, 11),
        },
      ],
    });

    await prisma.projectHealthSnapshot.createMany({
      data: [
        {
          projectId: attentionProject.id,
          health: 'GREEN',
          reasons: [],
          calculatedAt: atLocalHour(-2, 8),
        },
        {
          projectId: attentionProject.id,
          health: 'YELLOW',
          reasons: ['旧快照'],
          calculatedAt: tieCalculatedAt,
        },
        {
          projectId: attentionProject.id,
          health: 'RED',
          reasons: ['最新快照'],
          calculatedAt: tieCalculatedAt,
        },
        {
          projectId: archivedProject.id,
          health: 'RED',
          reasons: ['已归档'],
          calculatedAt: atLocalHour(0, 8),
        },
      ],
    });

    const response = await authenticated.agent.get('/api/dashboard').expect(200);
    const data = response.body.data;

    expect(
      data.todayActions.filter(({ title }: { title: string }) => title.startsWith(prefix)),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: `${prefix} today` }),
        expect.objectContaining({ title: `${prefix} blocked today` }),
      ]),
    );
    expect(
      data.todayActions.filter(({ title }: { title: string }) => title.startsWith(prefix)),
    ).toHaveLength(2);
    expect(
      data.overdueTasks.filter(({ title }: { title: string }) => title.startsWith(prefix)),
    ).toEqual([expect.objectContaining({ title: `${prefix} overdue` })]);
    expect(
      data.dueSoonMilestones.filter(({ name }: { name: string }) => name.startsWith(prefix)),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: `${prefix} today milestone` }),
        expect.objectContaining({ name: `${prefix} seventh day milestone` }),
      ]),
    );
    expect(
      data.dueSoonMilestones.filter(({ name }: { name: string }) => name.startsWith(prefix)),
    ).toHaveLength(2);
    expect(data.healthDistribution).toEqual({
      GREEN: baselineHealthDistribution.GREEN + 1,
      YELLOW: baselineHealthDistribution.YELLOW,
      RED: baselineHealthDistribution.RED + 1,
    });
    expect(data.projectsNeedingAttention).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: attentionProject.id,
          health: 'RED',
          reasons: ['最新快照'],
        }),
      ]),
    );
    expect(
      data.projectsNeedingAttention.filter(({ id }: { id: string }) => id === attentionProject.id),
    ).toHaveLength(1);
    expect(
      data.recentProgressReports.filter(({ summary }: { summary: string }) =>
        summary.startsWith(prefix),
      ),
    ).toEqual([
      expect.objectContaining({
        summary: `${prefix} recent progress`,
        projectId: attentionProject.id,
      }),
    ]);
  });

  it('isolates SELF and INVOLVED users from another employee project dashboard data', async () => {
    const [projectA, projectB] = await Promise.all([
      prisma.project.create({
        data: {
          code: `${prefix}-SCOPE-A`,
          name: `${prefix}-Scope-A`,
          ownerUserId: employeeA.user.id,
        },
      }),
      prisma.project.create({
        data: {
          code: `${prefix}-SCOPE-B`,
          name: `${prefix}-Scope-B`,
          ownerUserId: employeeB.user.id,
        },
      }),
    ]);
    const [taskA, taskB] = await Promise.all([
      prisma.workTask.create({
        data: {
          projectId: projectA.id,
          title: `${prefix} scope task A`,
          status: 'TODO',
          dueAt: atLocalHour(0, 12),
          ownerUserId: employeeA.user.id,
        },
      }),
      prisma.workTask.create({
        data: {
          projectId: projectB.id,
          title: `${prefix} scope task B`,
          status: 'TODO',
          dueAt: atLocalHour(0, 13),
          ownerUserId: employeeB.user.id,
        },
      }),
    ]);
    const [milestoneA, milestoneB] = await Promise.all([
      prisma.milestone.create({
        data: {
          projectId: projectA.id,
          name: `${prefix} scope milestone A`,
          plannedAt: atLocalHour(1, 9),
        },
      }),
      prisma.milestone.create({
        data: {
          projectId: projectB.id,
          name: `${prefix} scope milestone B`,
          plannedAt: atLocalHour(1, 10),
        },
      }),
    ]);
    const [progressA, progressB] = await Promise.all([
      prisma.progressReport.create({
        data: {
          projectId: projectA.id,
          summary: `${prefix} scope progress A`,
          completionPercent: 40,
          reportedAt: atLocalHour(0, 10),
        },
      }),
      prisma.progressReport.create({
        data: {
          projectId: projectB.id,
          summary: `${prefix} scope progress B`,
          completionPercent: 60,
          reportedAt: atLocalHour(0, 11),
        },
      }),
    ]);
    await prisma.projectHealthSnapshot.createMany({
      data: [
        {
          projectId: projectA.id,
          health: 'YELLOW',
          reasons: ['A'],
          calculatedAt: atLocalHour(0, 8),
        },
        {
          projectId: projectB.id,
          health: 'RED',
          reasons: ['B'],
          calculatedAt: atLocalHour(0, 8),
        },
      ],
    });

    const [dashboardA, dashboardB] = await Promise.all([
      employeeA.agent.get('/api/dashboard').expect(200),
      employeeB.agent.get('/api/dashboard').expect(200),
    ]);

    expect(dashboardA.body.data.todayActions.map(({ id }: { id: string }) => id)).toContain(taskA.id);
    expect(dashboardA.body.data.todayActions.map(({ id }: { id: string }) => id)).not.toContain(taskB.id);
    expect(dashboardA.body.data.dueSoonMilestones.map(({ id }: { id: string }) => id)).toContain(
      milestoneA.id,
    );
    expect(dashboardA.body.data.dueSoonMilestones.map(({ id }: { id: string }) => id)).not.toContain(
      milestoneB.id,
    );
    expect(
      dashboardA.body.data.projectsNeedingAttention.map(({ id }: { id: string }) => id),
    ).toContain(projectA.id);
    expect(
      dashboardA.body.data.projectsNeedingAttention.map(({ id }: { id: string }) => id),
    ).not.toContain(projectB.id);
    expect(
      dashboardA.body.data.recentProgressReports.map(({ id }: { id: string }) => id),
    ).toContain(progressA.id);
    expect(
      dashboardA.body.data.recentProgressReports.map(({ id }: { id: string }) => id),
    ).not.toContain(progressB.id);

    expect(dashboardB.body.data.todayActions.map(({ id }: { id: string }) => id)).toContain(taskB.id);
    expect(dashboardB.body.data.todayActions.map(({ id }: { id: string }) => id)).not.toContain(taskA.id);
    expect(dashboardB.body.data.dueSoonMilestones.map(({ id }: { id: string }) => id)).toContain(
      milestoneB.id,
    );
    expect(dashboardB.body.data.dueSoonMilestones.map(({ id }: { id: string }) => id)).not.toContain(
      milestoneA.id,
    );
    expect(
      dashboardB.body.data.projectsNeedingAttention.map(({ id }: { id: string }) => id),
    ).toContain(projectB.id);
    expect(
      dashboardB.body.data.projectsNeedingAttention.map(({ id }: { id: string }) => id),
    ).not.toContain(projectA.id);
    expect(
      dashboardB.body.data.recentProgressReports.map(({ id }: { id: string }) => id),
    ).toContain(progressB.id);
    expect(
      dashboardB.body.data.recentProgressReports.map(({ id }: { id: string }) => id),
    ).not.toContain(progressA.id);
  });
});
