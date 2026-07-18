import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  listMyWork,
  removeTaskLater,
  removeTaskReminder,
  setTaskLater,
  setTaskReminder,
} from '../tasks'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('@/lib/http', () => ({ request }))

describe('my work task API', () => {
  beforeEach(() => request.mockReset())

  it('queries a fixed view while preserving project context', async () => {
    request.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 100, total: 0 } })

    await listMyWork({ view: 'TODAY', projectId: 'project / 1' })

    expect(request).toHaveBeenCalledWith('/tasks/my-work?view=TODAY&projectId=project+%2F+1')
  })

  it('uses the reminder and later upsert/delete endpoints', async () => {
    request.mockResolvedValue(undefined)

    await setTaskLater('task / 1', { deferredUntil: '2026-07-28T00:00:00+08:00' })
    await removeTaskLater('task / 1')
    await setTaskReminder('task / 1', { remindAt: '2026-07-21T01:30:00.000Z' })
    await removeTaskReminder('task / 1')

    expect(request.mock.calls).toEqual([
      [
        '/tasks/task%20%2F%201/later',
        {
          method: 'PUT',
          body: JSON.stringify({ deferredUntil: '2026-07-28T00:00:00+08:00' }),
        },
      ],
      ['/tasks/task%20%2F%201/later', { method: 'DELETE' }],
      [
        '/tasks/task%20%2F%201/reminder',
        {
          method: 'PUT',
          body: JSON.stringify({ remindAt: '2026-07-21T01:30:00.000Z' }),
        },
      ],
      ['/tasks/task%20%2F%201/reminder', { method: 'DELETE' }],
    ])
  })
})
