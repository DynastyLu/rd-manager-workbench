import { describe, expect, it, vi } from 'vitest'
import { ProviderRegistry } from './provider-registry.js'
import { extensionOperations } from './contracts.js'

describe('ProviderRegistry', () => {
  const validInput = {
    runId: 'run-1',
    profile: {
      id: 'profile-1',
      kind: 'SMS' as const,
      provider: 'LOCAL_PREVIEW' as const,
      enabled: true,
      publicConfig: { signName: '研发工作台' },
    },
    operation: 'TEST_CONNECTION' as const,
    payload: {},
  }

  it('uses the backend extension operation contract verbatim', () => {
    expect(extensionOperations).toEqual([
      'TEST_CONNECTION',
      'SMS_PREVIEW',
      'SMS_SEND',
      'AI_SUMMARIZE_MEETING',
      'AI_SUMMARIZE_DOCUMENT',
      'AI_KNOWLEDGE_QA',
      'CALENDAR_SYNC_PREFLIGHT',
      'CALENDAR_SYNC_COMMIT',
      'CLOUD_UPLOAD_PREFLIGHT',
      'CLOUD_UPLOAD_COMMIT',
      'CLOUD_DOWNLOAD_PREFLIGHT',
      'CLOUD_DOWNLOAD_COMMIT',
    ])
  })

  it('executes only registered provider and operation pairs', async () => {
    const handler = vi.fn(async () => ({ status: 'REJECTED' as const, metadata: { preview: true } }))
    const registry = new ProviderRegistry()
    registry.register('LOCAL_PREVIEW', ['TEST_CONNECTION'], handler)

    await expect(registry.execute(validInput, undefined)).resolves.toEqual({
      status: 'REJECTED',
      metadata: { preview: true },
    })
    expect(handler).toHaveBeenCalledTimes(1)
    await expect(
      registry.execute({ ...validInput, operation: 'SMS_SEND' }, undefined),
    ).rejects.toThrow('EXTENSION_OPERATION_UNSUPPORTED')
  })

  it('rejects unknown providers, kinds, operations and oversized or unsafe payloads', async () => {
    const registry = new ProviderRegistry()
    registry.register('LOCAL_PREVIEW', ['TEST_CONNECTION'], vi.fn(async () => ({ status: 'SUCCEEDED' })))

    await expect(
      registry.execute({ ...validInput, profile: { ...validInput.profile, provider: 'UNKNOWN' as never } }, undefined),
    ).rejects.toThrow('EXTENSION_PROVIDER_UNSUPPORTED')
    await expect(
      registry.execute({ ...validInput, operation: 'fetch:https://evil.example' as never }, undefined),
    ).rejects.toThrow('EXTENSION_OPERATION_UNSUPPORTED')
    await expect(
      registry.execute({ ...validInput, payload: { __proto__: { polluted: true } } }, undefined),
    ).rejects.toThrow('EXTENSION_PAYLOAD_INVALID')
    await expect(
      registry.execute({ ...validInput, payload: { text: 'x'.repeat(1024 * 1024) } }, undefined),
    ).rejects.toThrow('EXTENSION_PAYLOAD_TOO_LARGE')
  })

  it('accepts the documented 750 KiB WebDAV file after base64 expansion within the 1 MiB run limit', async () => {
    const registry = new ProviderRegistry()
    const handler = vi.fn(async () => ({ status: 'SUCCEEDED' as const }))
    registry.register('WEBDAV', ['CLOUD_UPLOAD_COMMIT'], handler)
    const contentBase64 = Buffer.alloc(750 * 1024).toString('base64')

    await expect(registry.execute({
      runId: 'run-webdav',
      profile: {
        id: 'drive-1', kind: 'CLOUD_DRIVE', provider: 'WEBDAV', enabled: true,
        publicConfig: { baseUrl: 'https://dav.example.com', remoteRoot: '/workbench/' },
      },
      operation: 'CLOUD_UPLOAD_COMMIT',
      payload: { remotePath: 'file.bin', contentBase64, sha256: 'a'.repeat(64) },
    }, { username: 'user', password: 'secret' })).resolves.toMatchObject({ status: 'SUCCEEDED' })
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
