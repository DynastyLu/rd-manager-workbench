import { describe, expect, it, vi } from 'vitest'
import { configureExtensionIpc } from './extension-ipc.js'
import { ProviderRegistry } from './extensions/provider-registry.js'

describe('configureExtensionIpc', () => {
  it('registers only the fixed credential and execution channels', async () => {
    const handlers = new Map<string, (_event: unknown, input?: unknown) => Promise<unknown>>()
    const ipc = { handle: vi.fn((channel: string, handler: typeof handlers extends Map<string, infer T> ? T : never) => handlers.set(channel, handler)) }
    const vault = {
      isAvailable: vi.fn(async () => true),
      put: vi.fn(async () => undefined),
      has: vi.fn(async () => true),
      delete: vi.fn(async () => undefined),
      withCredential: vi.fn(async (_ref: string, callback: (credential: Record<string, unknown>) => Promise<unknown>) => callback({ apiKey: 'secret' })),
    }
    const registry = { execute: vi.fn(async () => ({ status: 'SUCCEEDED' })) }

    configureExtensionIpc(ipc, vault, registry)

    expect([...handlers.keys()]).toEqual([
      'desktop:credentials:is-available',
      'desktop:credentials:put',
      'desktop:credentials:has',
      'desktop:credentials:delete',
      'desktop:extensions:execute',
    ])
    await handlers.get('desktop:credentials:put')?.({}, {
      ref: 'profile.ai',
      secretObject: { apiKey: 'secret' },
    })
    expect(vault.put).toHaveBeenCalledWith('profile.ai', { apiKey: 'secret' })
  })

  it('resolves credentials only inside the provider callback and rejects disabled profiles', async () => {
    const handlers = new Map<string, (_event: unknown, input?: unknown) => Promise<unknown>>()
    const ipc = { handle: (channel: string, handler: (_event: unknown, input?: unknown) => Promise<unknown>) => { handlers.set(channel, handler) } }
    const vault = {
      isAvailable: vi.fn(async () => true), put: vi.fn(), has: vi.fn(), delete: vi.fn(),
      withCredential: vi.fn(async (_ref: string, callback: (credential: Record<string, unknown>) => Promise<unknown>) => callback({ apiKey: 'secret' })),
    }
    const registry = { execute: vi.fn(async () => ({ status: 'SUCCEEDED' })) }
    configureExtensionIpc(ipc, vault, registry)
    const execute = handlers.get('desktop:extensions:execute')
    const input = {
      runId: 'run-1',
      profile: { id: 'p-1', kind: 'AI', provider: 'OPENAI_RESPONSES', enabled: true, publicConfig: {}, credentialRef: 'profile.ai' },
      operation: 'TEST_CONNECTION',
      payload: {},
    }

    await expect(execute?.({}, input)).resolves.toEqual({ status: 'SUCCEEDED' })
    expect(vault.withCredential).toHaveBeenCalledWith('profile.ai', expect.any(Function))
    expect(registry.execute).toHaveBeenCalledWith(input, { apiKey: 'secret' })
    await expect(execute?.({}, { ...input, profile: { ...input.profile, enabled: false } })).rejects.toThrow(
      'EXTENSION_PROFILE_DISABLED',
    )
  })

  it('adds an SMS recipient credential only for the typed SMS operation', async () => {
    const handlers = new Map<string, (_event: unknown, input?: unknown) => Promise<unknown>>()
    const ipc = { handle: (channel: string, handler: (_event: unknown, input?: unknown) => Promise<unknown>) => { handlers.set(channel, handler) } }
    const vault = {
      isAvailable: vi.fn(async () => true), put: vi.fn(), has: vi.fn(), delete: vi.fn(),
      withCredential: vi.fn(async (ref: string, callback: (credential: Record<string, unknown>) => Promise<unknown>) => callback(
        ref === 'credential:recipient:1' ? { phoneNumber: '13800138000' } : { accessKeySecret: 'provider-secret' },
      )),
    }
    let receivedCredential: Record<string, unknown> | undefined
    const registry = { execute: vi.fn(async (_input: unknown, credential: Record<string, unknown>) => {
      receivedCredential = structuredClone(credential)
      return { status: 'SUCCEEDED' }
    }) }
    configureExtensionIpc(ipc, vault, registry)
    const execute = handlers.get('desktop:extensions:execute')
    const input = {
      runId: 'run-sms-1',
      profile: { id: 'p-sms', kind: 'SMS', provider: 'ALIYUN_SMS', enabled: true, publicConfig: {}, credentialRef: 'credential:provider:1' },
      operation: 'SMS_SEND',
      payload: { recipientCredentialRef: 'credential:recipient:1' },
    }

    await expect(execute?.({}, input)).resolves.toEqual({ status: 'SUCCEEDED' })
    expect(vault.withCredential.mock.calls.map((call) => call[0])).toEqual([
      'credential:provider:1', 'credential:recipient:1',
    ])
    expect(receivedCredential).toEqual({
      accessKeySecret: 'provider-secret',
      recipient: { phoneNumber: '13800138000' },
    })
  })

  it('validates the allowlist before decrypting any provider credential', async () => {
    const handlers = new Map<string, (_event: unknown, input?: unknown) => Promise<unknown>>()
    const ipc = { handle: (channel: string, handler: (_event: unknown, input?: unknown) => Promise<unknown>) => { handlers.set(channel, handler) } }
    const vault = {
      isAvailable: vi.fn(async () => true), put: vi.fn(), has: vi.fn(), delete: vi.fn(),
      withCredential: vi.fn(),
    }
    const registry = new ProviderRegistry()
    registry.register('OPENAI_RESPONSES', ['TEST_CONNECTION'], vi.fn(async () => ({ status: 'SUCCEEDED' })))
    configureExtensionIpc(ipc, vault, registry)
    const execute = handlers.get('desktop:extensions:execute')

    await expect(execute?.({}, {
      runId: 'run-invalid',
      profile: { id: 'p-ai', kind: 'AI', provider: 'OPENAI_RESPONSES', enabled: true, publicConfig: {}, credentialRef: 'credential:ai:1' },
      operation: 'fetch:https://evil.example',
      payload: {},
    })).rejects.toThrow('EXTENSION_OPERATION_UNSUPPORTED')
    expect(vault.withCredential).not.toHaveBeenCalled()
  })
})
