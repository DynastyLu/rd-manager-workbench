import { describe, expect, it } from 'vitest'
import { ProviderRegistry } from '../provider-registry.js'
import { registerBuiltinProviders } from './index.js'

describe('registerBuiltinProviders', () => {
  it('registers every locked provider/operation pair', async () => {
    const registry = new ProviderRegistry()
    registerBuiltinProviders(registry)
    await expect(registry.execute({
      runId: 'run-1',
      profile: { id: 'p-1', kind: 'SMS', provider: 'LOCAL_PREVIEW', enabled: true, publicConfig: {} },
      operation: 'SMS_PREVIEW',
      payload: {},
    }, undefined)).resolves.toMatchObject({ status: 'REJECTED', errorCode: 'PREVIEW_ONLY' })
  })
})
