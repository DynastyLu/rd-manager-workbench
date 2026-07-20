import { IntelligenceConversionKind } from '@prisma/client';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { DocumentsService } from '../../../../src/modules/workbench/content/application/documents.service';
import { IntelligenceConversionsService } from '../../../../src/modules/workbench/intelligence/application/intelligence-conversions.service';
import { MeetingsService } from '../../../../src/modules/workbench/management/application/meetings.service';
import { RisksService } from '../../../../src/modules/workbench/management/application/risks.service';
import { TasksService } from '../../../../src/modules/workbench/tasks/application/tasks.service';

describe('IntelligenceConversionsService', () => {
  function setup(existing?: { targetId: string }) {
    const tx = {
      $executeRaw: jest.fn(),
      intelligenceItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'item-1',
          title: 'AI regulation',
          summary: 'Summary',
          canonicalUrl: 'https://example.com/policy',
          archivedAt: null,
        }),
      },
      intelligenceConversion: {
        findUnique: jest.fn().mockResolvedValue(existing ?? null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'conversion-1', ...data })),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PlatformPrismaService;
    const tasks = { createTaskInTransaction: jest.fn().mockResolvedValue({ id: 'task-1' }) } as unknown as TasksService;
    const risks = { createRiskInTransaction: jest.fn().mockResolvedValue({ id: 'risk-1' }) } as unknown as RisksService;
    const meetings = { createIntelligenceAgendaInTransaction: jest.fn().mockResolvedValue({ id: 'agenda-1' }) } as unknown as MeetingsService;
    const documents = { createKnowledgePageInTransaction: jest.fn().mockResolvedValue({ id: 'doc-1' }) } as unknown as DocumentsService;
    return { service: new IntelligenceConversionsService(prisma, tasks, risks, meetings, documents), tx, tasks, risks, meetings, documents };
  }

  it('creates a task and conversion atomically with a source backlink', async () => {
    const { service, tx, tasks } = setup();
    const result = await service.toTask('item-1', { title: 'Review policy' });

    expect(tasks.createTaskInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ sourceType: 'INTELLIGENCE_ITEM', sourceId: 'item-1' }),
    );
    expect(tx.intelligenceConversion.create).toHaveBeenCalledWith({
      data: { itemId: 'item-1', kind: IntelligenceConversionKind.TASK, targetId: 'task-1' },
    });
    expect(result).toMatchObject({ alreadyExists: false, target: { id: 'task-1' } });
  });

  it('returns the existing conversion target instead of creating a duplicate', async () => {
    const { service, tasks } = setup({ targetId: 'task-existing' });
    const result = await service.toTask('item-1', { title: 'Review policy' });
    expect(tasks.createTaskInTransaction).not.toHaveBeenCalled();
    expect(result).toMatchObject({ alreadyExists: true, targetId: 'task-existing' });
  });

  it('supports risk, meeting agenda and knowledge-page conversions', async () => {
    const risk = setup();
    await risk.service.toRisk('item-1', { title: 'Policy risk', likelihood: 'MEDIUM', impact: 'HIGH', level: 'HIGH' } as never);
    expect(risk.risks.createRiskInTransaction).toHaveBeenCalled();

    const meeting = setup();
    await meeting.service.toMeetingAgenda('item-1', { meetingId: 'meeting-1', title: 'Discuss policy' });
    expect(meeting.meetings.createIntelligenceAgendaInTransaction).toHaveBeenCalled();

    const knowledge = setup();
    await knowledge.service.toKnowledgePage('item-1', { title: 'Policy knowledge' });
    expect(knowledge.documents.createKnowledgePageInTransaction).toHaveBeenCalled();
  });
});
