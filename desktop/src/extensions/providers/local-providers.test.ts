import { describe, expect, it } from 'vitest'
import { localManualAi, localPreviewSms } from './local-providers.js'

describe('local extension providers', () => {
  it('marks SMS preview as rejected preview rather than sent', async () => {
    await expect(localPreviewSms({
      runId: 'run-1',
      profile: { id: 'p-1', kind: 'SMS', provider: 'LOCAL_PREVIEW', enabled: true, publicConfig: {} },
      operation: 'SMS_PREVIEW',
      payload: { templateKey: 'IMPORTANT_REMINDER', recipientMask: '138****8000' },
    }, undefined)).resolves.toMatchObject({ status: 'REJECTED', errorCode: 'PREVIEW_ONLY' })
  })

  it('requires explicit manual AI output and never invents a success', async () => {
    const input = {
      runId: 'run-2',
      profile: { id: 'p-2', kind: 'AI' as const, provider: 'LOCAL_MANUAL' as const, enabled: true, publicConfig: {} },
      operation: 'AI_KNOWLEDGE_QA' as const,
      payload: { citationIds: ['document:1'] },
    }
    await expect(localManualAi(input, undefined)).resolves.toMatchObject({ status: 'REJECTED', errorCode: 'MANUAL_INPUT_REQUIRED' })
    await expect(localManualAi({ ...input, payload: {
      citationIds: ['document:1'],
      manualOutput: { answer: 'Accepted', citations: ['document:1'] },
    } }, undefined)).resolves.toMatchObject({ status: 'SUCCEEDED', output: { answer: 'Accepted' } })
  })
})
