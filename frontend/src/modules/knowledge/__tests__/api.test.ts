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
