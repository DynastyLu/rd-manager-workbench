import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('environment template', () => {
  it('documents only the runtime environment variable consumed by the workbench', async () => {
    const template = await readFile(resolve(process.cwd(), '.env.example'), 'utf8')
    const variables = template
      .split('\n')
      .filter((line) => line.startsWith('VITE_'))
      .map((line) => line.split('=')[0])

    expect(variables).toEqual(['VITE_SENTRY_DSN'])
    expect(template).not.toContain('VITE_USE_MOCK')
  })
})
