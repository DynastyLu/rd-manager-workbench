import { CommunicationType, ProjectStatus } from '@prisma/client';
import { validate } from 'class-validator';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { PartnersService } from '../../../../src/modules/workbench/management/application/partners.service';
import {
  UpdateCommunicationDto,
  UpdatePartnerAgreementDto,
  UpdatePartnerContactDto,
  UpdatePartnerDto,
} from '../../../../src/modules/workbench/management/interface/http/dto/management.dto';
import { TasksService } from '../../../../src/modules/workbench/tasks/application/tasks.service';

describe('PartnersService', () => {
  it('accepts partial partner-child updates and explicit nullable clears', async () => {
    const partner = Object.assign(new UpdatePartnerDto(), { shortName: null });
    const contact = Object.assign(new UpdatePartnerContactDto(), { phone: null });
    const agreement = Object.assign(new UpdatePartnerAgreementDto(), { endAt: null });
    const communication = Object.assign(new UpdateCommunicationDto(), {
      projectId: null,
      contactId: null,
      nextFollowUpAt: null,
    });

    await expect(validate(partner)).resolves.toEqual([]);
    await expect(validate(contact)).resolves.toEqual([]);
    await expect(validate(agreement)).resolves.toEqual([]);
    await expect(validate(communication)).resolves.toEqual([]);
  });

  it('rejects null for required fields when they are included in a partial update', async () => {
    const partner = Object.assign(new UpdatePartnerDto(), { name: null });
    const contact = Object.assign(new UpdatePartnerContactDto(), { name: null });
    const agreement = Object.assign(new UpdatePartnerAgreementDto(), { title: null });
    const communication = Object.assign(new UpdateCommunicationDto(), { subject: null });

    await expect(validate(partner)).resolves.not.toEqual([]);
    await expect(validate(contact)).resolves.not.toEqual([]);
    await expect(validate(agreement)).resolves.not.toEqual([]);
    await expect(validate(communication)).resolves.not.toEqual([]);
  });

  it('filters partner lists and returns relation aggregates', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'partner-1',
        name: 'Acme',
        _count: { contacts: 2, agreements: 1, projects: 3 },
      },
    ]);
    const count = jest.fn().mockResolvedValue(1);
    const prisma = {
      partner: { findMany, count },
      communicationRecord: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([
            {
              partnerId: 'partner-1',
              _max: { occurredAt: new Date('2026-07-19T08:00:00.000Z') },
            },
          ])
          .mockResolvedValueOnce([
            {
              partnerId: 'partner-1',
              _min: { nextFollowUpAt: new Date('2026-07-22T08:00:00.000Z') },
            },
          ]),
      },
      $transaction: jest.fn().mockResolvedValue([await findMany(), await count()]),
    } as unknown as PlatformPrismaService;
    const service = new PartnersService(prisma, {} as TasksService);

    const result = await service.list({
      q: 'Acme',
      projectId: 'project-1',
      nextFollowUpFrom: '2026-07-20T00:00:00.000Z',
      nextFollowUpBefore: '2026-07-31T23:59:59.999Z',
      page: 2,
      pageSize: 10,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          archivedAt: null,
          OR: [
            { name: { contains: 'Acme', mode: 'insensitive' } },
            { shortName: { contains: 'Acme', mode: 'insensitive' } },
            { category: { contains: 'Acme', mode: 'insensitive' } },
          ],
          projects: { some: { projectId: 'project-1' } },
          communications: {
            some: {
              archivedAt: null,
              nextFollowUpAt: {
                gte: new Date('2026-07-20T00:00:00.000Z'),
                lte: new Date('2026-07-31T23:59:59.999Z'),
              },
            },
          },
        },
        skip: 10,
        take: 10,
      }),
    );
    expect(result.data[0]).toMatchObject({
      contactCount: 2,
      activeAgreementCount: 1,
      projectCount: 3,
      lastCommunicationAt: new Date('2026-07-19T08:00:00.000Z'),
      nextFollowUpAt: new Date('2026-07-22T08:00:00.000Z'),
    });
    expect(result.data[0]).not.toHaveProperty('_count');
    expect(result.data[0]).not.toHaveProperty('communications');
  });

  it('revalidates communication contact, active project, and partner-project link on update', async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      partner: { findFirst: jest.fn().mockResolvedValue({ id: 'partner-1' }) },
      communicationRecord: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'communication-1',
          partnerId: 'partner-1',
          projectId: null,
          contactId: null,
          type: CommunicationType.EMAIL,
          occurredAt: new Date('2026-07-20T00:00:00.000Z'),
        }),
        update: jest.fn().mockResolvedValue({ id: 'communication-1' }),
      },
      partnerContact: {
        findFirst: jest.fn().mockResolvedValue({ id: 'contact-1', partnerId: 'partner-1' }),
      },
      project: {
        findFirst: jest.fn().mockResolvedValue({ id: 'project-1', status: ProjectStatus.ACTIVE }),
      },
      partnerProject: {
        findUnique: jest.fn().mockResolvedValue({
          partnerId: 'partner-1',
          projectId: 'project-1',
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    } as unknown as PlatformPrismaService;
    const service = new PartnersService(prisma, {} as TasksService);

    await service.updateCommunication('partner-1', 'communication-1', {
      contactId: 'contact-1',
      projectId: 'project-1',
      summary: null,
    });

    expect(transaction.partnerContact.findFirst).toHaveBeenCalledWith({
      where: { id: 'contact-1', partnerId: 'partner-1', archivedAt: null },
    });
    expect(transaction.project.findFirst).toHaveBeenCalledWith({
      where: { id: 'project-1', archivedAt: null, status: ProjectStatus.ACTIVE },
    });
    expect(transaction.partnerProject.findUnique).toHaveBeenCalledWith({
      where: {
        partnerId_projectId: { partnerId: 'partner-1', projectId: 'project-1' },
      },
    });
    expect(transaction.communicationRecord.update).toHaveBeenCalledWith({
      where: { id: 'communication-1' },
      data: { contactId: 'contact-1', projectId: 'project-1', summary: null },
    });
  });

  it('returns the existing source task after a communication was already converted', async () => {
    const existingTask = {
      id: 'task-1',
      sourceType: 'COMMUNICATION',
      sourceId: 'communication-1',
      dependencies: [],
      reminder: null,
      later: null,
    };
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      communicationRecord: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'communication-1',
          taskId: 'task-1',
        }),
      },
      workTask: { findUnique: jest.fn().mockResolvedValue(existingTask) },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    } as unknown as PlatformPrismaService;
    const tasks = { createTaskInTransaction: jest.fn() } as unknown as TasksService;
    const service = new PartnersService(prisma, tasks);

    await expect(
      service.createTaskForCommunication('communication-1', { title: 'Duplicate' }),
    ).resolves.toEqual({
      task: {
        id: 'task-1',
        sourceType: 'COMMUNICATION',
        sourceId: 'communication-1',
        dependencyIds: [],
        reminder: null,
        later: null,
      },
      alreadyExists: true,
    });
    expect(tasks.createTaskInTransaction).not.toHaveBeenCalled();
    expect(transaction.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.communicationRecord.findFirst.mock.invocationCallOrder[0],
    );
  });

  it('does not unlink a project while an active communication still references it', async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      partner: { findFirst: jest.fn().mockResolvedValue({ id: 'partner-1' }) },
      partnerProject: {
        findUnique: jest.fn().mockResolvedValue({
          partnerId: 'partner-1',
          projectId: 'project-1',
        }),
        delete: jest.fn(),
      },
      communicationRecord: { count: jest.fn().mockResolvedValue(1) },
    };
    const prisma = {
      partner: transaction.partner,
      partnerProject: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    } as unknown as PlatformPrismaService;
    const service = new PartnersService(prisma, {} as TasksService);

    await expect(service.unlinkProject('partner-1', 'project-1')).rejects.toMatchObject({
      code: 'PARTNER_HAS_ACTIVE_RECORDS',
      statusCode: 409,
      details: { communications: 1 },
    });
    expect(transaction.partnerProject.delete).not.toHaveBeenCalled();
  });

  it('preserves metadata on unchanged project links during projectIds replacement', async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      partner: {
        findFirst: jest.fn().mockResolvedValue({ id: 'partner-1' }),
        update: jest.fn().mockResolvedValue({ id: 'partner-1' }),
      },
      project: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'project-1' }, { id: 'project-2' }]),
      },
      partnerProject: {
        findMany: jest.fn().mockResolvedValue([
          { partnerId: 'partner-1', projectId: 'project-1', role: '联合研发', notes: '保留' },
        ]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    } as unknown as PlatformPrismaService;
    const service = new PartnersService(prisma, {} as TasksService);
    jest.spyOn(service, 'get').mockResolvedValue({ id: 'partner-1' } as never);

    await service.update('partner-1', { projectIds: ['project-1', 'project-2'] });

    expect(transaction.partnerProject.deleteMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId: 'project-1' }) }),
    );
    expect(transaction.partnerProject.createMany).toHaveBeenCalledWith({
      data: [{ partnerId: 'partner-1', projectId: 'project-2' }],
      skipDuplicates: true,
    });
    expect(transaction.partner.update).toHaveBeenCalledWith({
      where: { id: 'partner-1' },
      data: {},
    });
  });

  it('does not remove a projectIds relation that is still used by an active communication', async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      partner: {
        findFirst: jest.fn().mockResolvedValue({ id: 'partner-1' }),
        update: jest.fn().mockResolvedValue({ id: 'partner-1' }),
      },
      project: { findMany: jest.fn().mockResolvedValue([]) },
      partnerProject: {
        findMany: jest.fn().mockResolvedValue([{ projectId: 'project-1' }]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      communicationRecord: { count: jest.fn().mockResolvedValue(1) },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    } as unknown as PlatformPrismaService;
    const service = new PartnersService(prisma, {} as TasksService);
    jest.spyOn(service, 'get').mockResolvedValue({ id: 'partner-1' } as never);

    await expect(service.update('partner-1', { projectIds: [] })).rejects.toMatchObject({
      code: 'PARTNER_HAS_ACTIVE_RECORDS',
      statusCode: 409,
      details: { communications: 1 },
    });
    expect(transaction.partnerProject.deleteMany).not.toHaveBeenCalled();
  });

  it('uses the same partner advisory lock for child writes and partner archive', async () => {
    const childTx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      partner: { findFirst: jest.fn().mockResolvedValue({ id: 'partner-1' }) },
      partnerContact: { create: jest.fn().mockResolvedValue({ id: 'contact-1' }) },
    };
    const childPrisma = {
      $transaction: jest.fn(async (work: (tx: typeof childTx) => Promise<unknown>) => work(childTx)),
    } as unknown as PlatformPrismaService;
    const childService = new PartnersService(childPrisma, {} as TasksService);
    await childService.createContact('partner-1', { name: 'Alice' });

    const archiveTx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      partner: {
        findFirst: jest.fn().mockResolvedValue({ id: 'partner-1' }),
        update: jest.fn().mockResolvedValue({ id: 'partner-1' }),
      },
      partnerContact: { count: jest.fn().mockResolvedValue(0) },
      partnerAgreement: { count: jest.fn().mockResolvedValue(0) },
      communicationRecord: { count: jest.fn().mockResolvedValue(0) },
      partnerProject: { count: jest.fn().mockResolvedValue(0) },
      fileAsset: { count: jest.fn().mockResolvedValue(0) },
    };
    const archivePrisma = {
      $transaction: jest.fn(async (work: (tx: typeof archiveTx) => Promise<unknown>) =>
        work(archiveTx),
      ),
    } as unknown as PlatformPrismaService;
    const archiveService = new PartnersService(archivePrisma, {} as TasksService);
    await archiveService.archive('partner-1');

    expect(childTx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(archiveTx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(childTx.$executeRaw.mock.calls[0]?.[0])).toContain('partner-1');
    expect(JSON.stringify(archiveTx.$executeRaw.mock.calls[0]?.[0])).toContain('partner-1');
  });

  it('blocks partner archive while active partner attachments remain', async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      partner: {
        findFirst: jest.fn().mockResolvedValue({ id: 'partner-1' }),
        update: jest.fn(),
      },
      partnerContact: { count: jest.fn().mockResolvedValue(0) },
      partnerAgreement: { count: jest.fn().mockResolvedValue(0) },
      communicationRecord: { count: jest.fn().mockResolvedValue(0) },
      partnerProject: { count: jest.fn().mockResolvedValue(0) },
      fileAsset: { count: jest.fn().mockResolvedValue(1) },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    } as unknown as PlatformPrismaService;
    const service = new PartnersService(prisma, {} as TasksService);

    await expect(service.archive('partner-1')).rejects.toMatchObject({
      code: 'PARTNER_HAS_ACTIVE_RECORDS',
      statusCode: 409,
      details: { files: 1 },
    });
    expect(transaction.partner.update).not.toHaveBeenCalled();
  });
});
