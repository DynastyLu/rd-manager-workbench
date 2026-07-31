import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NonProjectRdKind, PrismaClient } from '@prisma/client';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';
import { authenticatedRequest } from '../../../helpers/authenticated-request';

describe('Non-project R&D API', () => {
  const prisma = new PrismaClient();
  const prefix = `TEST-NPRD-${Date.now()}`;
  let app: INestApplication;
  let authenticated: Awaited<ReturnType<typeof authenticatedRequest>>;

  beforeAll(async () => {
    const { AppModule } = await import('../../../../src/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ bodyParser: false });
    configureBodyParser(app);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(app.get(HttpExceptionFilter));
    app.useGlobalInterceptors(app.get(ResponseInterceptor));
    await app.init();
    authenticated = await authenticatedRequest(app, prisma, 'SUPER_ADMIN');
  });

  afterAll(async () => {
    await prisma.workTask.deleteMany({
      where: { sourceType: 'NON_PROJECT_RD', title: { startsWith: prefix } },
    });
    await prisma.nonProjectRdOutcome.deleteMany({
      where: { item: { code: { startsWith: prefix } } },
    });
    await prisma.nonProjectRdItem.deleteMany({ where: { code: { startsWith: prefix } } });
    if (authenticated) {
      await prisma.loginAudit.deleteMany({ where: { userId: authenticated.user.id } });
      await prisma.authSession.deleteMany({ where: { userId: authenticated.user.id } });
      await prisma.userRole.deleteMany({ where: { userId: authenticated.user.id } });
      await prisma.user.delete({ where: { id: authenticated.user.id } });
      await prisma.role.delete({ where: { id: authenticated.role.id } });
      await prisma.resourceProfile.delete({ where: { id: authenticated.employee.id } });
    }
    await prisma.$disconnect();
    await app.close();
  });

  it('runs the item, outcome, completion, project suggestion, and idempotent task lifecycle', async () => {
    const created = await authenticated.agent
      .post('/api/non-project-rd')
      .send({
        code: `${prefix}-01`,
        kind: NonProjectRdKind.TECH_EXPLORATION,
        title: `${prefix} PostgreSQL lab`,
        plannedStartAt: '2026-07-20T00:00:00.000Z',
        plannedEndAt: '2026-07-31T00:00:00.000Z',
      })
      .expect(201);
    const itemId = created.body.data.id as string;

    const outcome = await authenticated.agent
      .post(`/api/non-project-rd/${itemId}/outcomes`)
      .send({ title: `${prefix} benchmark`, status: 'VERIFIED' })
      .expect(201);

    await authenticated.agent
      .patch(`/api/non-project-rd/${itemId}/outcomes/${outcome.body.data.id}`)
      .send({ evidenceNote: 'Measured locally' })
      .expect(200);
    await authenticated.agent
      .patch(`/api/non-project-rd/${itemId}`)
      .send({ status: 'COMPLETED', objective: null })
      .expect(200);

    const filtered = await authenticated.agent
      .get('/api/non-project-rd')
      .query({
        q: prefix,
        kind: NonProjectRdKind.TECH_EXPLORATION,
        plannedFrom: '2026-07-21T00:00:00.000Z',
        plannedTo: '2026-07-22T00:00:00.000Z',
      })
      .expect(200);
    expect(filtered.body.data.data.map(({ id }: { id: string }) => id)).toContain(itemId);

    const suggestion = await authenticated.agent
      .post(`/api/non-project-rd/${itemId}/project-suggestion`)
      .expect(201);
    expect(suggestion.body.data).toMatchObject({
      code: `NPRD-${prefix}-01`,
      name: `${prefix} PostgreSQL lab`,
    });

    const firstTask = await authenticated.agent
      .post(`/api/non-project-rd/${itemId}/task`)
      .send({ title: `${prefix} task` })
      .expect(201);
    const secondTask = await authenticated.agent
      .post(`/api/non-project-rd/${itemId}/task`)
      .send({ title: `${prefix} duplicate` })
      .expect(201);
    expect(firstTask.body.data).toMatchObject({
      alreadyExists: false,
      task: { sourceType: 'NON_PROJECT_RD', sourceId: itemId },
      source: {
        path: `/library/operations?tab=non-project-rd&recordId=${itemId}`,
      },
    });
    expect(secondTask.body.data).toMatchObject({
      alreadyExists: true,
      task: { id: firstTask.body.data.task.id },
    });
    await expect(
      prisma.workTask.count({ where: { sourceType: 'NON_PROJECT_RD', sourceId: itemId } }),
    ).resolves.toBe(1);
  });

  it('serializes concurrent joins to My Work into one source task', async () => {
    const created = await authenticated.agent
      .post('/api/non-project-rd')
      .send({
        code: `${prefix}-CONCURRENT`,
        kind: NonProjectRdKind.TEMPORARY_SUPPORT,
        title: `${prefix} concurrent item`,
      })
      .expect(201);
    const itemId = created.body.data.id as string;

    const [left, right] = await Promise.all([
      authenticated.agent
        .post(`/api/non-project-rd/${itemId}/task`)
        .send({ title: `${prefix} concurrent task A` }),
      authenticated.agent
        .post(`/api/non-project-rd/${itemId}/task`)
        .send({ title: `${prefix} concurrent task B` }),
    ]);

    expect([left.status, right.status]).toEqual([201, 201]);
    expect([left.body.data.alreadyExists, right.body.data.alreadyExists].sort()).toEqual([
      false,
      true,
    ]);
    expect(left.body.data.task.id).toBe(right.body.data.task.id);
    await expect(
      prisma.workTask.count({ where: { sourceType: 'NON_PROJECT_RD', sourceId: itemId } }),
    ).resolves.toBe(1);
  });
});
