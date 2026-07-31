import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';

describe('Default administrator bootstrap', () => {
  jest.setTimeout(120_000);

  const prisma = new PrismaClient();
  let app: INestApplication;

  beforeAll(async () => {
    await prisma.loginAudit.deleteMany();
    await prisma.authSession.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await prisma.permission.deleteMany();
    await prisma.resourceProfile.deleteMany({
      where: { displayName: '系统管理员' },
    });

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
  });

  afterAll(async () => {
    try {
      await prisma.loginAudit.deleteMany();
      await prisma.authSession.deleteMany();
      await prisma.userRole.deleteMany();
      await prisma.rolePermission.deleteMany();
      await prisma.user.deleteMany();
      await prisma.role.deleteMany();
      await prisma.permission.deleteMany();
      await prisma.resourceProfile.deleteMany({
        where: { displayName: '系统管理员' },
      });
    } finally {
      await prisma.$disconnect();
      await app?.close();
    }
  });

  it('auto-creates a default super administrator when the database has no users', async () => {
    const user = await prisma.user.findUnique({
      where: { username: 'admin' },
      include: {
        resourceProfile: true,
        userRoles: { include: { role: { select: { code: true } } } },
      },
    });

    expect(user).not.toBeNull();
    expect(user?.employeeNo).toBe('ADMIN');
    expect(user?.status).toBe('ACTIVE');
    expect(user?.mustChangePassword).toBe(true);
    expect(user?.resourceProfile).toMatchObject({
      displayName: '系统管理员',
      department: '系统管理',
      roleTitle: '超级管理员',
    });
    expect(user?.userRoles.map(({ role }) => role.code)).toContain('SUPER_ADMIN');
  });

  it('reports bootstrap no longer required', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/bootstrap/status')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual({ required: false });
      });
  });

  it('allows the default administrator to log in and forces a password change', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: 'admin', password: 'RdManager2026!' });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      mustChangePassword: true,
      user: expect.objectContaining({
        username: 'admin',
        roleCodes: expect.arrayContaining(['SUPER_ADMIN']),
      }),
    });
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^rd_refresh=.+; Path=\/api\/auth;.*HttpOnly;.*SameSite=Lax/i),
      ]),
    );
  });

  it('returns 404 for the removed bootstrap employee and creation endpoints', async () => {
    await request(app.getHttpServer()).get('/api/auth/bootstrap/employees').expect(404);
    await request(app.getHttpServer())
      .post('/api/auth/bootstrap')
      .send({ resourceProfileId: 'x', username: 'x', password: 'x' })
      .expect(404);
  });
});
