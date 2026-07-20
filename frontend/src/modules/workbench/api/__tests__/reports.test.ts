import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getResourceLoadReport } from '../reports'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return { ...actual, request }
})

describe('reports API client', () => {
  beforeEach(() => request.mockReset())

  it('uses the same from/to/bucket contract for the resource report', async () => {
    request.mockResolvedValue({ weeks: [] })

    await getResourceLoadReport({ from: '2026-07-01', to: '2026-07-31', bucket: 'MONTH' })

    expect(request).toHaveBeenCalledWith(
      '/reports/resource-load?from=2026-07-01&to=2026-07-31&bucket=MONTH'
    )
  })
})
