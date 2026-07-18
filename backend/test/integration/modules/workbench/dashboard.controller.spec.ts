import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';

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
  });

  afterAll(async () => {
    await prisma.workTask.deleteMany({ where: { title: { startsWith: prefix } } });
    await prisma.project.deleteMany({ where: { code: { startsWith: prefix } } });
    await prisma.$disconnect();
    await app?.close();
  });

  it('returns all empty dashboard buckets in the standard response envelope', async () => {
    const response = await request(app.getHttpServer()).get('/api/dashboard').expect(200);

    expect(response.body.success).toBe(true);
    expect(Object.keys(response.body.data).sort()).toEqual([
      'dueSoonMilestones',
      'healthDistribution',
      'overdueTasks',
      'projectsNeedingAttention',
      'recentProgressReports',
      'todayActions',
    ]);
    expect(response.body.data).toMatchObject({
      todayActions: [],
      overdueTasks: [],
      dueSoonMilestones: [],
      healthDistribution: { GREEN: 0, YELLOW: 0, RED: 0 },
      projectsNeedingAttention: [],
      recentProgressReports: [],
    });
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

    const response = await request(app.getHttpServer()).get('/api/dashboard').expect(200);
    const data = response.body.data;

    expect(data.todayActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: `${prefix} today` }),
        expect.objectContaining({ title: `${prefix} blocked today` }),
      ]),
    );
    expect(data.todayActions).toHaveLength(2);
    expect(data.overdueTasks).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: `${prefix} overdue` })]),
    );
    expect(data.overdueTasks).toHaveLength(1);
    expect(data.dueSoonMilestones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: `${prefix} today milestone` }),
        expect.objectContaining({ name: `${prefix} seventh day milestone` }),
      ]),
    );
    expect(data.dueSoonMilestones).toHaveLength(2);
    expect(data.healthDistribution).toEqual({ GREEN: 1, YELLOW: 0, RED: 1 });
    expect(data.projectsNeedingAttention).toEqual([
      expect.objectContaining({
        id: attentionProject.id,
        health: 'RED',
        reasons: ['最新快照'],
      }),
    ]);
    expect(data.recentProgressReports).toEqual([
      expect.objectContaining({
        summary: `${prefix} recent progress`,
        projectId: attentionProject.id,
      }),
    ]);
  });
});
