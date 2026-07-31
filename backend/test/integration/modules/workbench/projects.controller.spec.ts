import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataScope, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';
import { PERMISSIONS } from '../../../../src/modules/iam/domain/permission-catalog';
import { authenticatedRequest } from '../../../helpers/authenticated-request';

describe('Projects API', () => {
  const testCodePrefix = `TEST-PROJECTS-${Date.now()}`;
  const firstCode = `${testCodePrefix}-ONE`;
  const secondCode = `${testCodePrefix}-TWO`;
  const prisma = new PrismaClient();
  let app: INestApplication;
  let projectId: string;
  let authenticated: Awaited<ReturnType<typeof authenticatedRequest>>;

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
    authenticated = await authenticatedRequest(app, prisma, `${testCodePrefix}-ROLE`, [
      { code: PERMISSIONS.PROJECT_READ, dataScope: DataScope.ALL },
      { code: PERMISSIONS.PROJECT_CREATE, dataScope: DataScope.ALL },
      { code: PERMISSIONS.PROJECT_UPDATE, dataScope: DataScope.ALL },
      { code: PERMISSIONS.PROJECT_DELETE, dataScope: DataScope.ALL },
    ]);
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { code: { startsWith: testCodePrefix } } });
    if (authenticated) {
      await prisma.loginAudit.deleteMany({ where: { userId: authenticated.user.id } });
      await prisma.authSession.deleteMany({ where: { userId: authenticated.user.id } });
      await prisma.userRole.deleteMany({ where: { userId: authenticated.user.id } });
      await prisma.rolePermission.deleteMany({ where: { roleId: authenticated.role.id } });
      await prisma.user.delete({ where: { id: authenticated.user.id } });
      await prisma.role.delete({ where: { id: authenticated.role.id } });
      await prisma.resourceProfile.delete({ where: { id: authenticated.employee.id } });
    }
    await prisma.$disconnect();
    await app?.close();
  });

  it('rejects an anonymous project request with a stable authentication error', async () => {
    await request(app.getHttpServer())
      .get('/api/projects')
      .expect(401)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          success: false,
          error: { code: 'AUTH_REQUIRED' },
        });
      });
  });

  it('creates, lists, retrieves, updates, and archives projects using local PostgreSQL', async () => {
    const created = await authenticated.agent
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

    await authenticated.agent
      .post('/api/projects')
      .send({ code: secondCode, name: '第二个项目' })
      .expect(201);

    const listed = await authenticated.agent
      .get('/api/projects?page=1&pageSize=1&status=ACTIVE')
      .query({ search: firstCode })
      .expect(200);

    expect(listed.body).toMatchObject({
      success: true,
      data: {
        data: [expect.objectContaining({ id: projectId, code: firstCode, health: 'YELLOW' })],
        meta: { page: 1, pageSize: 1, total: 1 },
      },
    });

    const retrieved = await authenticated.agent
      .get(`/api/projects/${projectId}`)
      .expect(200);

    expect(retrieved.body.data).toMatchObject({
      id: projectId,
      milestones: [],
      tasks: [],
      progressReports: [],
      latestHealthSnapshot: { health: 'YELLOW', reasons: ['任务已逾期'] },
    });

    const updated = await authenticated.agent
      .patch(`/api/projects/${projectId}`)
      .send({ name: '更新后的项目', status: 'ON_HOLD', healthOverride: 'RED' })
      .expect(200);

    expect(updated.body.data).toMatchObject({
      name: '更新后的项目',
      status: 'ON_HOLD',
      healthOverride: 'RED',
    });

    const manuallyAssessed = await authenticated.agent
      .get(`/api/projects/${projectId}`)
      .expect(200);
    expect(manuallyAssessed.body.data).toMatchObject({
      effectiveHealth: 'RED',
      healthOverride: 'RED',
    });

    const automatic = await authenticated.agent
      .patch(`/api/projects/${projectId}`)
      .send({ healthOverride: null })
      .expect(200);
    expect(automatic.body.data.healthOverride).toBeNull();

    await authenticated.agent.delete(`/api/projects/${projectId}`).expect(204);

    const afterArchive = await authenticated.agent
      .get('/api/projects?status=ON_HOLD')
      .expect(200);

    expect(afterArchive.body.data.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: projectId })]),
    );
    await authenticated.agent.get(`/api/projects/${projectId}`).expect(404);
    await authenticated.agent.delete(`/api/projects/${projectId}`).expect(404);
  });

  it('rejects duplicate project codes with a stable application error code', async () => {
    await authenticated.agent
      .post('/api/projects')
      .send({ code: `${testCodePrefix}-DUPLICATE`, name: '第一个编码项目' })
      .expect(201);

    const duplicate = await authenticated.agent
      .post('/api/projects')
      .send({ code: `${testCodePrefix}-DUPLICATE`, name: '重复编码项目' })
      .expect(409);

    expect(duplicate.body).toMatchObject({
      success: false,
      error: { code: 'PROJECT_CODE_EXISTS' },
    });
  });

  it('rejects unknown fields and invalid project payloads', async () => {
    const invalid = await authenticated.agent
      .post('/api/projects')
      .send({ code: '   ', name: '', unexpected: true })
      .expect(400);

    expect(invalid.body).toMatchObject({ success: false, error: { code: 'HTTP_ERROR' } });
  });

  it('rejects null optional values rather than converting them into project data', async () => {
    await authenticated.agent
      .post('/api/projects')
      .send({
        code: `${testCodePrefix}-NULL-CREATE`,
        name: '空值创建校验',
        plannedStartAt: null,
        phase: null,
      })
      .expect(400);

    const created = await authenticated.agent
      .post('/api/projects')
      .send({ code: `${testCodePrefix}-NULL-UPDATE`, name: '空值更新校验' })
      .expect(201);

    await authenticated.agent
      .patch(`/api/projects/${created.body.data.id}`)
      .send({ plannedStartAt: null, phase: null })
      .expect(400);
  });

  it('includes completed milestones in project detail', async () => {
    const project = await prisma.project.create({
      data: { code: `${testCodePrefix}-COMPLETED-MILESTONE`, name: '完成里程碑详情' },
    });
    const milestone = await prisma.milestone.create({
      data: { projectId: project.id, name: '已完成验收', status: 'COMPLETED' },
    });

    const detail = await authenticated.agent
      .get(`/api/projects/${project.id}`)
      .expect(200);

    expect(detail.body.data.milestones).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: milestone.id, status: 'COMPLETED' })]),
    );
  });
});
