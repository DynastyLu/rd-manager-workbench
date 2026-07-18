import { MeetingStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { MeetingsService } from '../../../../src/modules/workbench/management/application/meetings.service';
import { TasksService } from '../../../../src/modules/workbench/tasks/application/tasks.service';
import { UpdateMeetingActionDto } from '../../../../src/modules/workbench/management/interface/http/dto/management.dto';
import { validate } from 'class-validator';

describe('MeetingsService', () => {
  it('accepts partial action updates without requiring the title', async () => {
    const dto = Object.assign(new UpdateMeetingActionDto(), { status: 'DONE' });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('clears an action due date when the update explicitly sends null', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findUnique = jest.fn().mockResolvedValue({ id: 'action-1', dueAt: null });
    const prisma = {
      meetingAction: { updateMany, findUnique },
    } as unknown as PlatformPrismaService;
    const service = new MeetingsService(prisma, {} as TasksService);

    await service.updateAction('meeting-1', 'action-1', { dueAt: null });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'action-1', meetingId: 'meeting-1', archivedAt: null },
      data: { dueAt: null },
    });
  });

  it('filters meetings by project, status, and scheduled time range', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      meeting: { findMany, count },
      $transaction: jest.fn().mockResolvedValue([[], 0]),
    } as unknown as PlatformPrismaService;
    const service = new MeetingsService(prisma, {} as TasksService);

    await service.list({
      projectId: 'project-1',
      status: MeetingStatus.PLANNED,
      startFrom: '2026-07-01T00:00:00.000Z',
      startTo: '2026-07-31T23:59:59.999Z',
      page: 2,
      pageSize: 15,
    });

    const where = {
      archivedAt: null,
      projectId: 'project-1',
      status: MeetingStatus.PLANNED,
      scheduledAt: {
        gte: new Date('2026-07-01T00:00:00.000Z'),
        lte: new Date('2026-07-31T23:59:59.999Z'),
      },
    };
    expect(findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ scheduledAt: 'asc' }],
      skip: 15,
      take: 15,
    });
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('returns agenda, actions, decisions, minutes document, and active attachments', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'meeting-1',
      agendaItems: [{ id: 'agenda-1' }],
      actions: [{ id: 'action-1' }],
      decisions: [{ id: 'decision-1' }],
      minutesDocument: { id: 'document-1', type: 'MEETING_MINUTES' },
      fileAssets: [
        {
          id: 'file-1',
          name: 'notes.pdf',
          versions: [{ id: 'version-2', versionNumber: 2 }],
        },
      ],
    });
    const prisma = { meeting: { findFirst } } as unknown as PlatformPrismaService;
    const service = new MeetingsService(prisma, {} as TasksService);

    await expect(service.get('meeting-1')).resolves.toMatchObject({
      id: 'meeting-1',
      agendaItems: [{ id: 'agenda-1' }],
      actions: [{ id: 'action-1' }],
      decisions: [{ id: 'decision-1' }],
      minutesDocument: { id: 'document-1' },
      attachments: [
        {
          id: 'file-1',
          name: 'notes.pdf',
          latestVersion: { id: 'version-2', versionNumber: 2 },
        },
      ],
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'meeting-1', archivedAt: null },
      include: {
        actions: { where: { archivedAt: null }, orderBy: { dueAt: 'asc' } },
        agendaItems: { where: { archivedAt: null }, orderBy: { sequence: 'asc' } },
        decisions: { where: { archivedAt: null }, orderBy: { updatedAt: 'desc' } },
        minutesDocument: true,
        fileAssets: {
          where: { status: 'ACTIVE' },
          orderBy: { updatedAt: 'desc' },
          include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
        },
      },
    });
  });

  it('creates and links one meeting minutes document', async () => {
    const meeting = {
      id: 'meeting-1',
      title: 'Architecture review',
      projectId: 'project-1',
      minutes: 'Legacy notes',
      minutesDocumentId: null,
    };
    const document = { id: 'document-1', type: 'MEETING_MINUTES', meetingId: meeting.id };
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      meeting: {
        findFirst: jest.fn().mockResolvedValue(meeting),
        update: jest.fn().mockResolvedValue({ ...meeting, minutesDocumentId: document.id }),
      },
      contentDocument: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(document),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    } as unknown as PlatformPrismaService;
    const service = new MeetingsService(prisma, {} as TasksService);

    await expect(service.createMinutesDocument(meeting.id)).resolves.toEqual(document);
    expect(transaction.contentDocument.create).toHaveBeenCalledWith({
      data: {
        type: 'MEETING_MINUTES',
        title: 'Architecture review 会议纪要',
        content: {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: '会议要点' }],
            },
            { type: 'paragraph', content: [{ type: 'text', text: 'Legacy notes' }] },
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: '决策' }],
            },
            { type: 'paragraph' },
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: '行动项' }],
            },
            { type: 'paragraph' },
          ],
        },
        plainText: '会议要点\nLegacy notes\n决策\n行动项',
        meetingId: meeting.id,
        projectId: meeting.projectId,
      },
    });
    expect(transaction.meeting.update).toHaveBeenCalledWith({
      where: { id: meeting.id },
      data: { minutesDocumentId: document.id },
    });
  });

  it('returns the linked meeting minutes document without creating a duplicate', async () => {
    const document = { id: 'document-1', type: 'MEETING_MINUTES', meetingId: 'meeting-1' };
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      meeting: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'meeting-1',
          minutesDocumentId: document.id,
        }),
      },
      contentDocument: {
        findUnique: jest.fn().mockResolvedValue(document),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    } as unknown as PlatformPrismaService;
    const service = new MeetingsService(prisma, {} as TasksService);

    await expect(service.createMinutesDocument('meeting-1')).resolves.toEqual(document);
    expect(transaction.contentDocument.findUnique).toHaveBeenCalledWith({
      where: { id: document.id },
    });
    expect(transaction.contentDocument.create).not.toHaveBeenCalled();
  });

  it('creates a source-traceable task and marks the first conversion as new', async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      meetingAction: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'action-1',
          meetingId: 'meeting-1',
          taskId: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    } as unknown as PlatformPrismaService;
    const task = { id: 'task-1', sourceType: 'MEETING_ACTION', sourceId: 'action-1' };
    const tasks = {
      createTaskInTransaction: jest.fn().mockResolvedValue(task),
    } as unknown as TasksService;
    const service = new MeetingsService(prisma, tasks);

    await expect(service.createTaskForAction('action-1', { title: 'Follow up' })).resolves.toEqual({
      task,
      alreadyExists: false,
    });
    expect(tasks.createTaskInTransaction).toHaveBeenCalledWith(transaction, {
      title: 'Follow up',
      projectId: undefined,
      sourceType: 'MEETING_ACTION',
      sourceId: 'action-1',
    });
    expect(transaction.meetingAction.updateMany).toHaveBeenCalledWith({
      where: { id: 'action-1', taskId: null },
      data: { taskId: 'task-1' },
    });
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(transaction.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.meetingAction.findFirst.mock.invocationCallOrder[0],
    );
  });

  it('returns the existing task when an action was already converted', async () => {
    const existingTask = {
      id: 'task-1',
      title: 'Existing task',
      sourceType: 'MEETING_ACTION',
      sourceId: 'action-1',
      reminder: null,
      later: null,
      dependencyIds: [],
      archivedAt: new Date('2026-07-19T00:00:00.000Z'),
    };
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      meetingAction: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'action-1',
          meetingId: 'meeting-1',
          taskId: existingTask.id,
        }),
      },
      workTask: {
        findUnique: jest.fn().mockResolvedValue({
          ...existingTask,
          dependencyIds: undefined,
          dependencies: [],
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    } as unknown as PlatformPrismaService;
    const tasks = {
      createTaskInTransaction: jest.fn(),
    } as unknown as TasksService;
    const service = new MeetingsService(prisma, tasks);

    await expect(service.createTaskForAction('action-1', { title: 'Ignored' })).resolves.toEqual({
      task: existingTask,
      alreadyExists: true,
    });
    expect(transaction.workTask.findUnique).toHaveBeenCalledWith({
      where: { id: existingTask.id },
      include: {
        dependencies: { select: { dependsOnTaskId: true } },
        reminder: true,
        later: true,
      },
    });
    expect(tasks.createTaskInTransaction).not.toHaveBeenCalled();
  });
});
