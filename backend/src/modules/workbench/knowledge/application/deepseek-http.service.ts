import { Injectable } from '@nestjs/common';

interface ChatParams {
  messages: Array<{ role: string; content: string }>;
  systemPrompt?: string;
}

@Injectable()
export class DeepSeekHttpService {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.deepseek.com/v1',
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async streamChat(params: ChatParams): Promise<ReadableStream<Uint8Array>> {
    const messages: Array<{ role: string; content: string }> = [];
    if (params.systemPrompt) {
      messages.push({ role: 'system', content: params.systemPrompt });
    }
    messages.push(...params.messages);

    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-v4-pro',
        messages,
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API returned ${response.status}: ${response.statusText}`);
    }

    return response.body!;
  }
}
