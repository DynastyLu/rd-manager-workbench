import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  adoptAiResult,
  archiveSmsRecipient,
  commitSyncSession,
  completeExtensionRun,
  getSyncSession,
  createExtensionProfile,
  createSmsRecipient,
  listExtensionProfiles,
  listExtensionRuns,
  listSmsRecipients,
  prepareAiRequest,
  prepareExtensionRun,
  prepareSyncSession,
  startSyncPreflight,
  startExtensionRun,
  updateSmsRecipient,
} from '../extensions'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('@/lib/http', () => ({ request }))

describe('extension API', () => {
  beforeEach(() => {
    request.mockReset()
    request.mockResolvedValue({})
  })

  it('lists and creates profiles without sending a secret value', async () => {
    await listExtensionProfiles('AI')
    await createExtensionProfile({
      kind: 'AI',
      provider: 'OPENAI_RESPONSES',
      name: 'OpenAI 摘要',
      enabled: false,
      publicConfig: { model: 'gpt-5-mini' },
      credentialRef: 'credential:ai:1',
      permissions: ['TEST_CONNECTION', 'AI_SUMMARIZE_MEETING'],
    })

    expect(request.mock.calls).toEqual([
      ['/extensions/profiles?kind=AI'],
      ['/extensions/profiles', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'AI', provider: 'OPENAI_RESPONSES', name: 'OpenAI 摘要', enabled: false,
          publicConfig: { model: 'gpt-5-mini' }, credentialRef: 'credential:ai:1',
          permissions: ['TEST_CONNECTION', 'AI_SUMMARIZE_MEETING'],
        }),
      }],
    ])
    expect(JSON.stringify(request.mock.calls)).not.toContain('apiKey')
  })

  it('uses prepare, start, complete and run-history routes with encoded ids', async () => {
    const payload = { objectIds: ['meeting-1'] }
    await prepareExtensionRun('profile / 1', { operation: 'AI_SUMMARIZE_MEETING', payload })
    await startExtensionRun('profile / 1', {
      operation: 'AI_SUMMARIZE_MEETING', payload, confirmationHash: 'a'.repeat(64),
    })
    await completeExtensionRun('run / 1', {
      completionToken: 'once-only', status: 'FAILED', errorCode: 'PROVIDER_TIMEOUT',
      metadata: { retryable: true },
    })
    await listExtensionRuns('profile / 1')

    expect(request.mock.calls).toEqual([
      ['/extensions/profiles/profile%20%2F%201/runs/prepare', {
        method: 'POST', body: JSON.stringify({ operation: 'AI_SUMMARIZE_MEETING', payload }),
      }],
      ['/extensions/profiles/profile%20%2F%201/runs', {
        method: 'POST', body: JSON.stringify({ operation: 'AI_SUMMARIZE_MEETING', payload, confirmationHash: 'a'.repeat(64) }),
      }],
      ['/extensions/runs/run%20%2F%201/complete', {
        method: 'POST', body: JSON.stringify({ completionToken: 'once-only', status: 'FAILED', errorCode: 'PROVIDER_TIMEOUT', metadata: { retryable: true } }),
      }],
      ['/extensions/runs?profileId=profile%20%2F%201'],
    ])
  })

  it('uses the governed AI prepare and explicit adoption routes', async () => {
    await prepareAiRequest({
      profileId: 'ai-profile',
      operation: 'AI_SUMMARIZE_MEETING',
      objectId: 'meeting-1',
    })
    await adoptAiResult({
      runId: 'run-1',
      operation: 'AI_SUMMARIZE_MEETING',
      objectId: 'meeting-1',
      citationIds: ['meeting:meeting-1'],
      output: { answer: '结论', citations: ['meeting:meeting-1'] },
    })

    expect(request.mock.calls).toEqual([
      ['/extensions/ai/prepare', {
        method: 'POST',
        body: JSON.stringify({ profileId: 'ai-profile', operation: 'AI_SUMMARIZE_MEETING', objectId: 'meeting-1' }),
      }],
      ['/extensions/ai/adopt', {
        method: 'POST',
        body: JSON.stringify({
          runId: 'run-1',
          operation: 'AI_SUMMARIZE_MEETING', objectId: 'meeting-1',
          citationIds: ['meeting:meeting-1'], output: { answer: '结论', citations: ['meeting:meeting-1'] },
        }),
      }],
    ])
  })

  it('uses immutable sync preflight and commit contracts', async () => {
    await prepareSyncSession({
      profileId: 'calendar-profile',
      target: { type: 'CALENDAR', startAt: '2026-07-01T00:00:00.000Z', endAt: '2026-08-01T00:00:00.000Z' },
    })
    await startSyncPreflight('session / 1', { confirmationHash: 'a'.repeat(64) })
    await getSyncSession('session / 1')
    await commitSyncSession('session / 1', {
      preflightHash: 'b'.repeat(64),
      resolutions: [{ itemKey: 'calendar:remote-1', resolution: 'CREATE_COPY' }],
    })

    expect(request.mock.calls).toEqual([
      ['/extensions/sync/prepare', { method: 'POST', body: JSON.stringify({ profileId: 'calendar-profile', target: { type: 'CALENDAR', startAt: '2026-07-01T00:00:00.000Z', endAt: '2026-08-01T00:00:00.000Z' } }) }],
      ['/extensions/sync/preflights/session%20%2F%201/start', { method: 'POST', body: JSON.stringify({ confirmationHash: 'a'.repeat(64) }) }],
      ['/extensions/sync/preflights/session%20%2F%201'],
      ['/extensions/sync/preflights/session%20%2F%201/commit', { method: 'POST', body: JSON.stringify({ preflightHash: 'b'.repeat(64), resolutions: [{ itemKey: 'calendar:remote-1', resolution: 'CREATE_COPY' }] }) }],
    ])
  })

  it('manages only masked SMS recipient metadata in backend routes', async () => {
    await listSmsRecipients()
    await createSmsRecipient({
      label: '本人', maskedPhone: '+861********8000',
      credentialRef: 'credential:sms-recipient:1', enabled: true,
    })
    await updateSmsRecipient('recipient / 1', { label: '值班手机', enabled: false })
    await archiveSmsRecipient('recipient / 1')

    expect(request.mock.calls).toEqual([
      ['/extensions/sms/recipients'],
      ['/extensions/sms/recipients', { method: 'POST', body: JSON.stringify({ label: '本人', maskedPhone: '+861********8000', credentialRef: 'credential:sms-recipient:1', enabled: true }) }],
      ['/extensions/sms/recipients/recipient%20%2F%201', { method: 'PATCH', body: JSON.stringify({ label: '值班手机', enabled: false }) }],
      ['/extensions/sms/recipients/recipient%20%2F%201', { method: 'DELETE' }],
    ])
    expect(JSON.stringify(request.mock.calls)).not.toContain('13800138000')
  })
})
