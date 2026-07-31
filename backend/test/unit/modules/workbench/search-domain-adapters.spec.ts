import { RequestContextService } from '../../../../src/infrastructure/context/request-context.service';
import { DataScopeService } from '../../../../src/modules/iam/application/data-scope.service';
import { BaseSearchAdapter } from '../../../../src/modules/workbench/search/adapters/base-search.adapter';
import { ManagementSearchAdapter } from '../../../../src/modules/workbench/search/adapters/management-search.adapter';

const mockPrincipal = {
  userId: 'user-1',
  employeeId: 'employee-1',
  username: 'tester',
  sessionId: 'session-1',
  roleCodes: ['EMPLOYEE'],
  permissions: [],
  permissionVersion: 1,
  mustChangePassword: false,
};
const mockRequestContext = {
  requirePrincipal: jest.fn().mockReturnValue(mockPrincipal),
} as unknown as RequestContextService;
const mockDataScope = {
  meetings: jest.fn().mockReturnValue({}),
  risks: jest.fn().mockReturnValue({}),
  issues: jest.fn().mockReturnValue({}),
  decisions: jest.fn().mockReturnValue({}),
  partners: jest.fn().mockReturnValue({}),
  communications: jest.fn().mockReturnValue({}),
  baseRecords: jest.fn().mockReturnValue({}),
} as unknown as DataScopeService;

describe('domain search adapters', () => {
  it('searches active management objects and never exposes partner contact details', async () => {
    const prisma = {
      meeting: { findMany: jest.fn().mockResolvedValue([]) },
      risk: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'risk-1',
            title: '供应风险',
            description: '关键器件延期',
            mitigation: '准备替代方案',
            projectId: 'project-1',
            updatedAt: new Date('2026-07-20T00:00:00.000Z'),
          },
        ]),
      },
      issue: { findMany: jest.fn().mockResolvedValue([]) },
      decision: { findMany: jest.fn().mockResolvedValue([]) },
      partner: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'partner-1',
            name: '星海研究院',
            shortName: '星海',
            category: '高校',
            notes: '联合实验室',
            updatedAt: new Date('2026-07-19T00:00:00.000Z'),
          },
        ]),
      },
      communicationRecord: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const adapter = new ManagementSearchAdapter(prisma as never, mockRequestContext, mockDataScope);

    const candidates = await adapter.search('研究', ['RISK', 'PARTNER']);

    expect(prisma.risk.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              archivedAt: null,
              AND: expect.arrayContaining([
                { OR: [{ projectId: null }, { project: { archivedAt: null } }] },
                { OR: [{ taskId: null }, { task: { archivedAt: null } }] },
              ]),
            }),
            {},
          ]),
        }),
        take: 100,
      }),
    );
    expect(prisma.partner.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ archivedAt: null }),
            {},
          ]),
        }),
        take: 100,
      }),
    );
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'PARTNER',
          id: 'partner-1',
          path: '/library/governance/partners?recordId=partner-1',
        }),
      ]),
    );
    expect(JSON.stringify(candidates)).not.toMatch(/phone|email|contact/i);
  });

  it('caps a multi-type management adapter at 100 candidates after relevance ordering', async () => {
    const prisma = {
      meeting: { findMany: jest.fn().mockResolvedValue([]) },
      risk: {
        findMany: jest.fn().mockResolvedValue(
          Array.from({ length: 100 }, (_, index) => ({
            id: `risk-${index}`,
            title: `研发风险 ${index}`,
            description: null,
            mitigation: null,
            projectId: null,
            status: 'OPEN',
            updatedAt: new Date('2026-07-20T00:00:00.000Z'),
          })),
        ),
      },
      issue: { findMany: jest.fn().mockResolvedValue([]) },
      decision: { findMany: jest.fn().mockResolvedValue([]) },
      partner: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'partner-best',
            name: '研发',
            shortName: null,
            category: null,
            notes: null,
            updatedAt: new Date('2026-07-20T00:00:00.000Z'),
          },
        ]),
      },
      communicationRecord: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const adapter = new ManagementSearchAdapter(prisma as never, mockRequestContext, mockDataScope);

    const candidates = await adapter.search('研发', ['RISK', 'PARTNER']);

    expect(candidates).toHaveLength(100);
    expect(candidates[0]).toMatchObject({ type: 'PARTNER', id: 'partner-best' });
  });

  it('filters archived optional relations for every linked management type', async () => {
    const prisma = {
      meeting: { findMany: jest.fn().mockResolvedValue([]) },
      risk: { findMany: jest.fn().mockResolvedValue([]) },
      issue: { findMany: jest.fn().mockResolvedValue([]) },
      decision: { findMany: jest.fn().mockResolvedValue([]) },
      partner: { findMany: jest.fn().mockResolvedValue([]) },
      communicationRecord: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const adapter = new ManagementSearchAdapter(prisma as never, mockRequestContext, mockDataScope);

    await adapter.search('研发', ['MEETING', 'ISSUE', 'DECISION', 'COMMUNICATION']);

    expect(prisma.meeting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              AND: [{ OR: [{ projectId: null }, { project: { archivedAt: null } }] }],
            }),
            {},
          ]),
        }),
      }),
    );
    expect(prisma.issue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              AND: expect.arrayContaining([
                { OR: [{ projectId: null }, { project: { archivedAt: null } }] },
                { OR: [{ taskId: null }, { task: { archivedAt: null } }] },
              ]),
            }),
            {},
          ]),
        }),
      }),
    );
    expect(prisma.decision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              AND: expect.arrayContaining([
                { OR: [{ projectId: null }, { project: { archivedAt: null } }] },
                { OR: [{ taskId: null }, { task: { archivedAt: null } }] },
                { OR: [{ meetingId: null }, { meeting: { archivedAt: null } }] },
              ]),
            }),
            {},
          ]),
        }),
      }),
    );
    expect(prisma.communicationRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              partner: { archivedAt: null },
              AND: [{ OR: [{ projectId: null }, { project: { archivedAt: null } }] }],
            }),
            {},
          ]),
        }),
      }),
    );
  });

  it('only searches records from active CUSTOM tables and derives the title from the primary field', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'record-1' }]),
      dataRecord: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'record-1',
            tableId: 'table-1',
            values: { name: '明日面试', notes: '<img src=x onerror=alert(1)>' },
            updatedAt: new Date('2026-07-20T01:00:00.000Z'),
            table: {
              id: 'table-1',
              name: '面试计划',
              source: 'CUSTOM',
              archivedAt: null,
              fields: [{ key: 'name', isPrimary: true }],
            },
          },
        ]),
      },
    };
    const adapter = new BaseSearchAdapter(prisma as never, mockRequestContext, mockDataScope);

    const candidates = await adapter.search('面试', ['BASE_RECORD']);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.dataRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              id: { in: ['record-1'] },
              table: { source: 'CUSTOM', archivedAt: null },
            },
            {},
          ]),
        }),
        take: 100,
      }),
    );
    expect(candidates).toEqual([
      expect.objectContaining({
        type: 'BASE_RECORD',
        title: '明日面试',
        path: '/base?tableId=table-1&recordId=record-1',
      }),
    ]);
  });
});
