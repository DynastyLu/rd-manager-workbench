import { ApplicationsSearchAdapter } from '../../../../src/modules/workbench/search/adapters/applications-search.adapter';
import { ContentSearchAdapter } from '../../../../src/modules/workbench/search/adapters/content-search.adapter';
import { ProjectsSearchAdapter } from '../../../../src/modules/workbench/search/adapters/projects-search.adapter';
import { TasksSearchAdapter } from '../../../../src/modules/workbench/search/adapters/tasks-search.adapter';

describe('core search adapters', () => {
  it('searches active projects with a bounded structured query and safe candidate shape', async () => {
    const prisma = {
      project: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'project/1',
            code: 'RD-001',
            name: '量子研发计划',
            researchDirection: '量子传感',
            objective: `验证关键器件${'长'.repeat(300)}`,
            expectedOutcome: '形成样机',
            updatedAt: new Date('2026-07-20T00:00:00.000Z'),
          },
        ]),
      },
    };
    const adapter = new ProjectsSearchAdapter(prisma as never);

    const candidates = await adapter.search('量子', ['PROJECT']);

    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          archivedAt: null,
          OR: expect.arrayContaining([
            { code: { contains: '量子', mode: 'insensitive' } },
            { name: { contains: '量子', mode: 'insensitive' } },
          ]),
        },
        take: 100,
      }),
    );
    expect(candidates).toEqual([
      expect.objectContaining({
        type: 'PROJECT',
        id: 'project/1',
        title: '量子研发计划',
        path: '/spaces/projects/project%2F1/overview',
        actions: ['OPEN', 'COPY_LINK'],
      }),
    ]);
    expect(Array.from(candidates[0].snippet ?? '')).toHaveLength(240);
  });

  it('searches only active tasks and returns real task links and status actions', async () => {
    const prisma = {
      workTask: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'task 1',
            title: '完成量子实验',
            description: '整理实验记录',
            assigneeName: '林工',
            collaboratorNames: [],
            status: 'IN_PROGRESS',
            projectId: 'project-1',
            updatedAt: new Date('2026-07-20T01:00:00.000Z'),
          },
          {
            id: 'task-2',
            title: '复核量子报告',
            description: null,
            assigneeName: null,
            collaboratorNames: [],
            status: 'DONE',
            projectId: null,
            updatedAt: new Date('2026-07-20T00:00:00.000Z'),
          },
          {
            id: 'task-collaborator',
            title: '整理实验数据',
            description: null,
            assigneeName: null,
            collaboratorNames: ['量子专家'],
            status: 'TODO',
            projectId: null,
            updatedAt: new Date('2026-07-19T00:00:00.000Z'),
          },
          {
            id: 'task-cancelled',
            title: '取消的量子任务',
            description: null,
            assigneeName: null,
            collaboratorNames: [],
            status: 'CANCELLED',
            projectId: null,
            updatedAt: new Date('2026-07-18T00:00:00.000Z'),
          },
        ]),
      },
    };
    const adapter = new TasksSearchAdapter(prisma as never);

    const candidates = await adapter.search('量子', ['TASK']);

    expect(prisma.workTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: null,
          OR: expect.arrayContaining([
            { title: { contains: '量子', mode: 'insensitive' } },
            { description: { contains: '量子', mode: 'insensitive' } },
          ]),
        }),
        take: 100,
      }),
    );
    expect(candidates).toEqual([
      expect.objectContaining({
        id: 'task 1',
        path: '/my-work?taskId=task%201',
        actions: ['OPEN', 'COPY_LINK', 'COMPLETE_TASK'],
      }),
      expect.objectContaining({
        id: 'task-2',
        actions: ['OPEN', 'COPY_LINK', 'REOPEN_TASK'],
      }),
      expect.objectContaining({
        id: 'task-collaborator',
        snippet: expect.stringContaining('量子专家'),
      }),
      expect.objectContaining({
        id: 'task-cancelled',
        actions: ['OPEN', 'COPY_LINK'],
      }),
    ]);
  });

  it('searches active application cases through fields and active projects', async () => {
    const prisma = {
      applicationCase: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'case?1',
            code: 'APP-001',
            title: '量子项目申报',
            subjectName: '重点研发',
            organization: '科技厅',
            region: '上海',
            batch: '2026',
            updatedAt: new Date('2026-07-20T02:00:00.000Z'),
          },
        ]),
      },
    };
    const adapter = new ApplicationsSearchAdapter(prisma as never);

    const candidates = await adapter.search('量子', ['APPLICATION_CASE']);

    expect(prisma.applicationCase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: null,
          project: { archivedAt: null },
          OR: expect.arrayContaining([
            { code: { contains: '量子', mode: 'insensitive' } },
            { title: { contains: '量子', mode: 'insensitive' } },
          ]),
        }),
        take: 100,
      }),
    );
    expect(candidates).toEqual([
      expect.objectContaining({
        type: 'APPLICATION_CASE',
        path: '/library/applications?caseId=case%3F1',
        actions: ['OPEN', 'COPY_LINK'],
      }),
    ]);
  });

  it('searches active documents and files without exposing storage keys', async () => {
    const prisma = {
      contentDocument: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'document-1',
            title: '实验记录',
            plainText: `${'<img src=x onerror=alert(1)>'.repeat(12)}量子结果`,
            tags: [],
            isFavorite: false,
            updatedAt: new Date('2026-07-20T03:00:00.000Z'),
          },
        ]),
      },
      fileAsset: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'file-1',
            name: '量子数据.csv',
            documentId: 'document-1',
            projectId: 'project-1',
            meetingId: null,
            updatedAt: new Date('2026-07-20T04:00:00.000Z'),
            versions: [
              {
                originalName: '量子原始数据.csv',
                mimeType: 'text/csv',
                size: 128,
                storageKey: 'private/secret-key',
              },
            ],
          },
        ]),
      },
    };
    const adapter = new ContentSearchAdapter(prisma as never);

    const candidates = await adapter.search('量子', ['DOCUMENT', 'FILE']);

    expect(prisma.contentDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE', trashedAt: null }),
        take: 100,
      }),
    );
    expect(prisma.fileAsset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          trashedAt: null,
          AND: expect.arrayContaining([
            {
              OR: [
                { documentId: { not: null } },
                { projectId: { not: null } },
                { meetingId: { not: null } },
              ],
            },
            {
              OR: [
                { documentId: null },
                {
                  document: expect.objectContaining({
                    status: 'ACTIVE',
                    trashedAt: null,
                    AND: expect.any(Array),
                  }),
                },
              ],
            },
          ]),
        }),
        take: 100,
      }),
    );
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'DOCUMENT',
          path: '/docs?documentId=document-1',
          snippet: expect.stringContaining('量子结果'),
          actions: ['OPEN', 'COPY_LINK', 'TOGGLE_DOCUMENT_FAVORITE'],
        }),
        expect.objectContaining({
          type: 'FILE',
          path: '/docs?documentId=document-1&fileId=file-1',
          actions: ['OPEN', 'COPY_LINK'],
        }),
      ]),
    );
    expect(JSON.stringify(candidates)).not.toContain('private/secret-key');
  });

  it('keeps a matching historical file name in the scoreable snippet', async () => {
    const prisma = {
      contentDocument: { findMany: jest.fn() },
      fileAsset: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'file-history',
            name: '实验数据.csv',
            documentId: null,
            projectId: 'project-1',
            meetingId: null,
            updatedAt: new Date('2026-07-20T04:00:00.000Z'),
            versions: [{ originalName: '量子历史数据.csv', mimeType: 'text/csv', size: 128 }],
          },
        ]),
      },
    };
    const adapter = new ContentSearchAdapter(prisma as never);

    const candidates = await adapter.search('量子', ['FILE']);

    expect(prisma.fileAsset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: [
                { documentId: { not: null } },
                { projectId: { not: null } },
                { meetingId: { not: null } },
              ],
            },
          ]),
        }),
        select: expect.objectContaining({
          versions: expect.objectContaining({
            where: { originalName: { contains: '量子', mode: 'insensitive' } },
          }),
        }),
      }),
    );
    expect(candidates[0].snippet).toContain('量子历史数据.csv');
  });

  it('routes files to their existing owner page and skips unrequested content types', async () => {
    const prisma = {
      contentDocument: { findMany: jest.fn() },
      fileAsset: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'file-meeting',
            name: '会议附件.pdf',
            documentId: null,
            projectId: 'project-1',
            meetingId: 'meeting/1',
            updatedAt: new Date('2026-07-20T04:00:00.000Z'),
            versions: [],
          },
          {
            id: 'file-project',
            name: '项目附件.pdf',
            documentId: null,
            projectId: 'project/1',
            meetingId: null,
            updatedAt: new Date('2026-07-20T03:00:00.000Z'),
            versions: [],
          },
          {
            id: 'file-loose',
            name: '未归属附件.pdf',
            documentId: null,
            projectId: null,
            meetingId: null,
            updatedAt: new Date('2026-07-20T02:00:00.000Z'),
            versions: [],
          },
        ]),
      },
    };
    const adapter = new ContentSearchAdapter(prisma as never);

    const candidates = await adapter.search('附件', ['FILE']);

    expect(prisma.contentDocument.findMany).not.toHaveBeenCalled();
    expect(candidates.map(({ path }) => path)).toEqual([
      '/calendar?meetingId=meeting%2F1&fileId=file-meeting',
      '/spaces/projects/project%2F1/docs?fileId=file-project',
    ]);
  });
});
