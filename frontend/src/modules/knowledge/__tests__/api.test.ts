import { describe, expect, it, vi } from 'vitest';

const mockRequest = vi.fn();
const mockApiUrl = vi.fn((path: string) => `http://runtime.test/api${path}`);
vi.mock('@/lib/http', () => ({
  request: mockRequest,
  authenticatedFetch: (input: string, init?: RequestInit) => fetch(input, init),
}));
vi.mock('@/lib/api-url', () => ({ apiUrl: mockApiUrl }));

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

  it('uses the shared runtime resolver for streaming chat', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
    const { chatStream } = await import('../api');

    await chatStream('session/1', 'hello');

    expect(mockApiUrl).toHaveBeenCalledWith('/knowledge/chat/session%2F1/messages');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://runtime.test/api/knowledge/chat/session%2F1/messages',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('getIndexStatus calls the reindex endpoint', async () => {
    mockRequest.mockResolvedValue({ indexedDocuments: 5, totalDocuments: 10 });
    const { getIndexStatus } = await import('../api');
    const result = await getIndexStatus();
    expect(result).toEqual({ indexedDocuments: 5, totalDocuments: 10 });
  });
});
