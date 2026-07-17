import { describe, expect, it } from 'vitest'

import { backendMessageSchema } from './backend-protocol.js'

describe('backendMessageSchema', () => {
  it('accepts a ready handshake with a random port and matching nonce', () => {
    expect(
      backendMessageSchema.parse({
        type: 'backend-ready',
        protocolVersion: 1,
        nonce: 'nonce-123',
        port: 43_127,
        pid: 1_234,
        serviceVersion: '0.1.0',
        databaseStatus: 'ready',
      }),
    ).toMatchObject({ type: 'backend-ready', port: 43_127 })
  })

  it('accepts a failed startup handshake', () => {
    expect(
      backendMessageSchema.parse({
        type: 'backend-failed',
        protocolVersion: 1,
        nonce: 'nonce-123',
        code: 'DATABASE_UNAVAILABLE',
        message: 'PostgreSQL is unavailable',
      }),
    ).toMatchObject({ type: 'backend-failed', code: 'DATABASE_UNAVAILABLE' })
  })

  it.each([0, 1_023, 65_536])('rejects invalid port %s', (port) => {
    expect(() =>
      backendMessageSchema.parse({
        type: 'backend-ready',
        protocolVersion: 1,
        nonce: 'nonce-123',
        port,
        pid: 1_234,
        serviceVersion: '0.1.0',
        databaseStatus: 'ready',
      }),
    ).toThrow()
  })
})
