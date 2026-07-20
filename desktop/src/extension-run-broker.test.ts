import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { ExtensionRunBroker } from './extension-run-broker.js'

function inputHash(payload: Record<string, unknown>) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

function fixture() {
  let requested: ((event: unknown) => Promise<void>) | undefined
  const socket = {
    on: vi.fn((_event: string, handler: (event: unknown) => Promise<void>) => { requested = handler }),
    off: vi.fn(),
  }
  const execute = vi.fn(async () => ({ status: 'SUCCEEDED' as const, metadata: { latencyMs: 25 } }))
  const complete = vi.fn(async () => undefined)
  const broker = new ExtensionRunBroker({ socket, execute, complete })
  const payload = { deliveryId: 'delivery-1', recipientCredentialRef: 'credential:recipient:1' }
  const event = {
    runId: 'run-1',
    deliveryId: 'delivery-1',
    profile: {
      id: 'profile-1', kind: 'SMS', provider: 'ALIYUN_SMS', enabled: true,
      publicConfig: { regionId: 'cn-hangzhou', signName: '研发工作台', templateMapping: {} },
      credentialRef: 'credential:provider:1', permissions: ['SMS_SEND'],
    },
    operation: 'SMS_SEND',
    inputSha256: inputHash(payload),
    completionToken: 'one-time-token',
    payload,
  }
  return { broker, socket, execute, complete, event, dispatch: () => requested?.(event) }
}

describe('ExtensionRunBroker', () => {
  it('executes a valid requested run and completes it with the one-time token', async () => {
    const f = fixture()
    f.broker.start()

    await f.dispatch()

    expect(f.execute).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-1', operation: 'SMS_SEND', payload: f.event.payload,
    }))
    expect(f.complete).toHaveBeenCalledWith('run-1', {
      completionToken: 'one-time-token', status: 'SUCCEEDED', metadata: { latencyMs: 25 },
    })
  })

  it('rejects a payload hash mismatch before any provider sees the payload', async () => {
    const f = fixture()
    f.broker.start()

    const handler = f.socket.on.mock.calls[0]?.[1] as (event: unknown) => Promise<void>
    await handler({ ...f.event, inputSha256: '0'.repeat(64) })

    expect(f.execute).not.toHaveBeenCalled()
    expect(f.complete).toHaveBeenLastCalledWith('run-1', {
      completionToken: 'one-time-token', status: 'FAILED', errorCode: 'EXTENSION_INPUT_HASH_MISMATCH',
    })
  })

  it('deduplicates socket redelivery and sanitizes provider failures', async () => {
    const f = fixture()
    f.execute.mockRejectedValueOnce(new Error('apiKey=plain-secret'))
    f.broker.start()
    const handler = f.socket.on.mock.calls[0]?.[1] as (event: unknown) => Promise<void>

    await handler(f.event)
    await handler(f.event)

    expect(f.execute).toHaveBeenCalledTimes(1)
    expect(f.complete).toHaveBeenCalledTimes(1)
    expect(f.complete).toHaveBeenCalledWith('run-1', {
      completionToken: 'one-time-token', status: 'FAILED', errorCode: 'PROVIDER_EXECUTION_FAILED',
    })
    expect(JSON.stringify(f.complete.mock.calls)).not.toContain('plain-secret')
  })

  it('removes the fixed socket listener when stopped', () => {
    const f = fixture()
    f.broker.start()
    f.broker.stop()
    expect(f.socket.off).toHaveBeenCalledWith('extension.run.requested', expect.any(Function))
  })
})
