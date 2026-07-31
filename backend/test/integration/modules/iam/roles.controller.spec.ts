import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataScope, PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';
import { authenticatedRequest } from '../../../helpers/authenticated-request';

describe('administrator role and permission APIs', () => {
  const prisma = new PrismaClient();
  const prefix = `iam-role-${randomUUID()}`.toUpperCase();
  let app: INestApplication;
  let admin: Awaited<ReturnType<typeof authenticatedRequest>>;
  let employee: Awaited<ReturnType<typeof authenticatedRequest>>;

  beforeAll(async () => {
    const { AppModule } = await import('../../../../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureBodyParser(app);
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(app.get(HttpExceptionFilter));
    app.useGlobalInterceptors(app.get(ResponseInterceptor));
    await app.init();

    await seedPermissions();
    admin = await authenticatedRequest(app, prisma, 'SUPER_ADMIN');
    employee = await authenticatedRequest(app, prisma, 'EMPLOYEE');
    await prisma.role.updateMany({
      where: { code: { in: ['SUPER_ADMIN', 'EMPLOYEE'] } },
      data: { isSystem: true, isEnabled: true },
    });
  });

  afterAll(async () => {
    try {
      const fixtureUsers = [admin?.user.id, employee?.user.id].filter((id): id is string =>
        Boolean(id),
      );
      if (fixtureUsers.length > 0) {
        await prisma.authSession.deleteMany({ where: { userId: { in: fixtureUsers } } });
        await prisma.loginAudit.deleteMany({ where: { userId: { in: fixtureUsers } } });
        await prisma.userRole.deleteMany({ where: { userId: { in: fixtureUsers } } });
        await prisma.user.deleteMany({ where: { id: { in: fixtureUsers } } });
      }
      const fixtureEmployees = [admin?.employee.id, employee?.employee.id].filter(
        (id): id is string => Boolean(id),
      );
      if (fixtureEmployees.length > 0) {
        await prisma.resourceProfile.deleteMany({ where: { id: { in: fixtureEmployees } } });
      }
      await prisma.rolePermission.deleteMany({
        where: { role: { code: { startsWith: prefix } } },
      });
      await prisma.role.deleteMany({ where: { code: { startsWith: prefix } } });
    } finally {
      await prisma.$disconnect();
      await app?.close();
    }
  });

  it('keeps the permission directory read-only and rejects ordinary users', async () => {
    await employee.agent
      .get('/api/admin/permissions')
      .expect(403)
      .expect(({ body }) => {
        expect(body.error.code).toBe('PERMISSION_DENIED');
      });

    await employee.agent.get('/api/admin/roles').expect(403);

    await admin.agent
      .get('/api/admin/permissions')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'role.read', module: 'iam' }),
            expect.objectContaining({ code: 'project.delete', isSensitive: true }),
          ]),
        );
      });
  });

  it('creates, copies and edits a custom role through the seven exact APIs', async () => {
    const roleCode = `${prefix}-manager`.toUpperCase();
    const copiedCode = `${prefix}-manager-copy`.toUpperCase();

    const created = await admin.agent
      .post('/api/admin/roles')
      .send({
        code: roleCode,
        name: '研发主管',
        description: '研发主管模板',
        permissions: [
          {
            permissionCode: 'employee.read',
            dataScope: DataScope.DEPARTMENT,
            scopeConfig: { departmentNames: ['研发部'] },
          },
          {
            permissionCode: 'project.read',
            dataScope: DataScope.PROJECT,
            scopeConfig: { projectIds: ['project-a'] },
          },
        ],
      })
      .expect(201);
    expect(created.body.data).toMatchObject({
      code: roleCode,
      name: '研发主管',
      isSystem: false,
      isEnabled: true,
      userCount: 0,
    });

    const copied = await admin.agent
      .post(`/api/admin/roles/${created.body.data.id}/copy`)
      .send({ code: copiedCode, name: '研发主管副本' })
      .expect(201);
    expect(copied.body.data.permissions).toHaveLength(2);

    await admin.agent
      .patch(`/api/admin/roles/${copied.body.data.id}`)
      .send({ name: '项目主管', isEnabled: false })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ name: '项目主管', isEnabled: false });
      });

    await admin.agent
      .put(`/api/admin/roles/${copied.body.data.id}/permissions`)
      .send({
        permissions: [
          {
            permissionCode: 'project.read',
            dataScope: DataScope.PROJECT,
            scopeConfig: { projectIds: ['project-b', 'project-a'] },
          },
        ],
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.permissions).toEqual([
          expect.objectContaining({
            code: 'project.read',
            dataScope: 'PROJECT',
            scopeConfig: { projectIds: ['project-a', 'project-b'] },
          }),
        ]);
      });

    await admin.agent.delete(`/api/admin/roles/${copied.body.data.id}`).expect(200);
  });

  it('validates permission scope configuration and rejects arbitrary permission codes', async () => {
    await admin.agent
      .post('/api/admin/roles')
      .send({
        code: `${prefix}-blank-name`.toUpperCase(),
        name: '   ',
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe('HTTP_ERROR');
      });

    await admin.agent
      .post('/api/admin/roles')
      .send({
        code: `${prefix}-unsafe`.toUpperCase(),
        name: '非法范围角色',
        permissions: [
          {
            permissionCode: 'employee.read',
            dataScope: 'DEPARTMENT',
            scopeConfig: {
              departmentNames: ['研发部'],
              projectIds: ['must-not-be-accepted'],
            },
          },
        ],
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe('ROLE_SCOPE_INVALID');
      });

    await admin.agent
      .post('/api/admin/roles')
      .send({
        code: `${prefix}-empty-department`.toUpperCase(),
        name: '空部门范围角色',
        permissions: [
          {
            permissionCode: 'employee.read',
            dataScope: 'DEPARTMENT',
            scopeConfig: { departmentNames: [] },
          },
        ],
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe('ROLE_SCOPE_INVALID');
      });

    await admin.agent
      .post('/api/admin/roles')
      .send({
        code: `${prefix}-self-config`.toUpperCase(),
        name: '非法本人范围角色',
        permissions: [
          {
            permissionCode: 'employee.read',
            dataScope: 'SELF',
            scopeConfig: { departmentNames: ['研发部'] },
          },
        ],
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe('ROLE_SCOPE_INVALID');
      });

    await admin.agent
      .post('/api/admin/roles')
      .send({
        code: `${prefix}-unknown`.toUpperCase(),
        name: '未知权限角色',
        permissions: [
          {
            permissionCode: 'made.up.permission',
            dataScope: 'SELF',
          },
        ],
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe('ROLE_PERMISSION_INVALID');
      });
  });

  it('protects system roles and refuses to cascade-delete a role with users', async () => {
    const superAdminRole = await prisma.role.findUniqueOrThrow({
      where: { code: 'SUPER_ADMIN' },
    });
    await admin.agent
      .patch(`/api/admin/roles/${superAdminRole.id}`)
      .send({ isEnabled: false })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('ROLE_SYSTEM_PROTECTED'));
    await admin.agent
      .put(`/api/admin/roles/${superAdminRole.id}/permissions`)
      .send({ permissions: [] })
      .expect(409);
    await admin.agent.delete(`/api/admin/roles/${superAdminRole.id}`).expect(409);

    const assignedRole = await prisma.role.create({
      data: {
        code: `${prefix}-assigned`.toUpperCase(),
        name: '已有用户角色',
        userRoles: { create: { userId: employee.user.id, assignedByUserId: admin.user.id } },
      },
    });
    await admin.agent
      .delete(`/api/admin/roles/${assignedRole.id}`)
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('ROLE_HAS_USERS'));
  });

  it('increments assigned users permissionVersion when grants or enablement change', async () => {
    const role = await prisma.role.create({
      data: {
        code: `${prefix}-versioned`.toUpperCase(),
        name: '版本角色',
        userRoles: { create: { userId: employee.user.id, assignedByUserId: admin.user.id } },
      },
    });
    const before = await prisma.user.findUniqueOrThrow({ where: { id: employee.user.id } });

    await admin.agent
      .put(`/api/admin/roles/${role.id}/permissions`)
      .send({
        permissions: [{ permissionCode: 'project.read', dataScope: 'INVOLVED' }],
      })
      .expect(200);
    const afterPermission = await prisma.user.findUniqueOrThrow({
      where: { id: employee.user.id },
    });
    expect(afterPermission.permissionVersion).toBe(before.permissionVersion + 1);
    await employee.agent
      .get('/api/admin/roles')
      .expect(401)
      .expect(({ body }) => {
        expect(body.error.code).toBe('AUTH_REQUIRED');
      });

    await admin.agent.patch(`/api/admin/roles/${role.id}`).send({ isEnabled: false }).expect(200);
    const afterDisable = await prisma.user.findUniqueOrThrow({ where: { id: employee.user.id } });
    expect(afterDisable.permissionVersion).toBe(before.permissionVersion + 2);
  });

  async function seedPermissions() {
    const permissions = [
      ['role.read', 'iam', 'role', 'read', false],
      ['role.create', 'iam', 'role', 'create', true],
      ['role.update', 'iam', 'role', 'update', true],
      ['role.assign', 'iam', 'role', 'assign', true],
      ['employee.read', 'employees', 'employee', 'read', false],
      ['project.read', 'projects', 'project', 'read', false],
      ['project.delete', 'projects', 'project', 'delete', true],
    ] as const;
    for (const [code, module, resource, action, isSensitive] of permissions) {
      await prisma.permission.upsert({
        where: { code },
        create: { code, module, resource, action, isSensitive },
        update: { module, resource, action, isSensitive },
      });
    }
  }
});
