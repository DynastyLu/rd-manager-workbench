import { DeepSeekHttpService } from '../../../../src/modules/workbench/knowledge/application/deepseek-http.service';

describe('DeepSeekHttpService', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
  });

  function makeService() {
    const service = new DeepSeekHttpService('test-key', 'https://api.deepseek.com/v1');
    (service as any).fetchImpl = mockFetch;
    return service;
  }

  function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let index = 0;
    return new ReadableStream({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(encoder.encode(chunks[index++]));
        } else {
          controller.close();
        }
      },
    });
  }

  it('streams chat completions as SSE chunks', async () => {
    const sseChunks = [
      'data: {"id":"1","choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"id":"1","choices":[{"delta":{"content":" World"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    mockFetch.mockResolvedValueOnce({ ok: true, body: makeStream(sseChunks) });

    const service = makeService();
    const stream = await service.streamChat({
      messages: [{ role: 'user', content: 'test' }],
      systemPrompt: 'You are a test assistant.',
    });

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const tokens: string[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      tokens.push(text);
    }

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe('https://api.deepseek.com/v1/chat/completions');
    const body = JSON.parse(callArgs[1].body);
    expect(body.stream).toBe(true);
    expect(body.model).toBe('deepseek-chat');
  });

  it('throws on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    const service = makeService();
    await expect(
      service.streamChat({ messages: [{ role: 'user', content: 'test' }] }),
    ).rejects.toThrow('DeepSeek API returned 401');
  });
});
