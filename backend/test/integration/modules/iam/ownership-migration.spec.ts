import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EmploymentStatus, PrismaClient, User, UserStatus } from '@prisma/client';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { PasswordService } from '../../../../src/modules/iam/application/password.service';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';
import { authenticatedRequest } from '../../../helpers/authenticated-request';

interface FixtureUser {
  user: User;
  employee: { id: string; displayName: string };
}

describe('ownership migration APIs', () => {
  jest.setTimeout(120_000);

  const prisma = new PrismaClient();
  const prefix = `ownership-migration-${randomUUID()}`.toLowerCase();
  let app: INestApplication;
  let admin: Awaited<ReturnType<typeof authenticatedRequest>>;
  let employeeA: FixtureUser;
  let employeeB: FixtureUser;
  const cleanupUserIds = new Set<string>();
  const cleanupEmployeeIds = new Set<string>();
  const cleanupProjectIds = new Set<string>();

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

    // Other integration suites may leave orphan records with missing owners.
    // Clean them up so the migration scan only sees this suite's fixtures.
    await cleanupOrphanTestRecords();

    admin = await authenticatedRequest(app, prisma, 'SUPER_ADMIN');
    cleanupUserIds.add(admin.user.id);
    cleanupEmployeeIds.add(admin.employee.id);

    // employeeA has a unique employeeNo that employeeB also uses as username,
    // producing an ambiguous legacy value.
    employeeA = await createEmployeeUser({
      suffix: 'A',
      username: `${prefix}-user-a`,
      employeeNo: `${prefix}-A-001`,
    });
    employeeB = await createEmployeeUser({
      suffix: 'B',
      username: `${prefix}-A-001`,
      employeeNo: `${prefix}-B-001`,
    });
  });

  afterEach(async () => {
    await prisma.project.deleteMany({ where: { code: { startsWith: prefix } } });
  });

  afterAll(async () => {
    try {
      const projectIds = [...cleanupProjectIds];
      if (projectIds.length > 0) {
        await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
      }
      const userIds = [...cleanupUserIds];
      if (userIds.length > 0) {
        await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.loginAudit.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
      await prisma.loginAudit.deleteMany({ where: { username: { startsWith: prefix } } });
      const employeeIds = [...cleanupEmployeeIds];
      if (employeeIds.length > 0) {
        await prisma.resourceProfile.deleteMany({ where: { id: { in: employeeIds } } });
      }
    } finally {
      await prisma.$disconnect();
      await app?.close();
    }
  });

  async function cleanupOrphanTestRecords(): Promise<void> {
    const testPrefix = 'TEST-';
    await prisma.$transaction(async (tx) => {
      await tx.resourceLoadEntry.deleteMany({
        where: {
          OR: [
            { task: { title: { startsWith: testPrefix } } },
            { project: { code: { startsWith: testPrefix } } },
            { nonProjectRdItem: { code: { startsWith: testPrefix } } },
          ],
        },
      });
      await tx.meetingAction.deleteMany({
        where: { title: { startsWith: testPrefix } },
      });
      await tx.milestone.deleteMany({
        where: { name: { startsWith: testPrefix } },
      });
      await tx.workTask.updateMany({
        where: { title: { startsWith: testPrefix } },
        data: { assigneeUserId: null },
      });
      await tx.workTask.deleteMany({
        where: { title: { startsWith: testPrefix } },
      });
      await tx.risk.deleteMany({
        where: { title: { startsWith: testPrefix } },
      });
      await tx.decision.deleteMany({
        where: { title: { startsWith: testPrefix } },
      });
      await tx.issue.deleteMany({
        where: { title: { startsWith: testPrefix } },
      });
      await tx.nonProjectRdItem.deleteMany({
        where: { code: { startsWith: testPrefix } },
      });
      await tx.meeting.deleteMany({
        where: { title: { startsWith: testPrefix } },
      });
      await tx.project.deleteMany({
        where: { code: { startsWith: testPrefix } },
      });
    });
  }

  async function createEmployeeUser(options: {
    suffix: string;
    username: string;
    employeeNo: string;
  }): Promise<FixtureUser> {
    const employee = await prisma.resourceProfile.create({
      data: {
        displayName: `${prefix}-employee-${options.suffix}`,
        department: 'Migration Tests',
        employmentStatus: EmploymentStatus.ACTIVE,
      },
    });
    cleanupEmployeeIds.add(employee.id);
    const passwordHash = await app.get(PasswordService).hash('Enterprise123');
    const user = await prisma.user.create({
      data: {
        username: options.username,
        employeeNo: options.employeeNo,
        passwordHash,
        status: UserStatus.ACTIVE,
        mustChangePassword: false,
        resourceProfileId: employee.id,
      },
    });
    cleanupUserIds.add(user.id);
    return { user, employee };
  }

  async function createMigrationProjects() {
    const suffix = randomUUID().split('-')[0];
    const ambiguousLegacyValue = employeeA.user.employeeNo!;
    const records = await Promise.all([
      prisma.project.create({
        data: {
          code: `${prefix}-exact-${suffix}`,
          name: 'Exact employee ID project',
          leadName: employeeB.user.employeeNo!,
        },
      }),
      prisma.project.create({
        data: {
          code: `${prefix}-unique-${suffix}`,
          name: 'Unique legacy name project',
          leadName: employeeA.employee.displayName,
        },
      }),
      prisma.project.create({
        data: {
          code: `${prefix}-ambiguous-${suffix}`,
          name: 'Ambiguous legacy name project',
          leadName: ambiguousLegacyValue,
        },
      }),
      prisma.project.create({
        data: {
          code: `${prefix}-missing-${suffix}`,
          name: 'Missing owner project',
          leadName: null,
        },
      }),
      prisma.project.create({
        data: {
          code: `${prefix}-participant-${suffix}`,
          name: 'Participant name project',
          leadName: null,
          participantNames: [employeeA.employee.displayName],
        },
      }),
    ]);
    for (const record of records) {
      cleanupProjectIds.add(record.id);
    }
    return { records, ambiguousLegacyValue };
  }

  it('requires system configuration permission', async () => {
    const employee = await authenticatedRequest(app, prisma, 'EMPLOYEE');
    cleanupUserIds.add(employee.user.id);
    cleanupEmployeeIds.add(employee.employee.id);

    await employee.agent
      .get('/api/admin/ownership-migration/status')
      .expect(403)
      .expect(({ body }) => expect(body.error.code).toBe('PERMISSION_DENIED'));
    await employee.agent
      .post('/api/admin/ownership-migration/analyze')
      .expect(403)
      .expect(({ body }) => expect(body.error.code).toBe('PERMISSION_DENIED'));
  });

  it('analyzes legacy ownership without modifying records', async () => {
    const { records, ambiguousLegacyValue } = await createMigrationProjects();

    const response = await admin.agent
      .post('/api/admin/ownership-migration/analyze')
      .send({ batchSize: 10 })
      .expect(200);

    const { data } = response.body;
    expect(data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordType: 'Project',
          recordId: records[0].id,
          title: 'Exact employee ID project',
          legacyOwner: employeeB.user.employeeNo,
          confidence: 'EXACT',
          suggestedUser: expect.objectContaining({ id: employeeB.user.id }),
        }),
        expect.objectContaining({
          recordType: 'Project',
          recordId: records[1].id,
          title: 'Unique legacy name project',
          legacyOwner: employeeA.employee.displayName,
          confidence: 'UNIQUE_NAME',
          suggestedUser: expect.objectContaining({ id: employeeA.user.id }),
        }),
        expect.objectContaining({
          recordType: 'Project',
          recordId: records[2].id,
          title: 'Ambiguous legacy name project',
          legacyOwner: ambiguousLegacyValue,
          confidence: 'AMBIGUOUS',
          suggestedUser: expect.objectContaining({ id: admin.user.id }),
        }),
        expect.objectContaining({
          recordType: 'Project',
          recordId: records[3].id,
          title: 'Missing owner project',
          legacyOwner: '',
          confidence: 'MISSING',
          suggestedUser: expect.objectContaining({ id: admin.user.id }),
        }),
        expect.objectContaining({
          recordType: 'Project',
          recordId: records[4].id,
          title: 'Participant name project',
          legacyOwner: employeeA.employee.displayName,
          confidence: 'UNIQUE_NAME',
          suggestedUser: expect.objectContaining({ id: employeeA.user.id }),
        }),
      ]),
    );

    const unchanged = await prisma.project.findMany({
      where: { id: { in: records.map((r) => r.id) } },
      orderBy: { code: 'asc' },
    });
    expect(unchanged.every((r) => r.ownerUserId === null)).toBe(true);
  });

  it('applies assignments idempotently and assigns ambiguous/missing to super admin', async () => {
    const { records } = await createMigrationProjects();
    const idempotencyKey = `${prefix}-apply-1`;

    const analyzeResponse = await admin.agent
      .post('/api/admin/ownership-migration/analyze')
      .send({ batchSize: 10 })
      .expect(200);
    expect(analyzeResponse.body.data.items).toHaveLength(5);

    const applyResponse = await admin.agent
      .post('/api/admin/ownership-migration/apply')
      .send({ idempotencyKey })
      .expect(200);
    expect(applyResponse.body.data).toMatchObject({
      appliedCount: 5,
      unresolvedCount: 2,
    });

    const projects = await prisma.project.findMany({
      where: { id: { in: records.map((r) => r.id) } },
    });
    const byId = new Map(projects.map((p) => [p.id, p]));
    expect(records.map((r) => byId.get(r.id)?.ownerUserId)).toEqual([
      employeeB.user.id,
      employeeA.user.id,
      admin.user.id,
      admin.user.id,
      employeeA.user.id,
    ]);

    const auditCount = await prisma.loginAudit.count({
      where: {
        userId: admin.user.id,
        eventType: 'OWNERSHIP_ASSIGNED',
        success: true,
      },
    });
    expect(auditCount).toBeGreaterThanOrEqual(5);

    const secondApply = await admin.agent
      .post('/api/admin/ownership-migration/apply')
      .send({ idempotencyKey })
      .expect(200);
    expect(secondApply.body.data).toEqual(applyResponse.body.data);

    const auditCountAfter = await prisma.loginAudit.count({
      where: {
        userId: admin.user.id,
        eventType: 'OWNERSHIP_ASSIGNED',
        success: true,
      },
    });
    expect(auditCountAfter).toBe(auditCount);
  });

  it('lists unresolved blocking records and rejects completion until corrected', async () => {
    const { records, ambiguousLegacyValue } = await createMigrationProjects();
    const idempotencyKey = `${prefix}-apply-blockers`;

    await admin.agent
      .post('/api/admin/ownership-migration/apply')
      .send({ idempotencyKey })
      .expect(200);

    const unresolvedResponse = await admin.agent
      .get('/api/admin/ownership-migration/unresolved')
      .query({ batchSize: 10 })
      .expect(200);

    const unresolved = unresolvedResponse.body.data.items;
    expect(unresolved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordType: 'Project',
          recordId: records[2].id,
          legacyOwner: ambiguousLegacyValue,
          confidence: 'AMBIGUOUS',
        }),
        expect.objectContaining({
          recordType: 'Project',
          recordId: records[3].id,
          legacyOwner: '',
          confidence: 'MISSING',
        }),
      ]),
    );

    await admin.agent
      .post('/api/admin/ownership-migration/complete')
      .expect(409)
      .expect(({ body }) =>
        expect(body.error.code).toBe('OWNERSHIP_MIGRATION_INCOMPLETE'),
      );

    await admin.agent
      .put('/api/admin/ownership-migration/assignments')
      .send({
        assignments: [
          { recordType: 'Project', recordId: records[2].id, ownerUserId: employeeB.user.id },
          { recordType: 'Project', recordId: records[3].id, ownerUserId: employeeA.user.id },
        ],
      })
      .expect(200);

    const afterCorrection = await admin.agent
      .get('/api/admin/ownership-migration/unresolved')
      .query({ batchSize: 10 })
      .expect(200);
    expect(afterCorrection.body.data.items).toHaveLength(0);

    const completed = await admin.agent
      .post('/api/admin/ownership-migration/complete')
      .expect(200);
    expect(completed.body.data).toMatchObject({ completed: true });

    const status = await admin.agent
      .get('/api/admin/ownership-migration/status')
      .expect(200);
    expect(status.body.data).toMatchObject({
      isComplete: true,
      needsReview: 0,
    });
  });

  it('keeps total record counts unchanged', async () => {
    const before = await prisma.project.count({
      where: { code: { startsWith: prefix } },
    });

    await admin.agent
      .post('/api/admin/ownership-migration/apply')
      .send({ idempotencyKey: `${prefix}-apply-counts` })
      .expect(200);

    const after = await prisma.project.count({
      where: { code: { startsWith: prefix } },
    });
    expect(after).toBe(before);
  });
});
