import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  dismissNotification,
  listNotifications,
  markNotificationRead,
  snoozeNotification,
} from '../notifications'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('@/lib/http', () => ({ request }))

describe('notification API', () => {
  beforeEach(() => request.mockReset())

  it('lists unread notifications with explicit pagination', async () => {
    request.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } })

    await listNotifications({ status: 'UNREAD', page: 1, pageSize: 20 })

    expect(request).toHaveBeenCalledWith('/notifications?status=UNREAD&page=1&pageSize=20')
  })

  it('marks read, dismisses and snoozes by encoded notification id', async () => {
    request.mockResolvedValue(undefined)

    await markNotificationRead('notice / 1')
    await dismissNotification('notice / 1')
    await snoozeNotification('notice / 1', { snoozeUntil: '2026-07-21T01:30:00.000Z' })

    expect(request.mock.calls).toEqual([
      ['/notifications/notice%20%2F%201/read', { method: 'PUT' }],
      ['/notifications/notice%20%2F%201', { method: 'DELETE' }],
      [
        '/notifications/notice%20%2F%201/snooze',
        {
          method: 'PUT',
          body: JSON.stringify({ snoozeUntil: '2026-07-21T01:30:00.000Z' }),
        },
      ],
    ])
  })
})
