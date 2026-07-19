import { DataTableSource } from '@prisma/client';
import { PlatformPrismaService } from '../../../../../src/infrastructure/prisma/platform-prisma.service';
import { SystemRecordsAdapter } from '../../../../../src/modules/workbench/base/adapters/system-records.adapter';

describe('SystemRecordsAdapter.findByIds', () => {
  let prisma: Record<string, { findMany: jest.Mock }>;
  let adapter: SystemRecordsAdapter;

  beforeEach(() => {
    prisma = Object.fromEntries(
      [
        'project',
        'workTask',
        'contentDocument',
        'meeting',
        'meetingAction',
        'risk',
        'decision',
      ].map((model) => [model, { findMany: jest.fn().mockResolvedValue([]) }]),
    );
    adapter = new SystemRecordsAdapter(
      prisma as unknown as PlatformPrismaService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('returns immediately for an empty id batch without querying any system model', async () => {
    await expect(adapter.findByIds(DataTableSource.PROJECTS, [])).resolves.toEqual([]);
    for (const model of Object.values(prisma)) expect(model.findMany).not.toHaveBeenCalled();
  });

  it.each([
    [DataTableSource.PROJECTS, 'project', { archivedAt: null }],
    [DataTableSource.WORK_TASKS, 'workTask', { archivedAt: null }],
    [DataTableSource.DOCUMENTS, 'contentDocument', { status: 'ACTIVE' }],
  ] as const)('pushes unique ids into the %s Prisma query', async (source, model, baseWhere) => {
    await adapter.findByIds(source, ['second', 'first', 'second']);

    expect(prisma[model].findMany).toHaveBeenCalledTimes(1);
    expect(prisma[model].findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ...baseWhere, id: { in: ['second', 'first'] } },
      }),
    );
  });

  it('splits meeting and action composite ids and ignores invalid prefixes', async () => {
    prisma.meeting.findMany.mockResolvedValue([
      {
        id: 'meeting-1',
        title: '周会',
        status: 'PLANNED',
        scheduledAt: date,
        createdAt: date,
        updatedAt: date,
      },
    ]);
    prisma.meetingAction.findMany.mockResolvedValue([
      {
        id: 'action-1',
        meetingId: 'meeting-1',
        title: '行动',
        status: 'OPEN',
        ownerName: null,
        dueAt: null,
        taskId: null,
        meeting: { title: '周会' },
        createdAt: date,
        updatedAt: date,
      },
    ]);

    const result = await adapter.findByIds(DataTableSource.MEETING_ACTIONS, [
      'MEETING:meeting-1',
      'ACTION:action-1',
      'MEETING:meeting-1',
      'RISK:risk-1',
      'invalid',
      'ACTION:',
    ]);

    expect(prisma.meeting.findMany).toHaveBeenCalledWith({
      where: { archivedAt: null, id: { in: ['meeting-1'] } },
    });
    expect(prisma.meetingAction.findMany).toHaveBeenCalledWith({
      where: { archivedAt: null, id: { in: ['action-1'] } },
      include: { meeting: { select: { title: true } } },
    });
    expect(result.map((record) => record.id)).toEqual(
      expect.arrayContaining(['MEETING:meeting-1', 'ACTION:action-1']),
    );
  });

  it('splits risk and decision composite ids and ignores invalid prefixes', async () => {
    prisma.risk.findMany.mockResolvedValue([
      {
        id: 'risk-1',
        title: '风险',
        status: 'OPEN',
        level: 'HIGH',
        ownerName: null,
        projectId: null,
        createdAt: date,
        updatedAt: date,
      },
    ]);
    prisma.decision.findMany.mockResolvedValue([
      {
        id: 'decision-1',
        title: '决策',
        status: 'DRAFT',
        projectId: null,
        participantNames: [],
        createdAt: date,
        updatedAt: date,
      },
    ]);

    const result = await adapter.findByIds(DataTableSource.RISKS_DECISIONS, [
      'RISK:risk-1',
      'DECISION:decision-1',
      'DECISION:decision-1',
      'MEETING:meeting-1',
      'broken',
      'RISK:',
    ]);

    expect(prisma.risk.findMany).toHaveBeenCalledWith({
      where: { archivedAt: null, id: { in: ['risk-1'] } },
    });
    expect(prisma.decision.findMany).toHaveBeenCalledWith({
      where: { archivedAt: null, id: { in: ['decision-1'] } },
    });
    expect(result.map((record) => record.id)).toEqual(
      expect.arrayContaining(['RISK:risk-1', 'DECISION:decision-1']),
    );
  });

  it.each([
    [DataTableSource.MEETING_ACTIONS, ['meeting', 'meetingAction']],
    [DataTableSource.RISKS_DECISIONS, ['risk', 'decision']],
  ] as const)(
    'does not query composite models when no id has a valid %s prefix',
    async (source, models) => {
      await expect(
        adapter.findByIds(source, ['invalid', 'PROJECT:project-1', 'RISK:']),
      ).resolves.toEqual([]);
      for (const model of models) expect(prisma[model].findMany).not.toHaveBeenCalled();
    },
  );
});

const date = new Date('2026-07-19T00:00:00.000Z');
