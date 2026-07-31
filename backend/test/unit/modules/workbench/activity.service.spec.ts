import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { RequestContextService } from '../../../../src/infrastructure/context/request-context.service';
import { DataScopeService } from '../../../../src/modules/iam/application/data-scope.service';
import { ActivityService } from '../../../../src/modules/workbench/activity/application/activity.service';

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
  activities: jest.fn().mockReturnValue({}),
} as unknown as DataScopeService;

describe('ActivityService', () => {
  it('appends a safe immutable activity record', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'activity-1' });
    const prisma = {
      activityRecord: { create },
    } as unknown as PlatformPrismaService;
    const service = new ActivityService(prisma, mockRequestContext, mockDataScope);

    await service.append({
      actorKind: 'AUTOMATION',
      objectType: 'PROJECT_PROGRESS_DRAFT',
      objectId: 'draft-1',
      projectId: 'project-1',
      employeeId: 'employee-1',
      action: 'ADOPTED',
      summary: '  采纳\u0000  项目进展草稿  ',
      sourcePath: '/projects/project-1?tab=progress',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        actorKind: 'AUTOMATION',
        actorId: null,
        actorName: null,
        objectType: 'PROJECT_PROGRESS_DRAFT',
        objectId: 'draft-1',
        projectId: 'project-1',
        employeeId: 'employee-1',
        action: 'ADOPTED',
        summary: '采纳 项目进展草稿',
        sourcePath: '/projects/project-1?tab=progress',
        metadata: undefined,
        occurredAt: undefined,
      },
    });
  });

  it('uses a stable cursor while filtering a project activity stream', async () => {
    const boundary = new Date('2026-07-28T09:00:00.000Z');
    const findMany = jest.fn().mockResolvedValue([
      { id: 'activity-2', occurredAt: new Date('2026-07-28T08:00:00.000Z') },
      { id: 'activity-1', occurredAt: new Date('2026-07-28T07:00:00.000Z') },
      { id: 'extra', occurredAt: new Date('2026-07-28T06:00:00.000Z') },
    ]);
    const prisma = {
      activityRecord: { findMany },
    } as unknown as PlatformPrismaService;
    const service = new ActivityService(prisma, mockRequestContext, mockDataScope);
    const cursor = service.encodeCursor({ occurredAt: boundary, id: 'activity-3' });

    const result = await service.list({
      projectId: 'project-1',
      objectType: 'WORK_TASK',
      actorKind: 'HUMAN',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T23:59:59.999Z',
      cursor,
      limit: 2,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            projectId: 'project-1',
            objectType: 'WORK_TASK',
            actorKind: 'HUMAN',
            occurredAt: {
              gte: new Date('2026-07-01T00:00:00.000Z'),
              lte: new Date('2026-07-31T23:59:59.999Z'),
            },
            AND: [
              {
                OR: [
                  { occurredAt: { lt: boundary } },
                  { occurredAt: boundary, id: { lt: 'activity-3' } },
                ],
              },
            ],
          },
          {},
        ],
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 3,
    });
    expect(result.data).toHaveLength(2);
    expect(result.nextCursor).toEqual(expect.any(String));
  });
});
