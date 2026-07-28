import { describe, expect, it, vi } from 'vitest';

const mockRequest = vi.fn();
vi.mock('@/lib/http', () => ({ request: mockRequest }));

describe('knowledge API', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('listSessions calls GET /knowledge/sessions', async () => {
    mockRequest.mockResolvedValue([{ id: 's1', title: 'test' }]);
    const { listSessions } = await import('../api');
    const result = await listSessions();
    expect(mockRequest).toHaveBeenCalledWith('/knowledge/sessions');
    expect(result).toEqual([{ id: 's1', title: 'test' }]);
  });

  it('encodes session search and patches presentation state', async () => {
    mockRequest.mockResolvedValue([]);
    const { listSessions, updateSession } = await import('../api');
    await listSessions('评审 计划');
    expect(mockRequest).toHaveBeenCalledWith('/knowledge/sessions?search=%E8%AF%84%E5%AE%A1%20%E8%AE%A1%E5%88%92');

    await updateSession('s/1', { title: '行动项', isPinned: true, scope: { type: 'PROJECT', projectId: 'p1' } });
    expect(mockRequest).toHaveBeenCalledWith('/knowledge/sessions/s%2F1', {
      method: 'PATCH',
      body: JSON.stringify({
        title: '行动项',
        isPinned: true,
        scope: { type: 'PROJECT', projectId: 'p1' },
      }),
    });
  });

  it('createSession posts question', async () => {
    mockRequest.mockResolvedValue({ id: 's2', title: 'hello' });
    const { createSession } = await import('../api');
    await createSession('hello');
    expect(mockRequest).toHaveBeenCalledWith('/knowledge/sessions', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('hello'),
    }));
  });

  it('getIndexStatus calls the reindex endpoint', async () => {
    mockRequest.mockResolvedValue({ indexedDocuments: 5, totalDocuments: 10 });
    const { getIndexStatus } = await import('../api');
    const result = await getIndexStatus();
    expect(result).toEqual({ indexedDocuments: 5, totalDocuments: 10 });
  });
});
