import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { BackupsService } from '../../../../src/modules/workbench/governance/application/backups.service';
import { GovernanceSettingsService } from '../../../../src/modules/workbench/governance/application/governance-settings.service';
import { AuditLogService } from '../../../../src/modules/workbench/governance/application/audit-log.service';
import { DataHealthService } from '../../../../src/modules/workbench/governance/application/data-health.service';
import { RestorePreflightService } from '../../../../src/modules/workbench/governance/application/restore-preflight.service';
import { BackupsController } from '../../../../src/modules/workbench/governance/interface/http/backups.controller';
import { GovernanceSettingsController } from '../../../../src/modules/workbench/governance/interface/http/governance-settings.controller';
import { AuditLogsController } from '../../../../src/modules/workbench/governance/interface/http/audit-logs.controller';
import { DataHealthController } from '../../../../src/modules/workbench/governance/interface/http/data-health.controller';

describe('Governance HTTP contracts', () => {
  let app: INestApplication;
  const backups = {
    createManual: jest.fn().mockResolvedValue({ id: 'backup-1', status: 'VERIFIED' }),
    list: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }),
    get: jest.fn().mockResolvedValue({ id: 'backup-1' }),
    verify: jest.fn().mockResolvedValue({ id: 'backup-1', status: 'VERIFIED' }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const settings = {
    get: jest.fn().mockResolvedValue({ id: 'singleton', autoBackupEnabled: false }),
    update: jest.fn().mockImplementation((dto) => Promise.resolve({ id: 'singleton', ...dto })),
  };
  const audit = {
    list: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }),
  };
  const health = {
    check: jest.fn().mockResolvedValue({ status: 'OK', checks: [] }),
  };
  const restorePreflight = {
    create: jest.fn().mockResolvedValue({
      id: 'preflight-1',
      backupId: 'backup-1',
      confirmationToken: 'one-time-token',
      manifestSha256: 'a'.repeat(64),
    }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        BackupsController,
        GovernanceSettingsController,
        AuditLogsController,
        DataHealthController,
      ],
      providers: [
        { provide: BackupsService, useValue: backups },
        { provide: GovernanceSettingsService, useValue: settings },
        { provide: AuditLogService, useValue: audit },
        { provide: DataHealthService, useValue: health },
        { provide: RestorePreflightService, useValue: restorePreflight },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(() => app.close());

  it('exposes manual create/list/detail/verify/delete without accepting command parameters', async () => {
    await request(app.getHttpServer()).post('/api/governance/backups').send({}).expect(201);
    await request(app.getHttpServer())
      .post('/api/governance/backups')
      .send({ executable: 'sh' })
      .expect(400);
    await request(app.getHttpServer()).get('/api/governance/backups').expect(200);
    await request(app.getHttpServer()).get('/api/governance/backups/backup-1').expect(200);
    await request(app.getHttpServer()).post('/api/governance/backups/backup-1/verify').expect(201);
    await request(app.getHttpServer()).post('/api/governance/backups/backup-1/preflight').expect(201);
    expect(restorePreflight.create).toHaveBeenCalledWith('backup-1');
    await request(app.getHttpServer()).delete('/api/governance/backups/backup-1').expect(204);
  });

  it('validates settings and exposes filtered audit plus fast/deep health', async () => {
    await request(app.getHttpServer())
      .put('/api/governance/settings')
      .send({ autoBackupEnabled: true, autoBackupTimeLocal: '25:99', retentionDays: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .put('/api/governance/settings')
      .send({ autoBackupEnabled: true, autoBackupTimeLocal: '09:30', retentionDays: 30 })
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/governance/settings')
      .send({ autoBackupEnabled: false })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/governance/audit-logs?action=BACKUP_CREATE&outcome=SUCCEEDED')
      .expect(200);
    await request(app.getHttpServer()).get('/api/governance/health?deep=true').expect(200);
    expect(health.check).toHaveBeenLastCalledWith(expect.objectContaining({ deep: true }));
  });
});
