import { describe, expect, it } from 'vitest'

import { backendMessageSchema, runtimeConfigSchema } from '@rd-manager/contracts'

describe('@rd-manager/contracts development entry', () => {
  it('resolves the source entry before build artifacts exist', () => {
    expect(backendMessageSchema).toBeDefined()
    expect(runtimeConfigSchema).toBeDefined()
  })
})
