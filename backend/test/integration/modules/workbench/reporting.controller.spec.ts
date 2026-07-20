import { INestApplication, ValidationPipe } from '@nestjs/common';
import { LoadEntryKind, PrismaClient, ProjectStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';

describe('Resources and reporting API', () => {
  const prisma = new PrismaClient();
  const prefix = `TEST-REPORT-${Date.now()}`;
  let app: INestApplication;
  let projectId = '';
  let resourceId = '';

  beforeAll(async () => {
    const { AppModule } = await import('../../../../src/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ bodyParser: false });
    configureBodyParser(app);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(app.get(HttpExceptionFilter));
    app.useGlobalInterceptors(app.get(ResponseInterceptor));
    await app.init();
    projectId = (await prisma.project.create({ data: { code: `${prefix}-P`, name: `${prefix} project`, status: ProjectStatus.ACTIVE } })).id;
  });

  afterAll(async () => {
    await prisma.resourceLoadEntry.deleteMany({ where: { resource: { displayName: { startsWith: prefix } } } });
    await prisma.resourceSkill.deleteMany({ where: { resource: { displayName: { startsWith: prefix } } } });
    await prisma.resourceProfile.deleteMany({ where: { displayName: { startsWith: prefix } } });
    await prisma.project.deleteMany({ where: { code: { startsWith: prefix } } });
    await prisma.$disconnect();
    if (app) await app.close();
  });

  it('runs resource profile and load entry CRUD through HTTP', async () => {
    const created = await request(app.getHttpServer()).post('/api/resources').send({ displayName: `${prefix} 张三`, weeklyCapacityHours: 40 }).expect(201);
    resourceId = created.body.data.id as string;
    const load = await request(app.getHttpServer()).post(`/api/resources/${resourceId}/load-entries`).send({ weekStartAt: '2026-07-20', kind: LoadEntryKind.PROJECT, projectId, plannedHours: 20 }).expect(201);
    await request(app.getHttpServer()).patch(`/api/resources/${resourceId}/load-entries/${load.body.data.id}`).send({ plannedHours: 45 }).expect(200);
    const summary = await request(app.getHttpServer()).get('/api/resources/load-summary').query({ fromWeek: '2026-07-20', toWeek: '2026-07-20' }).expect(200);
    expect(summary.body.data[0].weeks[0]).toMatchObject({ plannedHours: 45, percent: 112.5, overloaded: true });
    await request(app.getHttpServer()).delete(`/api/resources/${resourceId}/load-entries/${load.body.data.id}`).expect(204);
    await request(app.getHttpServer()).delete(`/api/resources/${resourceId}`).expect(204);
  });

  it('exposes all five report endpoints and audits an export', async () => {
    const common = { from: '2026-07-01', to: '2026-07-31', bucket: 'week' };
    await request(app.getHttpServer()).get('/api/reports/portfolio').query(common).expect(200);
    await request(app.getHttpServer()).get('/api/reports/task-completion-trend').query(common).expect(200);
    await request(app.getHttpServer()).get('/api/reports/risk-trend').query(common).expect(200);
    await request(app.getHttpServer()).get('/api/reports/resource-load').query(common).expect(200);
    await request(app.getHttpServer()).get('/api/reports/intelligence').query(common).expect(200);
    const exported = await request(app.getHttpServer()).get('/api/reports/export').query({ ...common, kind: 'portfolio', format: 'csv' }).expect(200);
    expect(exported.headers['content-type']).toContain('text/csv');
    await expect(prisma.auditLog.count({ where: { action: 'REPORT_EXPORT', entityType: 'report', entityId: 'PORTFOLIO', outcome: 'SUCCEEDED' } })).resolves.toBeGreaterThan(0);
  });
});
