import { describe, expect, it } from 'vitest'

import { runtimeConfigSchema } from './runtime-config.js'

const validRuntimeConfig = {
  apiBaseUrl: 'http://127.0.0.1:43127',
  sessionToken: '0123456789abcdef0123456789abcdef',
  appVersion: '0.1.0',
  platform: 'darwin',
} as const

describe('runtimeConfigSchema', () => {
  it('accepts only the runtime data required by the renderer', () => {
    expect(runtimeConfigSchema.parse(validRuntimeConfig)).toEqual(validRuntimeConfig)
  })

  it.each([
    'http://127.0.0.1:0',
    'http://127.0.0.1:1023',
    'http://127.0.0.1:65536',
    'http://localhost:43127',
    'http://user:pass@127.0.0.1:43127',
    'http://127.0.0.1:43127/api',
    'http://127.0.0.1:43127?debug=true',
  ])('rejects API base URL %s', (apiBaseUrl) => {
    expect(() => runtimeConfigSchema.parse({ ...validRuntimeConfig, apiBaseUrl })).toThrow()
  })

  it('rejects a weak session token', () => {
    expect(() =>
      runtimeConfigSchema.parse({ ...validRuntimeConfig, sessionToken: 'too-short' }),
    ).toThrow()
  })

  it('rejects additional renderer capabilities', () => {
    expect(() =>
      runtimeConfigSchema.parse({ ...validRuntimeConfig, rawIpc: 'send-anything' }),
    ).toThrow()
  })

  it('rejects unsupported platforms', () => {
    expect(() =>
      runtimeConfigSchema.parse({ ...validRuntimeConfig, platform: 'freebsd' }),
    ).toThrow()
  })
})
