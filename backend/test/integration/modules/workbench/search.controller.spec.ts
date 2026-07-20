import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';

describe('Global search API', () => {
  const prefix = `TEST-SEARCH-${Date.now()}`;
  const prisma = new PrismaClient();
  let app: INestApplication;
  let projectId: string;
  let taskId: string;
  let documentId: string;
  let riskId: string;
  let nonProjectRdId: string;

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

    const project = await prisma.project.create({
      data: { code: `${prefix}-P`, name: `${prefix} 研发计划` },
    });
    projectId = project.id;
    const task = await prisma.workTask.create({
      data: { projectId, title: `${prefix} 研发任务`, status: 'TODO' },
    });
    taskId = task.id;
    const document = await prisma.contentDocument.create({
      data: { type: 'DOCUMENT', title: `${prefix} 研发文档`, plainText: '研发计划正文' },
    });
    documentId = document.id;
    const risk = await prisma.risk.create({
      data: {
        projectId,
        title: `${prefix} 研发风险`,
        likelihood: 'MEDIUM',
        impact: 'MEDIUM',
        level: 'MEDIUM',
      },
    });
    riskId = risk.id;
    const nonProjectRd = await prisma.nonProjectRdItem.create({
      data: {
        code: `${prefix}-NPR`,
        kind: 'TECH_EXPLORATION',
        title: `${prefix} 非项目预研`,
        objective: '验证统一搜索',
      },
    });
    nonProjectRdId = nonProjectRd.id;
  });

  afterAll(async () => {
    await prisma.nonProjectRdItem.deleteMany({ where: { id: nonProjectRdId } });
    await prisma.risk.deleteMany({ where: { id: riskId } });
    await prisma.contentDocument.deleteMany({ where: { id: documentId } });
    await prisma.workTask.deleteMany({ where: { id: taskId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.$disconnect();
    await app?.close();
  });

  it('searches multiple real object types with groups and safe paths', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/search')
      .query({
        q: prefix,
        types: 'PROJECT,TASK,DOCUMENT,RISK,NON_PROJECT_RD',
        page: 1,
        pageSize: 20,
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.data.map(({ type }: { type: string }) => type)).toEqual(
      expect.arrayContaining(['PROJECT', 'TASK', 'DOCUMENT', 'RISK', 'NON_PROJECT_RD']),
    );
    expect(response.body.data.groups).toEqual(
      expect.arrayContaining([
        { type: 'PROJECT', count: 1 },
        { type: 'TASK', count: 1 },
        { type: 'DOCUMENT', count: 1 },
        { type: 'RISK', count: 1 },
        { type: 'NON_PROJECT_RD', count: 1 },
      ]),
    );
    expect(
      response.body.data.data.every(({ path }: { path: string }) =>
        /^\/(?!\/)/u.test(path),
      ),
    ).toBe(true);
  });

  it('validates query and type filters', async () => {
    await request(app.getHttpServer()).get('/api/search').query({ q: 'a' }).expect(400);
    await request(app.getHttpServer())
      .get('/api/search')
      .query({ q: prefix, types: 'NOT_A_TYPE' })
      .expect(400);
  });

  it('runs task and risk actions through the real domain services', async () => {
    const taskResponse = await request(app.getHttpServer())
      .post(`/api/search/actions/TASK/${taskId}`)
      .send({ action: 'COMPLETE_TASK' })
      .expect(201);
    expect(taskResponse.body.data.actions).toContain('REOPEN_TASK');
    await expect(prisma.workTask.findUniqueOrThrow({ where: { id: taskId } })).resolves.toMatchObject(
      { status: 'DONE' },
    );

    await request(app.getHttpServer())
      .post(`/api/search/actions/RISK/${riskId}`)
      .send({ action: 'CLOSE_RISK' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/search/actions/RISK/${riskId}`)
      .send({ action: 'CLOSE_RISK', confirm: true })
      .expect(201);
    await expect(prisma.risk.findUniqueOrThrow({ where: { id: riskId } })).resolves.toMatchObject({
      status: 'CLOSED',
    });
  });
});
