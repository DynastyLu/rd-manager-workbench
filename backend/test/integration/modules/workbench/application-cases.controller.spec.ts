import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';

describe('Application cases API', () => {
  const prefix = `TEST-APPLICATION-${Date.now()}`;
  const prisma = new PrismaClient();
  let app: INestApplication;
  let projectId: string;
  let templateId: string;
  let caseId: string;
  let prepareNodeId: string;
  let materialId: string;
  let versionId: string;

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
    projectId = (
      await prisma.project.create({ data: { code: `${prefix}-PROJECT`, name: '申报关联项目' } })
    ).id;
  });

  afterAll(async () => {
    await prisma.applicationCase.deleteMany({ where: { code: { startsWith: prefix } } });
    await prisma.workflowTemplate.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.project.deleteMany({ where: { code: { startsWith: prefix } } });
    await prisma.$disconnect();
    await app?.close();
  });

  it('creates a configurable template and snapshots its nodes into a linked case', async () => {
    const template = await request(app.getHttpServer())
      .post('/api/workflow-templates')
      .send({
        name: `${prefix} 认定流程`,
        category: '认定',
        nodes: [
          {
            code: 'PREPARE',
            title: '准备材料',
            sequence: 1,
            requiredRequirementCodes: ['QUALIFIED'],
            requiredMaterialCodes: ['FORM'],
          },
          { code: 'SUBMIT', title: '提交材料', sequence: 2, prerequisiteNodeCodes: ['PREPARE'] },
        ],
      })
      .expect(201);
    templateId = template.body.data.id;
    expect(template.body.data.nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'PREPARE' })]),
    );

    const applicationCase = await request(app.getHttpServer())
      .post('/api/application-cases')
      .send({
        code: `${prefix}-CASE`,
        title: '高新认定',
        projectId,
        workflowTemplateId: templateId,
      })
      .expect(201);
    caseId = applicationCase.body.data.id;
    prepareNodeId = applicationCase.body.data.nodes.find(
      (node: { code: string }) => node.code === 'PREPARE',
    ).id;
    expect(applicationCase.body.data.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PREPARE',
          snapshot: expect.objectContaining({ workflowTemplateVersion: 1 }),
        }),
      ]),
    );

    const listed = await request(app.getHttpServer())
      .get(`/api/application-cases?projectId=${projectId}`)
      .expect(200);
    expect(listed.body.data.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: caseId, projectId })]),
    );
  });

  it('rejects completion until prerequisite requirements and materials are complete, then records immutable submission versions', async () => {
    const requirement = await request(app.getHttpServer())
      .post(`/api/application-cases/${caseId}/requirements`)
      .send({
        code: 'QUALIFIED',
        title: '符合基本条件',
        status: 'PENDING',
        applicationNodeId: prepareNodeId,
      })
      .expect(201);
    const material = await request(app.getHttpServer())
      .post(`/api/application-cases/${caseId}/materials`)
      .send({ code: 'FORM', title: '申报表', applicationNodeId: prepareNodeId })
      .expect(201);
    materialId = material.body.data.id;

    const blocked = await request(app.getHttpServer())
      .patch(`/api/application-cases/${caseId}/nodes/${prepareNodeId}`)
      .send({ status: 'COMPLETED' })
      .expect(422);
    expect(blocked.body).toMatchObject({
      success: false,
      error: {
        code: 'APPLICATION_NODE_COMPLETION_BLOCKED',
        details: { missingRequirementCodes: ['QUALIFIED'], missingMaterialCodes: ['FORM'] },
      },
    });

    await request(app.getHttpServer())
      .patch(`/api/application-cases/${caseId}/requirements/${requirement.body.data.id}`)
      .send({ status: 'SATISFIED' })
      .expect(200);
    const version = await request(app.getHttpServer())
      .post(`/api/application-cases/${caseId}/materials/${materialId}/versions`)
      .send({ fileName: '申报表-v1.pdf', isFinal: true })
      .expect(201);
    versionId = version.body.data.id;
    expect(version.body.data.versionNumber).toBe(1);

    await request(app.getHttpServer())
      .patch(`/api/application-cases/${caseId}/nodes/${prepareNodeId}`)
      .send({ status: 'COMPLETED' })
      .expect(200);
    const submission = await request(app.getHttpServer())
      .post(`/api/application-cases/${caseId}/submissions`)
      .send({
        submittedAt: '2026-07-18T00:00:00.000Z',
        status: 'SUBMITTED',
        materialVersionIds: [versionId],
      })
      .expect(201);
    expect(submission.body.data.materialVersions).toEqual([
      expect.objectContaining({ materialVersionId: versionId }),
    ]);

    const detail = await request(app.getHttpServer())
      .get(`/api/application-cases/${caseId}`)
      .expect(200);
    expect(detail.body.data).toMatchObject({ status: 'SUBMITTED' });
    expect(detail.body.data.materials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: materialId,
          versions: [expect.objectContaining({ id: versionId, versionNumber: 1 })],
        }),
      ]),
    );
  });

  it('links evidence and corrections only to records that belong to the same case', async () => {
    const detail = await request(app.getHttpServer())
      .get(`/api/application-cases/${caseId}`)
      .expect(200);
    const requirementId = detail.body.data.requirements[0].id;
    const submissionId = detail.body.data.submissions[0].id;

    const evidence = await request(app.getHttpServer())
      .post(`/api/application-cases/${caseId}/evidence-records`)
      .send({ title: '资质证明', requirementIds: [requirementId], materialIds: [materialId] })
      .expect(201);
    expect(evidence.body.data.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ applicationRequirementId: requirementId }),
        expect.objectContaining({ applicationMaterialId: materialId }),
      ]),
    );

    const correction = await request(app.getHttpServer())
      .post(`/api/application-cases/${caseId}/corrections`)
      .send({
        title: '补充盖章页',
        submissionRecordId: submissionId,
        materialVersionIds: [versionId],
      })
      .expect(201);
    expect(correction.body.data.materialVersions).toEqual([
      expect.objectContaining({ materialVersionId: versionId }),
    ]);
  });

  it('rejects data writes after a case is archived and validates required project linkage', async () => {
    const missingProject = await request(app.getHttpServer())
      .post('/api/application-cases')
      .send({
        code: `${prefix}-MISSING`,
        title: '无效项目',
        projectId: 'missing-project',
        workflowTemplateId: templateId,
      })
      .expect(404);
    expect(missingProject.body).toMatchObject({ error: { code: 'APPLICATION_PROJECT_NOT_FOUND' } });

    await request(app.getHttpServer()).delete(`/api/application-cases/${caseId}`).expect(204);
    const archivedWrite = await request(app.getHttpServer())
      .post(`/api/application-cases/${caseId}/materials/${materialId}/versions`)
      .send({ fileName: '不应写入.pdf' })
      .expect(409);
    expect(archivedWrite.body).toMatchObject({ error: { code: 'APPLICATION_CASE_ARCHIVED' } });
  });
});
