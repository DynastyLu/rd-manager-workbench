import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataScope, PrismaClient, ProjectProgressDraftStatus } from '@prisma/client';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { PERMISSIONS } from '../../../../src/modules/iam/domain/permission-catalog';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';
import { authenticatedRequest } from '../../../helpers/authenticated-request';

describe('Project progress draft authorization', () => {
  jest.setTimeout(60_000);

  const prefix = `TEST-PROGRESS-AUTHZ-${Date.now()}`;
  const prisma = new PrismaClient();
  let app: INestApplication;
  let owner: Awaited<ReturnType<typeof authenticatedRequest>>;
  let publisher: Awaited<ReturnType<typeof authenticatedRequest>>;
  let contributor: Awaited<ReturnType<typeof authenticatedRequest>>;
  let superAdmin: Awaited<ReturnType<typeof authenticatedRequest>>;
  let projectId: string;
  let draftId: string;
  let contributorDraftId: string;
  let adminDraftId: string;

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

    superAdmin = await authenticatedRequest(app, prisma, 'SUPER_ADMIN', []);
    owner = await authenticatedRequest(app, prisma, `${prefix}-OWNER`, [
      { code: PERMISSIONS.PROJECT_READ, dataScope: DataScope.ALL },
      { code: PERMISSIONS.PROJECT_CREATE, dataScope: DataScope.ALL },
    ]);
    publisher = await authenticatedRequest(app, prisma, `${prefix}-PUBLISHER`, [
      { code: PERMISSIONS.PROJECT_READ, dataScope: DataScope.ALL },
      { code: PERMISSIONS.PROJECT_PROGRESS_PUBLISH, dataScope: DataScope.ALL },
    ]);
    contributor = await authenticatedRequest(app, prisma, `${prefix}-CONTRIBUTOR`, [
      { code: PERMISSIONS.PROJECT_READ, dataScope: DataScope.ALL },
    ]);

    const project = await owner.agent
      .post('/api/projects')
      .send({ code: `${prefix}-PROJECT`, name: `${prefix}-Project` })
      .expect(201);
    projectId = project.body.data.id;

    await prisma.projectMember.create({
      data: { projectId, userId: contributor.user.id, canEdit: false },
    });

    const batch = await prisma.employeeWorkImportBatch.create({
      data: {
        periodType: 'WEEK',
        periodStartAt: new Date('2040-01-01T00:00:00.000Z'),
        periodEndAt: new Date('2040-01-07T00:00:00.000Z'),
        status: 'COMPLETED',
        version: 1,
        originalName: `${prefix}-batch.xlsx`,
        fileHash: `${prefix}-hash`,
        sourceStorageKey: `${prefix}/source.xlsx`,
        expiresAt: new Date('2040-02-01T00:00:00.000Z'),
        templateVersion: 2,
        totalRows: 1,
        validRows: 1,
        errorRows: 0,
        unresolvedRows: 0,
        importedRows: 1,
      },
    });

    draftId = (await prisma.projectProgressDraft.create({
      data: {
        projectId,
        sourceBatchId: batch.id,
        sourceVersion: 1,
        periodStartAt: new Date('2040-01-01T00:00:00.000Z'),
        periodEndAt: new Date('2040-01-07T00:00:00.000Z'),
        contentFingerprint: `${prefix}-fingerprint`,
        content: {
          completed: [{ sourceId: 'w1', employeeId: 'e1', employeeName: '员工甲', text: '完成联调' }],
          nextPlans: [],
          blockers: [],
          risks: [],
          hours: { planned: 8, actual: 8, nextPlanned: 0, missingCount: 0 },
          unlinkedRows: [],
        },
        summary: `${prefix} 进展`,
        unlinkedRowCount: 0,
        status: ProjectProgressDraftStatus.PENDING,
      },
    })).id;

    contributorDraftId = (await prisma.projectProgressDraft.create({
      data: {
        projectId,
        sourceBatchId: batch.id,
        sourceVersion: 1,
        periodStartAt: new Date('2040-01-01T00:00:00.000Z'),
        periodEndAt: new Date('2040-01-07T00:00:00.000Z'),
        contentFingerprint: `${prefix}-contributor-fingerprint`,
        content: {
          completed: [{ sourceId: 'w2', employeeId: 'e2', employeeName: '员工乙', text: '完成测试' }],
          nextPlans: [],
          blockers: [],
          risks: [],
          hours: { planned: 8, actual: 8, nextPlanned: 0, missingCount: 0 },
          unlinkedRows: [],
        },
        summary: `${prefix} 贡献者进展`,
        unlinkedRowCount: 0,
        status: ProjectProgressDraftStatus.PENDING,
      },
    })).id;

    adminDraftId = (await prisma.projectProgressDraft.create({
      data: {
        projectId,
        sourceBatchId: batch.id,
        sourceVersion: 1,
        periodStartAt: new Date('2040-01-01T00:00:00.000Z'),
        periodEndAt: new Date('2040-01-07T00:00:00.000Z'),
        contentFingerprint: `${prefix}-admin-fingerprint`,
        content: {
          completed: [{ sourceId: 'w3', employeeId: 'e3', employeeName: '员工丙', text: '完成验收' }],
          nextPlans: [],
          blockers: [],
          risks: [],
          hours: { planned: 8, actual: 8, nextPlanned: 0, missingCount: 0 },
          unlinkedRows: [],
        },
        summary: `${prefix} 管理员进展`,
        unlinkedRowCount: 0,
        status: ProjectProgressDraftStatus.PENDING,
      },
    })).id;
  });

  afterAll(async () => {
    try {
      await prisma.projectProgressDraft.deleteMany({
        where: { projectId },
      });
      await prisma.employeeWorkImportBatch.deleteMany({
        where: { originalName: { startsWith: prefix } },
      });
      if (projectId) {
        await prisma.projectMember.deleteMany({ where: { projectId } });
        await prisma.project.deleteMany({ where: { id: projectId } });
      }

      for (const fixture of [contributor, publisher, owner, superAdmin]) {
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

  it('lets contributors, owners, publishers and super admins list drafts', async () => {
    const ownerList = await owner.agent
      .get('/api/project-progress-drafts')
      .query({ projectId })
      .expect(200);
    expect(ownerList.body.data.map((draft: { id: string }) => draft.id).sort()).toEqual(
      [draftId, contributorDraftId, adminDraftId].sort(),
    );

    const contributorList = await contributor.agent
      .get('/api/project-progress-drafts')
      .query({ projectId })
      .expect(200);
    expect(contributorList.body.data.map((draft: { id: string }) => draft.id).sort()).toEqual(
      [draftId, contributorDraftId, adminDraftId].sort(),
    );

    const publisherList = await publisher.agent
      .get('/api/project-progress-drafts')
      .query({ projectId })
      .expect(200);
    expect(publisherList.body.data.length).toBe(3);

    const adminList = await superAdmin.agent
      .get('/api/project-progress-drafts')
      .query({ projectId })
      .expect(200);
    expect(adminList.body.data.length).toBe(3);
  });

  it('blocks contributors from adopting or ignoring drafts', async () => {
    await contributor.agent
      .post(`/api/project-progress-drafts/${draftId}/adopt`)
      .send({})
      .expect(403);
    await contributor.agent
      .post(`/api/project-progress-drafts/${draftId}/ignore`)
      .send({})
      .expect(403);
  });

  it('allows the project owner to adopt a draft', async () => {
    const response = await owner.agent
      .post(`/api/project-progress-drafts/${draftId}/adopt`)
      .send({})
      .expect(201);
    expect(response.body.data.draft.status).toBe('ADOPTED');
    expect(response.body.data.report).toBeDefined();
    expect(response.body.data.report.id).toBeDefined();

    const persisted = await prisma.projectProgressDraft.findUnique({ where: { id: draftId } });
    expect(persisted?.status).toBe(ProjectProgressDraftStatus.ADOPTED);
    expect(persisted?.adoptedReportId).toBe(response.body.data.report.id);
  });

  it('allows a progress publisher to ignore a draft', async () => {
    const response = await publisher.agent
      .post(`/api/project-progress-drafts/${contributorDraftId}/ignore`)
      .send({})
      .expect(201);
    expect(response.body.data.status).toBe('IGNORED');

    const persisted = await prisma.projectProgressDraft.findUnique({
      where: { id: contributorDraftId },
    });
    expect(persisted?.status).toBe(ProjectProgressDraftStatus.IGNORED);
    expect(persisted?.ignoredAt).not.toBeNull();
  });

  it('allows super admins to adopt remaining pending drafts', async () => {
    const response = await superAdmin.agent
      .post(`/api/project-progress-drafts/${adminDraftId}/adopt`)
      .send({ createRisks: false, createTasks: false })
      .expect(201);
    expect(response.body.data.draft.status).toBe('ADOPTED');
  });

  it('preserves adopted draft records and history', async () => {
    const adopted = await prisma.projectProgressDraft.findUnique({ where: { id: draftId } });
    expect(adopted).not.toBeNull();
    expect(adopted?.status).toBe(ProjectProgressDraftStatus.ADOPTED);
    expect(adopted?.adoptedReportId).not.toBeNull();
    expect(adopted?.content).toBeDefined();
  });
});
