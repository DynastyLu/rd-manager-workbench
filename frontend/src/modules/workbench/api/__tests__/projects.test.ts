import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  archiveMilestone,
  archiveProgressReport,
  createMilestone,
  listProjects,
  updateMilestone,
  updateProgressReport,
} from '../projects'

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

  it('uses project-scoped milestone and progress maintenance endpoints', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ success: true, data: {} }), { status: 200 })
    )

    await createMilestone('project / 1', {
      name: '完成初筛',
      plannedAt: '2026-08-01T00:00:00.000Z',
    })
    await updateMilestone('project / 1', 'milestone / 1', { status: 'COMPLETED' })
    await archiveMilestone('project / 1', 'milestone / 1')
    await updateProgressReport('project / 1', 'report / 1', {
      summary: '完成复测',
      completionPercent: 80,
      reportedAt: '2026-07-22T00:00:00.000Z',
    })
    await archiveProgressReport('project / 1', 'report / 1')

    expect(fetchMock.mock.calls).toEqual([
      ['http://127.0.0.1:4311/api/projects/project%20%2F%201/milestones', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: '完成初筛', plannedAt: '2026-08-01T00:00:00.000Z' }),
      })],
      ['http://127.0.0.1:4311/api/projects/project%20%2F%201/milestones/milestone%20%2F%201', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'COMPLETED' }),
      })],
      ['http://127.0.0.1:4311/api/projects/project%20%2F%201/milestones/milestone%20%2F%201', expect.objectContaining({ method: 'DELETE' })],
      ['http://127.0.0.1:4311/api/projects/project%20%2F%201/progress-reports/report%20%2F%201', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          summary: '完成复测',
          completionPercent: 80,
          reportedAt: '2026-07-22T00:00:00.000Z',
        }),
      })],
      ['http://127.0.0.1:4311/api/projects/project%20%2F%201/progress-reports/report%20%2F%201', expect.objectContaining({ method: 'DELETE' })],
    ])
  })
})
