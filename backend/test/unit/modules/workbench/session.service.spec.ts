import { SessionService } from '../../../../src/modules/workbench/knowledge/application/session.service';

describe('SessionService', () => {
  let service: SessionService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      knowledgeSession: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      knowledgeMessage: { create: jest.fn(), findMany: jest.fn() },
    };
    service = new SessionService(mockPrisma);
  });

  it('creates session with title from first 30 chars', async () => {
    mockPrisma.knowledgeSession.create.mockImplementation(
      (args: any) => Promise.resolve({ id: 's1', title: args.data.title }),
    );
    const session = await service.create('What is REST API and how to design it properly?');
    expect(session.title.length).toBeLessThanOrEqual(30);
  });

  it('lists active sessions ordered by updatedAt desc', async () => {
    mockPrisma.knowledgeSession.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    const sessions = await service.list();
    expect(sessions).toHaveLength(2);
  });

  it('adds message and touches session', async () => {
    await service.addMessage('s1', { role: 'USER', content: 'hello' });
    expect(mockPrisma.knowledgeSession.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's1' } }));
    expect(mockPrisma.knowledgeMessage.create).toHaveBeenCalled();
  });

  it('archives a session', async () => {
    mockPrisma.knowledgeSession.update.mockResolvedValue({ id: 's1', status: 'ARCHIVED' });
    const result = await service.archive('s1');
    expect(result.status).toBe('ARCHIVED');
  });

  it('returns message history for RAG context', async () => {
    mockPrisma.knowledgeMessage.findMany.mockResolvedValue([
      { role: 'USER', content: 'q1' }, { role: 'ASSISTANT', content: 'a1' },
    ]);
    const history = await service.getHistory('s1');
    expect(history).toEqual([{ role: 'USER', content: 'q1' }, { role: 'ASSISTANT', content: 'a1' }]);
  });
});
