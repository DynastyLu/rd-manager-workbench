import type { ExtensionExecutionInput, ExtensionExecutionResult } from '../contracts.js'
import {
  isRetryableHttp,
  PROVIDER_MAX_ATTEMPTS,
  PROVIDER_TIMEOUT_MS,
  responseTextLimited,
  retryDelay,
} from './provider-http.js'

const outputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    answer: { type: 'string' },
    citations: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    summary: { type: ['string', 'null'] },
    actionItems: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { title: { type: 'string' }, dueAt: { type: ['string', 'null'] } },
        required: ['title', 'dueAt'],
      },
    },
  },
  required: ['answer', 'citations', 'summary', 'actionItems'],
} as const

function extractOutputText(response: Record<string, unknown>): string | undefined {
  if (typeof response['output_text'] === 'string') return response['output_text']
  const output = response['output']
  if (!Array.isArray(output)) return undefined
  for (const item of output) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const content = (item as Record<string, unknown>)['content']
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (!part || typeof part !== 'object' || Array.isArray(part)) continue
      const text = (part as Record<string, unknown>)['text']
      if (typeof text === 'string') return text
    }
  }
  return undefined
}

function validateOutput(output: unknown, allowedCitationIds: string[]): Record<string, unknown> | undefined {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return undefined
  const value = output as Record<string, unknown>
  if (typeof value['answer'] !== 'string' || !Array.isArray(value['citations'])) return undefined
  const citations = value['citations']
  if (!citations.every((citation) => typeof citation === 'string')) return undefined
  const allowed = new Set(allowedCitationIds)
  if (citations.some((citation) => !allowed.has(citation))) return undefined
  if (value['summary'] !== undefined && value['summary'] !== null && typeof value['summary'] !== 'string') return undefined
  if (value['actionItems'] !== undefined && !Array.isArray(value['actionItems'])) return undefined
  return {
    answer: value['answer'],
    citations,
    ...(typeof value['summary'] === 'string' ? { summary: value['summary'] } : {}),
    ...(Array.isArray(value['actionItems']) ? { actionItems: value['actionItems'] } : {}),
  }
}

function requestInput(input: ExtensionExecutionInput): string {
  if (input.operation === 'TEST_CONNECTION') return 'Return a short connection test result.'
  return JSON.stringify({
    operation: input.operation,
    question: input.payload['question'],
    context: input.payload['context'],
    snippets: input.payload['snippets'],
    citationIds: input.payload['citationIds'],
  })
}

export async function openAiResponses(
  input: ExtensionExecutionInput,
  credential: Record<string, unknown> | undefined,
): Promise<ExtensionExecutionResult> {
  const apiKey = typeof credential?.['apiKey'] === 'string' ? credential['apiKey'] : undefined
  const model = typeof input.profile.publicConfig['model'] === 'string'
    ? input.profile.publicConfig['model']
    : undefined
  if (!apiKey) return { status: 'REJECTED', errorCode: 'CREDENTIAL_NOT_FOUND' }
  if (!model) return { status: 'REJECTED', errorCode: 'EXTENSION_CONFIG_INVALID' }
  if (input.operation !== 'TEST_CONNECTION' && !input.operation.startsWith('AI_')) {
    return { status: 'REJECTED', errorCode: 'EXTENSION_OPERATION_UNSUPPORTED' }
  }
  const citationIds = Array.isArray(input.payload['citationIds'])
    ? input.payload['citationIds'].filter((item): item is string => typeof item === 'string')
    : []
  const body = {
    model,
    input: requestInput(input),
    max_output_tokens: typeof input.profile.publicConfig['maxOutputTokens'] === 'number'
      ? input.profile.publicConfig['maxOutputTokens']
      : 2048,
    text: {
      format: {
        type: 'json_schema',
        name: 'workbench_ai_result',
        strict: true,
        schema: outputSchema,
      },
    },
  }

  for (let attempt = 1; attempt <= PROVIDER_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'manual',
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      })
      if (isRetryableHttp(response.status) && attempt < PROVIDER_MAX_ATTEMPTS) {
        await retryDelay(attempt)
        continue
      }
      const text = await responseTextLimited(response, 2 * 1024 * 1024)
      if (!response.ok) {
        return { status: 'FAILED', errorCode: `HTTP_${response.status}`, metadata: { retryable: false, model } }
      }
      let providerResponse: Record<string, unknown>
      try { providerResponse = JSON.parse(text) as Record<string, unknown> } catch {
        return { status: 'REJECTED', errorCode: 'AI_OUTPUT_INVALID' }
      }
      const outputText = extractOutputText(providerResponse)
      if (!outputText) return { status: 'REJECTED', errorCode: 'AI_OUTPUT_INVALID' }
      let rawOutput: unknown
      try { rawOutput = JSON.parse(outputText) } catch {
        return { status: 'REJECTED', errorCode: 'AI_OUTPUT_INVALID' }
      }
      const output = validateOutput(rawOutput, citationIds)
      if (!output) return { status: 'REJECTED', errorCode: 'AI_OUTPUT_INVALID' }
      return { status: 'SUCCEEDED', output, metadata: { model, citationIds, retryable: false } }
    } catch (error) {
      if (attempt < PROVIDER_MAX_ATTEMPTS) {
        await retryDelay(attempt)
        continue
      }
      return {
        status: 'FAILED',
        errorCode: error instanceof Error && error.message === 'EXTENSION_RESPONSE_TOO_LARGE'
          ? error.message
          : 'NETWORK_TIMEOUT',
        metadata: { retryable: false, model },
      }
    }
  }
  return { status: 'FAILED', errorCode: 'AI_OUTPUT_INVALID', metadata: { retryable: false, model } }
}
