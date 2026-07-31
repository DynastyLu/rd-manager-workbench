import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataScope, PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';
import { authenticatedRequest } from '../../../helpers/authenticated-request';

describe('Workbench authorization administration', () => {
  const prisma = new PrismaClient();
  const prefix = `TEST-AUTHZ-${Date.now()}`;
  let app: INestApplication;
  let employee: Awaited<ReturnType<typeof authenticatedRequest>>;
  let departmentManager: Awaited<ReturnType<typeof authenticatedRequest>>;
  let admin: Awaited<ReturnType<typeof authenticatedRequest>>;
  const departments = {
    alpha: `${prefix}-ALPHA`,
    beta: `${prefix}-BETA`,
  };

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

    const employeeRole = `${prefix}-EMPLOYEE`;
    employee = await authenticatedRequest(app, prisma, employeeRole, [
      { code: 'report.read', dataScope: DataScope.SELF },
      { code: 'task.read', dataScope: DataScope.SELF },
    ]);
    await prisma.resourceProfile.update({
      where: { id: employee.employee.id },
      data: { department: departments.alpha },
    });

    admin = await authenticatedRequest(app, prisma, 'SUPER_ADMIN');

    const managerRole = `${prefix}-DEPT-MANAGER`;
    departmentManager = await authenticatedRequest(app, prisma, managerRole, [
      { code: 'report.read', dataScope: DataScope.DEPARTMENT, scopeConfig: { departmentNames: [departments.alpha] } },
      { code: 'task.read', dataScope: DataScope.DEPARTMENT, scopeConfig: { departmentNames: [departments.alpha] } },
    ]);
    await prisma.resourceProfile.update({
      where: { id: departmentManager.employee.id },
      data: { department: departments.alpha },
    });
  });

  afterAll(async () => {
    await prisma.workTask.deleteMany({ where: { title: { startsWith: prefix } } });
    await prisma.project.deleteMany({ where: { code: { startsWith: prefix } } });

    const fixtureUsers = [employee?.user.id, departmentManager?.user.id, admin?.user.id].filter(
      (id): id is string => Boolean(id),
    );
    if (fixtureUsers.length > 0) {
      await prisma.loginAudit.deleteMany({ where: { userId: { in: fixtureUsers } } });
      await prisma.authSession.deleteMany({ where: { userId: { in: fixtureUsers } } });
      await prisma.userRole.deleteMany({ where: { userId: { in: fixtureUsers } } });
      await prisma.user.deleteMany({ where: { id: { in: fixtureUsers } } });
    }
    const fixtureEmployees = [employee?.employee.id, departmentManager?.employee.id, admin?.employee.id].filter(
      (id): id is string => Boolean(id),
    );
    if (fixtureEmployees.length > 0) {
      await prisma.resourceProfile.deleteMany({ where: { id: { in: fixtureEmployees } } });
    }
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: [employee?.role.id, departmentManager?.role.id].filter(Boolean) } } });
    await prisma.role.deleteMany({ where: { id: { in: [employee?.role.id, departmentManager?.role.id].filter(Boolean) } } });
    await prisma.$disconnect();
    await app?.close();
  });

  async function createProject(code: string, ownerUserId: string, department?: string) {
    return prisma.project.create({
      data: {
        code,
        name: code,
        status: 'ACTIVE',
        ownerUserId,
        ...(department ? { members: { create: { userId: ownerUserId } } } : {}),
      },
    });
  }

  it('filters report totals by employee scope', async () => {
    const testPrefix = `${prefix}-EMP`;
    const employeeProject = await createProject(`${testPrefix}-PROJECT`, employee.user.id, departments.alpha);
    await createProject(`${testPrefix}-ADMIN-PROJECT`, admin.user.id, departments.beta);

    await prisma.workTask.create({
      data: {
        title: `${testPrefix} employee task`,
        projectId: employeeProject.id,
        ownerUserId: employee.user.id,
        status: 'DONE',
        createdAt: new Date('2030-03-15T00:00:00.000Z'),
        completedAt: new Date('2030-03-16T00:00:00.000Z'),
      },
    });
    await prisma.workTask.create({
      data: {
        title: `${testPrefix} admin task`,
        projectId: employeeProject.id,
        ownerUserId: admin.user.id,
        status: 'DONE',
        createdAt: new Date('2030-03-15T00:00:00.000Z'),
        completedAt: new Date('2030-03-16T00:00:00.000Z'),
      },
    });

    const common = { from: '2030-03-01', to: '2030-03-31', bucket: 'week' };
    const employeeTrend = await employee.agent
      .get('/api/reports/task-completion-trend')
      .query(common)
      .expect(200);
    expect(employeeTrend.body.data.totalCompleted).toBe(1);

    const adminTrend = await admin.agent
      .get('/api/reports/task-completion-trend')
      .query(common)
      .expect(200);
    expect(adminTrend.body.data.totalCompleted).toBe(2);

    await prisma.workTask.deleteMany({ where: { title: { startsWith: testPrefix } } });
    await prisma.project.deleteMany({ where: { code: { startsWith: testPrefix } } });
  });

  it('filters report totals by department scope', async () => {
    const testPrefix = `${prefix}-DEPT`;
    const alphaProject = await createProject(`${testPrefix}-ALPHA-PROJECT`, departmentManager.user.id, departments.alpha);
    await createProject(`${testPrefix}-BETA-PROJECT`, admin.user.id, departments.beta);

    await prisma.workTask.create({
      data: {
        title: `${testPrefix} alpha task`,
        projectId: alphaProject.id,
        ownerUserId: departmentManager.user.id,
        status: 'DONE',
        createdAt: new Date('2030-03-15T00:00:00.000Z'),
        completedAt: new Date('2030-03-16T00:00:00.000Z'),
      },
    });
    await prisma.workTask.create({
      data: {
        title: `${testPrefix} beta task`,
        projectId: alphaProject.id,
        ownerUserId: admin.user.id,
        status: 'DONE',
        createdAt: new Date('2030-03-15T00:00:00.000Z'),
        completedAt: new Date('2030-03-16T00:00:00.000Z'),
      },
    });

    const common = { from: '2030-03-01', to: '2030-03-31', bucket: 'week' };
    const deptTrend = await departmentManager.agent
      .get('/api/reports/task-completion-trend')
      .query(common)
      .expect(200);
    expect(deptTrend.body.data.totalCompleted).toBe(1);

    const adminTrend = await admin.agent
      .get('/api/reports/task-completion-trend')
      .query(common)
      .expect(200);
    expect(adminTrend.body.data.totalCompleted).toBe(2);

    await prisma.workTask.deleteMany({ where: { title: { startsWith: testPrefix } } });
    await prisma.project.deleteMany({ where: { code: { startsWith: testPrefix } } });
  });

  it('applies the same scope to report export as to list reports', async () => {
    const testPrefix = `${prefix}-EXPORT`;
    const exportEmployee = await authenticatedRequest(app, prisma, `${testPrefix}-EMPLOYEE`, [
      { code: 'report.read', dataScope: DataScope.SELF },
      { code: 'report.export', dataScope: DataScope.SELF },
      { code: 'task.read', dataScope: DataScope.SELF },
    ]);
    await prisma.resourceProfile.update({
      where: { id: exportEmployee.employee.id },
      data: { department: departments.alpha },
    });

    const employeeProject = await createProject(`${testPrefix}-PROJECT`, exportEmployee.user.id, departments.alpha);
    await prisma.workTask.create({
      data: {
        title: `${testPrefix} task`,
        projectId: employeeProject.id,
        ownerUserId: exportEmployee.user.id,
        status: 'DONE',
        createdAt: new Date('2026-07-15T00:00:00.000Z'),
        completedAt: new Date('2026-07-16T00:00:00.000Z'),
      },
    });
    await prisma.workTask.create({
      data: {
        title: `${testPrefix} admin task`,
        projectId: employeeProject.id,
        ownerUserId: admin.user.id,
        status: 'DONE',
        createdAt: new Date('2026-07-15T00:00:00.000Z'),
        completedAt: new Date('2026-07-16T00:00:00.000Z'),
      },
    });

    const common = { from: '2026-07-01', to: '2026-07-31', bucket: 'week' };
    const list = await exportEmployee.agent
      .get('/api/reports/task-completion-trend')
      .query(common)
      .expect(200);

    const exported = await exportEmployee.agent
      .get('/api/reports/export')
      .query({ ...common, kind: 'TASKS', format: 'csv' })
      .expect(200);

    const lines = exported.text.split(/\r?\n/).filter((line: string) => line.length > 0);
    const dataRows = lines.slice(1);
    const totalCompleted = dataRows.reduce((sum: number, row: string) => {
      const cells = row.split(',');
      const completed = Number(cells[2]);
      return sum + (Number.isNaN(completed) ? 0 : completed);
    }, 0);
    expect(totalCompleted).toBe(list.body.data.totalCompleted);
    expect(totalCompleted).toBe(1);

    await prisma.workTask.deleteMany({ where: { title: { startsWith: testPrefix } } });
    await prisma.project.deleteMany({ where: { code: { startsWith: testPrefix } } });
    await prisma.loginAudit.deleteMany({ where: { userId: exportEmployee.user.id } });
    await prisma.authSession.deleteMany({ where: { userId: exportEmployee.user.id } });
    await prisma.userRole.deleteMany({ where: { userId: exportEmployee.user.id } });
    await prisma.user.deleteMany({ where: { id: exportEmployee.user.id } });
    await prisma.resourceProfile.deleteMany({ where: { id: exportEmployee.employee.id } });
    await prisma.rolePermission.deleteMany({ where: { roleId: exportEmployee.role.id } });
    await prisma.role.deleteMany({ where: { id: exportEmployee.role.id } });
  });

  it('rejects ordinary employees for backup, restore, system settings and extension credentials', async () => {
    await employee.agent.post('/api/governance/backups').expect(403);
    await employee.agent.post('/api/governance/backups/any/preflight').expect(403);
    await employee.agent.put('/api/governance/settings').send({ autoBackupEnabled: false }).expect(403);
    await employee.agent.patch('/api/governance/settings').send({ autoBackupEnabled: false }).expect(403);
    await employee.agent
      .post('/api/extensions/profiles')
      .send({
        kind: 'SMS',
        provider: 'LOCAL_PREVIEW',
        name: `${prefix} unauthorized`,
        publicConfig: { templateMapping: { REMINDER: 'LOCAL' } },
      })
      .expect(403);
  });

  it('allows authorized operators to run sensitive operations and records an audit event', async () => {
    await admin.agent
      .put('/api/governance/settings')
      .send({ autoBackupEnabled: true, autoBackupTimeLocal: '09:30', retentionDays: 30 })
      .expect(200);

    await expect(
      prisma.auditLog.count({
        where: {
          action: 'GOVERNANCE_SETTINGS_UPDATE',
          entityType: 'governanceSetting',
          outcome: 'SUCCEEDED',
        },
      }),
    ).resolves.toBeGreaterThan(0);
  });
});
