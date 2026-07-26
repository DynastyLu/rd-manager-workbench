import { describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('deepseekChat provider', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('rejects when no API key', async () => {
    const { deepseekChat } = await import('../providers/deepseek-chat.js');
    const result = await deepseekChat({
      profile: { id: 'p1', kind: 'AI', provider: 'DEEPSEEK_CHAT', enabled: true, publicConfig: { model: 'deepseek-chat' } },
      operation: 'AI_KNOWLEDGE_QA',
      payload: { question: 'test' },
      runId: 'r1', inputSha256: 'a'.repeat(64), completionToken: 't'.repeat(8),
    }, undefined);
    expect(result.status).toBe('REJECTED');
    expect(result.errorCode).toBe('CREDENTIAL_NOT_FOUND');
  });

  it('returns connection test result', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify({ choices: [{ message: { content: '{"answer":"ok"}' } }] }),
    });

    const { deepseekChat } = await import('../providers/deepseek-chat.js');
    const result = await deepseekChat({
      profile: { id: 'p1', kind: 'AI', provider: 'DEEPSEEK_CHAT', enabled: true, publicConfig: { model: 'deepseek-chat' } },
      operation: 'TEST_CONNECTION',
      payload: {},
      runId: 'r1', inputSha256: 'a'.repeat(64), completionToken: 't'.repeat(8),
    }, { apiKey: 'sk-test' });

    expect(result.status).toBe('SUCCEEDED');
    const output = result.output as Record<string, unknown>;
    expect(output['answer']).toBe('ok');
  });
});
