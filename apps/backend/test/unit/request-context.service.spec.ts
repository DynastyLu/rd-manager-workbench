import { describe, expect, it } from '@jest/globals'

import { RequestContextService } from '../../src/infrastructure/context/request-context.service'

describe('RequestContextService', () => {
  it('scopes only the approved request metadata to the callback', () => {
    const service = new RequestContextService()
    const requestContext = {
      traceId: '00000000-0000-4000-8000-000000000001',
      sourceIp: '127.0.0.1',
      startedAt: 1_752_764_400_000,
    }

    service.run(requestContext, () => {
      expect(service.get()).toEqual(requestContext)
      expect(service.getTraceId()).toBe(requestContext.traceId)
      expect(Object.keys(service.get() ?? {}).sort()).toEqual(['sourceIp', 'startedAt', 'traceId'])
    })

    expect(service.get()).toBeUndefined()
  })
})
