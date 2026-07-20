import { afterEach, describe, expect, it, vi } from 'vitest'
import { openAiResponses } from './openai-responses.js'

describe('openAiResponses', () => {
  afterEach(() => vi.unstubAllGlobals())
  const input = {
    runId: 'run-ai',
    profile: {
      id: 'profile-ai', kind: 'AI' as const, provider: 'OPENAI_RESPONSES' as const, enabled: true,
      publicConfig: { model: 'gpt-5.6-sol', maxOutputTokens: 2048 },
    },
    operation: 'AI_KNOWLEDGE_QA' as const,
    payload: {
      question: 'What changed?',
      snippets: [{ citationId: 'document:1', title: 'Doc', text: 'Context' }],
      citationIds: ['document:1'],
    },
  }

  it('uses Responses strict structured output, retries 429 and validates citations', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ answer: 'Answer', citations: ['document:1'] }) }] }],
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await openAiResponses(input, { apiKey: 'sk-secret' })
    expect(result).toMatchObject({ status: 'SUCCEEDED', output: { answer: 'Answer', citations: ['document:1'] } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.openai.com/v1/responses')
    const requestBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))
    expect(requestBody).toMatchObject({ model: 'gpt-5.6-sol', text: { format: { type: 'json_schema', strict: true } } })
    expect(JSON.stringify(result)).not.toContain('Context')
    expect(JSON.stringify(result)).not.toContain('sk-secret')
  })

  it('rejects unknown citations even when the provider returned valid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output_text: JSON.stringify({ answer: 'Answer', citations: ['document:other'] }),
    }), { status: 200 })))
    await expect(openAiResponses(input, { apiKey: 'sk-secret' })).resolves.toMatchObject({
      status: 'REJECTED', errorCode: 'AI_OUTPUT_INVALID',
    })
  })
})
