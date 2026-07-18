import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createMeetingActionTask,
  createMeetingAgendaItem,
  createMeetingMinutesDocument,
  getMeeting,
  listMeetings,
  updateMeetingAction,
} from '../management'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('@/lib/http', () => ({ request }))

describe('meeting API', () => {
  beforeEach(() => {
    request.mockReset()
    request.mockResolvedValue({})
  })

  it('lists filtered meetings and reads a safely encoded detail', async () => {
    await listMeetings({
      projectId: 'project 1',
      status: 'PLANNED',
      startFrom: '2026-07-01T00:00:00.000Z',
      startTo: '2026-07-31T23:59:59.000Z',
    })
    await getMeeting('meeting / 1')

    expect(request).toHaveBeenNthCalledWith(
      1,
      '/meetings?projectId=project+1&status=PLANNED&startFrom=2026-07-01T00%3A00%3A00.000Z&startTo=2026-07-31T23%3A59%3A59.000Z',
    )
    expect(request).toHaveBeenNthCalledWith(2, '/meetings/meeting%20%2F%201')
  })

  it('uses the real agenda, action, idempotent task and minutes endpoints', async () => {
    await createMeetingAgendaItem('meeting / 1', { title: '发布检查', sequence: 2 })
    await updateMeetingAction('meeting / 1', 'action / 1', { status: 'DONE' })
    await createMeetingActionTask('action / 1', { title: '完成验收清单' })
    await createMeetingMinutesDocument('meeting / 1')

    expect(request.mock.calls).toEqual([
      [
        '/meetings/meeting%20%2F%201/agenda-items',
        { method: 'POST', body: JSON.stringify({ title: '发布检查', sequence: 2 }) },
      ],
      [
        '/meetings/meeting%20%2F%201/actions/action%20%2F%201',
        { method: 'PATCH', body: JSON.stringify({ status: 'DONE' }) },
      ],
      [
        '/meeting-actions/action%20%2F%201/task',
        { method: 'POST', body: JSON.stringify({ title: '完成验收清单' }) },
      ],
      ['/meetings/meeting%20%2F%201/minutes-document', { method: 'POST' }],
    ])
  })
})
