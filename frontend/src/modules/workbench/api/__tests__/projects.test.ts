import { afterEach, describe, expect, it, vi } from 'vitest'

import { listProjects } from '../projects'

describe('project API client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('serializes identity filters as one comma-separated query parameter', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: { data: [], meta: { page: 1, pageSize: 8, total: 0 } },
          }),
          { status: 200 }
        )
      )

    await listProjects({ ids: ['project-150', 'project-5'], pageSize: 8 })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:4311/api/projects?ids=project-150%2Cproject-5&pageSize=8',
      expect.anything()
    )
  })
})
