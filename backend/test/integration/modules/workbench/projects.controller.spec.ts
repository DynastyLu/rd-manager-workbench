import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';

describe('Projects API', () => {
  const testCodePrefix = `TEST-PROJECTS-${Date.now()}`;
  const firstCode = `${testCodePrefix}-ONE`;
  const secondCode = `${testCodePrefix}-TWO`;
  const prisma = new PrismaClient();
  let app: INestApplication;
  let projectId: string;

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
    await prisma.project.deleteMany({ where: { code: { startsWith: testCodePrefix } } });
    await prisma.$disconnect();
    await app?.close();
  });

  it('creates, lists, retrieves, updates, and archives projects using local PostgreSQL', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/projects')
      .send({
        code: ` ${firstCode} `,
        name: ' 本地项目 ',
        type: '技术攻关',
        leadName: '研发主管',
        participantNames: ['成员甲', '成员乙'],
        phase: 'DEVELOPMENT',
        status: 'ACTIVE',
        plannedStartAt: '2026-07-01T00:00:00.000Z',
        plannedEndAt: '2026-08-01T00:00:00.000Z',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      success: true,
      data: {
        code: firstCode,
        name: '本地项目',
        phase: 'DEVELOPMENT',
        status: 'ACTIVE',
      },
    });
    projectId = created.body.data.id;

    await prisma.projectHealthSnapshot.create({
      data: {
        projectId,
        health: 'YELLOW',
        reasons: ['任务已逾期'],
      },
    });

    await request(app.getHttpServer())
      .post('/api/projects')
      .send({ code: secondCode, name: '第二个项目' })
      .expect(201);

    const listed = await request(app.getHttpServer())
      .get('/api/projects?page=1&pageSize=1&status=ACTIVE')
      .expect(200);

    expect(listed.body).toMatchObject({
      success: true,
      data: {
        data: [expect.objectContaining({ id: projectId, code: firstCode })],
        meta: { page: 1, pageSize: 1, total: 1 },
      },
    });

    const retrieved = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}`)
      .expect(200);

    expect(retrieved.body.data).toMatchObject({
      id: projectId,
      milestones: [],
      tasks: [],
      progressReports: [],
      latestHealthSnapshot: { health: 'YELLOW', reasons: ['任务已逾期'] },
    });

    const updated = await request(app.getHttpServer())
      .patch(`/api/projects/${projectId}`)
      .send({ name: '更新后的项目', status: 'ON_HOLD' })
      .expect(200);

    expect(updated.body.data).toMatchObject({ name: '更新后的项目', status: 'ON_HOLD' });

    await request(app.getHttpServer()).delete(`/api/projects/${projectId}`).expect(204);

    const afterArchive = await request(app.getHttpServer())
      .get('/api/projects?status=ON_HOLD')
      .expect(200);

    expect(afterArchive.body.data.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: projectId })]),
    );
    await request(app.getHttpServer()).get(`/api/projects/${projectId}`).expect(404);
    await request(app.getHttpServer()).delete(`/api/projects/${projectId}`).expect(404);
  });

  it('rejects duplicate project codes with a stable application error code', async () => {
    await request(app.getHttpServer())
      .post('/api/projects')
      .send({ code: `${testCodePrefix}-DUPLICATE`, name: '第一个编码项目' })
      .expect(201);

    const duplicate = await request(app.getHttpServer())
      .post('/api/projects')
      .send({ code: `${testCodePrefix}-DUPLICATE`, name: '重复编码项目' })
      .expect(409);

    expect(duplicate.body).toMatchObject({
      success: false,
      error: { code: 'PROJECT_CODE_EXISTS' },
    });
  });

  it('rejects unknown fields and invalid project payloads', async () => {
    const invalid = await request(app.getHttpServer())
      .post('/api/projects')
      .send({ code: '   ', name: '', unexpected: true })
      .expect(400);

    expect(invalid.body).toMatchObject({ success: false, error: { code: 'HTTP_ERROR' } });
  });
});
