import { HttpStatus } from '@nestjs/common';
import { LoadEntryKind } from '@prisma/client';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { ResourcesService } from '../../../../src/modules/workbench/operations/application/resources.service';

describe('ResourcesService', () => {
  it('requires a UTC Monday for load entries', async () => {
    const service = new ResourcesService({
      resourceProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'resource-1' }) },
    } as unknown as PlatformPrismaService);
    await expect(
      service.createLoadEntry('resource-1', {
        weekStartAt: '2026-07-21',
        kind: LoadEntryKind.OTHER,
        plannedHours: 8,
      }),
    ).rejects.toMatchObject({
      code: 'RESOURCE_LOAD_REFERENCE_INVALID',
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    });
  });

  it('validates the active referenced object for each load kind', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValueOnce([{ id: 'resource-1' }]).mockResolvedValueOnce([]),
      resourceLoadEntry: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)), resourceLoadEntry: tx.resourceLoadEntry } as unknown as PlatformPrismaService;
    const service = new ResourcesService(prisma);
    await expect(
      service.createLoadEntry('resource-1', {
        weekStartAt: '2026-07-20',
        kind: LoadEntryKind.PROJECT,
        projectId: 'archived-project',
        plannedHours: 12,
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LOAD_REFERENCE_INVALID' });
    expect(prisma.resourceLoadEntry.create).not.toHaveBeenCalled();
  });

  it('rejects mismatched or multiple reference fields', async () => {
    const service = new ResourcesService({
      resourceProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'resource-1' }) },
    } as unknown as PlatformPrismaService);
    await expect(
      service.createLoadEntry('resource-1', {
        weekStartAt: '2026-07-20',
        kind: LoadEntryKind.TASK,
        taskId: 'task-1',
        projectId: 'project-1',
        plannedHours: 4,
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LOAD_REFERENCE_INVALID' });
  });

  it('calculates capacity, exact percentages and overload for a 13-week matrix', async () => {
    const prisma = {
      resourceProfile: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'resource-1',
            displayName: '研发主管',
            weeklyCapacityHours: 40,
            loadEntries: [
              { id: 'load-1', weekStartAt: new Date('2026-07-20T00:00:00.000Z'), kind: 'PROJECT', plannedHours: { toString: () => '45.25' } },
            ],
          },
        ]),
      },
    } as unknown as PlatformPrismaService;
    const service = new ResourcesService(prisma);
    const summary = await service.loadSummary({
      fromWeek: '2026-07-20',
      toWeek: '2026-07-20',
    });
    expect(summary).toEqual([
      expect.objectContaining({
        id: 'resource-1',
        weeks: [
          expect.objectContaining({
            weekStartAt: '2026-07-20',
            plannedHours: 45.25,
            capacityHours: 40,
            percent: 113.13,
            overloaded: true,
            byKind: { PROJECT: 45.25 },
          }),
        ],
      }),
    ]);
  });

  it('rejects ranges longer than 13 weeks', async () => {
    const service = new ResourcesService({} as PlatformPrismaService);
    await expect(
      service.loadSummary({ fromWeek: '2026-01-05', toWeek: '2026-04-06' }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LOAD_RANGE_INVALID', statusCode: 422 });
  });

  it('marks non-zero load against zero capacity as overloaded with an uncomputable percentage', async () => {
    const service = new ResourcesService({ resourceProfile: { findMany: jest.fn().mockResolvedValue([{
      id: 'resource-zero', displayName: '外部协作', weeklyCapacityHours: 0,
      loadEntries: [{ id: 'load-zero', weekStartAt: new Date('2026-07-20T00:00:00.000Z'), kind: 'OTHER', plannedHours: 4 }],
    }]) } } as unknown as PlatformPrismaService);
    const [resource] = await service.loadSummary({ fromWeek: '2026-07-20', toWeek: '2026-07-20' });
    expect(resource.weeks[0]).toEqual(expect.objectContaining({ percent: null, overloaded: true }));
  });

  it('locks and validates the active resource and reference in the same transaction as load creation', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'active' }]),
      resourceLoadEntry: { create: jest.fn().mockResolvedValue({ id: 'load-1' }) },
    };
    const prisma = { $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)) } as unknown as PlatformPrismaService;
    const service = new ResourcesService(prisma);
    await service.createLoadEntry('resource-1', { weekStartAt: '2026-07-20', kind: LoadEntryKind.PROJECT, projectId: 'project-1', plannedHours: 8 });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.resourceLoadEntry.create).toHaveBeenCalledTimes(1);
  });
});
