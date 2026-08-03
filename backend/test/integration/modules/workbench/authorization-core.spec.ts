import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataScope, PrismaClient } from '@prisma/client';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { PERMISSIONS } from '../../../../src/modules/iam/domain/permission-catalog';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';
import { authenticatedRequest } from '../../../helpers/authenticated-request';

describe('Workbench authorization core', () => {
  jest.setTimeout(60_000);

  const prefix = `TEST-AUTHZ-${Date.now()}`;
  const prisma = new PrismaClient();
  let app: INestApplication;
  let owner: Awaited<ReturnType<typeof authenticatedRequest>>;
  let peer: Awaited<ReturnType<typeof authenticatedRequest>>;
  let employeeId: string;
  let projectId: string;
  let taskId: string;

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

    owner = await authenticatedRequest(app, prisma, `${prefix}-OWNER`, [
      { code: PERMISSIONS.EMPLOYEE_READ, dataScope: DataScope.ALL },
      { code: PERMISSIONS.EMPLOYEE_UPDATE, dataScope: DataScope.ALL },
      { code: PERMISSIONS.EMPLOYEE_ARCHIVE, dataScope: DataScope.ALL },
      { code: PERMISSIONS.EMPLOYEE_DELETE, dataScope: DataScope.ALL },
      { code: PERMISSIONS.PROJECT_READ, dataScope: DataScope.ALL },
      { code: PERMISSIONS.PROJECT_CREATE, dataScope: DataScope.ALL },
      { code: PERMISSIONS.PROJECT_UPDATE, dataScope: DataScope.ALL },
      { code: PERMISSIONS.PROJECT_DELETE, dataScope: DataScope.ALL },
      { code: PERMISSIONS.TASK_READ, dataScope: DataScope.ALL },
      { code: PERMISSIONS.TASK_CREATE, dataScope: DataScope.ALL },
      { code: PERMISSIONS.TASK_UPDATE, dataScope: DataScope.ALL },
      { code: PERMISSIONS.TASK_DELETE, dataScope: DataScope.ALL },
    ]);

    peer = await authenticatedRequest(app, prisma, `${prefix}-PEER`, [
      { code: PERMISSIONS.EMPLOYEE_READ, dataScope: DataScope.SELF },
      { code: PERMISSIONS.EMPLOYEE_UPDATE, dataScope: DataScope.SELF },
      { code: PERMISSIONS.EMPLOYEE_ARCHIVE, dataScope: DataScope.SELF },
      { code: PERMISSIONS.EMPLOYEE_DELETE, dataScope: DataScope.SELF },
      { code: PERMISSIONS.PROJECT_READ, dataScope: DataScope.ALL },
      { code: PERMISSIONS.PROJECT_CREATE, dataScope: DataScope.SELF },
      { code: PERMISSIONS.PROJECT_UPDATE, dataScope: DataScope.SELF },
      { code: PERMISSIONS.PROJECT_DELETE, dataScope: DataScope.SELF },
      { code: PERMISSIONS.TASK_READ, dataScope: DataScope.ALL },
      { code: PERMISSIONS.TASK_CREATE, dataScope: DataScope.SELF },
      { code: PERMISSIONS.TASK_UPDATE, dataScope: DataScope.SELF },
      { code: PERMISSIONS.TASK_DELETE, dataScope: DataScope.SELF },
    ]);

    const employee = await owner.agent
      .post('/api/employees')
      .send({ displayName: `${prefix}-Employee` })
      .expect(201);
    employeeId = employee.body.data.id;

    const project = await owner.agent
      .post('/api/projects')
      .send({ code: `${prefix}-PROJECT`, name: `${prefix}-Project` })
      .expect(201);
    projectId = project.body.data.id;

    const task = await owner.agent
      .post('/api/tasks')
      .send({ title: `${prefix}-Task`, projectId })
      .expect(201);
    taskId = task.body.data.id;
  });

  afterAll(async () => {
    try {
      if (taskId) {
        await prisma.workTask.deleteMany({ where: { id: taskId } });
      }
      if (projectId) {
        await prisma.project.deleteMany({ where: { id: projectId } });
      }
      if (employeeId) {
        await prisma.resourceProfile.deleteMany({ where: { id: employeeId } });
      }

      for (const fixture of [peer, owner]) {
        if (!fixture) continue;
        await prisma.loginAudit.deleteMany({ where: { userId: fixture.user.id } });
        await prisma.authSession.deleteMany({ where: { userId: fixture.user.id } });
        await prisma.userRole.deleteMany({ where: { userId: fixture.user.id } });
        await prisma.rolePermission.deleteMany({ where: { roleId: fixture.role.id } });
        await prisma.user.delete({ where: { id: fixture.user.id } });
        await prisma.role.delete({ where: { id: fixture.role.id } });
        await prisma.resourceProfile.delete({ where: { id: fixture.employee.id } });
      }
    } finally {
      try {
        await prisma.$disconnect();
      } finally {
        await app?.close();
      }
    }
  });

  it('lists only self-scoped employees and excludes others', async () => {
    const peerList = await peer.agent
      .get('/api/employees')
      .query({ q: prefix, pageSize: 100 })
      .expect(200);
    expect(peerList.body.data.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: employeeId })]),
    );

    const ownerList = await owner.agent
      .get('/api/employees')
      .query({ q: prefix, pageSize: 100 })
      .expect(200);
    expect(ownerList.body.data.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: employeeId })]),
    );
  });

  it('returns 403 for an existing employee outside scope and 404 for a missing one', async () => {
    const getExisting = await peer.agent.get(`/api/employees/${employeeId}`).expect(403);
    expect(getExisting.body).toMatchObject({
      success: false,
      error: { code: 'PERMISSION_DENIED' },
    });

    const patchExisting = await peer.agent
      .patch(`/api/employees/${employeeId}`)
      .send({ roleTitle: 'hacker' })
      .expect(403);
    expect(patchExisting.body.error.code).toBe('PERMISSION_DENIED');

    const deleteExisting = await peer.agent.delete(`/api/employees/${employeeId}`).expect(403);
    expect(deleteExisting.body.error.code).toBe('PERMISSION_DENIED');

    const missing = await peer.agent.get('/api/employees/missing-employee-id').expect(404);
    expect(missing.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('allows organization-wide project reads while keeping project writes self-scoped', async () => {
    const peerList = await peer.agent
      .get('/api/projects')
      .query({ search: prefix, pageSize: 100 })
      .expect(200);
    expect(peerList.body.data.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: projectId })]),
    );

    const ownerList = await owner.agent
      .get('/api/projects')
      .query({ search: prefix, pageSize: 100 })
      .expect(200);
    expect(ownerList.body.data.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: projectId })]),
    );
  });

  it('returns 403 for project writes outside SELF scope while read remains allowed', async () => {
    await peer.agent.get(`/api/projects/${projectId}`).expect(200);

    const patchExisting = await peer.agent
      .patch(`/api/projects/${projectId}`)
      .send({ name: 'hijacked' })
      .expect(403);
    expect(patchExisting.body.error.code).toBe('PERMISSION_DENIED');

    const deleteExisting = await peer.agent.delete(`/api/projects/${projectId}`).expect(403);
    expect(deleteExisting.body.error.code).toBe('PERMISSION_DENIED');

    const missing = await peer.agent.get('/api/projects/missing-project-id').expect(404);
    expect(missing.body.error.code).toBe('HTTP_ERROR');
  });

  it('allows organization-wide task reads while keeping task writes self-scoped', async () => {
    const peerList = await peer.agent
      .get('/api/tasks')
      .query({ projectId, pageSize: 100 })
      .expect(200);
    expect(peerList.body.data.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: taskId })]),
    );

    const ownerList = await owner.agent
      .get('/api/tasks')
      .query({ projectId, pageSize: 100 })
      .expect(200);
    expect(ownerList.body.data.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: taskId })]),
    );
  });

  it('returns 403 for task writes outside SELF scope while read remains allowed', async () => {
    await peer.agent.get(`/api/tasks/${taskId}`).expect(200);

    const patchExisting = await peer.agent
      .patch(`/api/tasks/${taskId}`)
      .send({ title: 'hijacked' })
      .expect(403);
    expect(patchExisting.body.error.code).toBe('PERMISSION_DENIED');

    const deleteExisting = await peer.agent.delete(`/api/tasks/${taskId}`).expect(403);
    expect(deleteExisting.body.error.code).toBe('PERMISSION_DENIED');

    const missing = await peer.agent.get('/api/tasks/missing-task-id').expect(404);
    expect(missing.body.error.code).toBe('TASK_NOT_FOUND');
  });

  it('blocks project execution writes in inaccessible projects', async () => {
    const milestone = await peer.agent
      .post(`/api/projects/${projectId}/milestones`)
      .send({ name: `${prefix}-milestone` })
      .expect(403);
    expect(milestone.body.error.code).toBe('PERMISSION_DENIED');

    const report = await peer.agent
      .post(`/api/projects/${projectId}/progress-reports`)
      .send({ summary: `${prefix}-report`, reportedAt: '2026-07-18T00:00:00.000Z' })
      .expect(403);
    expect(report.body.error.code).toBe('PERMISSION_DENIED');

    const missingMilestone = await peer.agent
      .post('/api/projects/missing-project-id/milestones')
      .send({ name: `${prefix}-missing` })
      .expect(404);
    expect(missingMilestone.body.error.code).toBe('PROJECT_NOT_FOUND');
  });
});
