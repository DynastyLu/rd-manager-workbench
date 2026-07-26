import type { ExtensionExecutionInput, ExtensionExecutionResult } from '../contracts.js';
import {
  isRetryableHttp,
  PROVIDER_MAX_ATTEMPTS,
  PROVIDER_TIMEOUT_MS,
  responseTextLimited,
  retryDelay,
} from './provider-http.js';

function buildMessages(input: ExtensionExecutionInput): Array<{ role: string; content: string }> {
  const systemPrompt = 'You are a local knowledge base assistant. Reply in Chinese. Output structured JSON.';
  if (input.operation === 'TEST_CONNECTION') {
    return [{ role: 'user', content: 'Reply with {"answer":"ok"}' }];
  }

  const question = typeof input.payload['question'] === 'string' ? input.payload['question'] : '';
  const context = typeof input.payload['context'] === 'string' ? input.payload['context'] : '';
  const snippets = Array.isArray(input.payload['snippets'])
    ? input.payload['snippets'].map((s: Record<string, unknown>) => s.text ?? '').filter(Boolean).join('\n---\n')
    : '';

  const userContent = [
    question && `Question: ${question}`,
    context && `Context: ${context}`,
    snippets && `Snippets:\n${snippets}`,
  ].filter(Boolean).join('\n\n');

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent || 'Respond with structured JSON output.' },
  ];
}

export async function deepseekChat(
  input: ExtensionExecutionInput,
  credential: Record<string, unknown> | undefined,
): Promise<ExtensionExecutionResult> {
  const apiKey = typeof credential?.['apiKey'] === 'string' ? credential['apiKey'] : undefined;
  if (!apiKey) return { status: 'REJECTED', errorCode: 'CREDENTIAL_NOT_FOUND' };
  if (input.operation !== 'TEST_CONNECTION' && !input.operation.startsWith('AI_')) {
    return { status: 'REJECTED', errorCode: 'EXTENSION_OPERATION_UNSUPPORTED' };
  }

  const messages = buildMessages(input);
  const citationIds = Array.isArray(input.payload['citationIds'])
    ? input.payload['citationIds'].filter((item): item is string => typeof item === 'string')
    : [];

  const body = {
    model: 'deepseek-v4-pro',
    messages,
    max_tokens: typeof input.profile.publicConfig['maxOutputTokens'] === 'number'
      ? input.profile.publicConfig['maxOutputTokens']
      : 2048,
    response_format: { type: 'json_object' as const },
  };

  for (let attempt = 1; attempt <= PROVIDER_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'manual',
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
      if (isRetryableHttp(response.status) && attempt < PROVIDER_MAX_ATTEMPTS) {
        await retryDelay(attempt);
        continue;
      }
      const text = await responseTextLimited(response, 2 * 1024 * 1024);
      if (!response.ok) {
        return { status: 'FAILED', errorCode: `HTTP_${response.status}`, metadata: { retryable: false } };
      }
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(text) as Record<string, unknown>; } catch {
        return { status: 'REJECTED', errorCode: 'AI_OUTPUT_INVALID' };
      }
      const choice = (parsed['choices'] as Array<Record<string, unknown>>)?.[0];
      const msgContent = (choice?.['message'] as Record<string, unknown>)?.['content'];
      if (typeof msgContent !== 'string') {
        return { status: 'REJECTED', errorCode: 'AI_OUTPUT_INVALID' };
      }

      // Parse JSON from model output
      let output: Record<string, unknown>;
      try { output = JSON.parse(msgContent) as Record<string, unknown>; } catch {
        return { status: 'REJECTED', errorCode: 'AI_OUTPUT_INVALID' };
      }
      return {
        status: 'SUCCEEDED',
        output: {
          answer: typeof output['answer'] === 'string' ? output['answer'] : msgContent,
          citations: Array.isArray(output['citations']) ? output['citations'].filter((c: unknown) => typeof c === 'string' && citationIds.includes(c)) : [],
          summary: typeof output['summary'] === 'string' ? output['summary'] : null,
          actionItems: Array.isArray(output['actionItems']) ? output['actionItems'] : [],
        },
        metadata: { model: 'deepseek-v4-pro' },
      };
    } catch (error) {
      if (attempt < PROVIDER_MAX_ATTEMPTS) { await retryDelay(attempt); continue; }
      return { status: 'FAILED', errorCode: 'NETWORK_TIMEOUT', metadata: { retryable: false } };
    }
  }
  return { status: 'FAILED', errorCode: 'AI_OUTPUT_INVALID', metadata: { retryable: false } };
}
