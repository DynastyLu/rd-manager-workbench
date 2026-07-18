import { beforeEach, describe, expect, it, vi } from 'vitest'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/lib/http', () => ({ request }))

import {
  createCalendarEvent,
  listCalendarEntries,
  updateCalendarEvent,
} from '../calendar'

describe('calendar API', () => {
  beforeEach(() => request.mockReset())

  it('serializes the visible calendar range', async () => {
    request.mockResolvedValue([])
    await listCalendarEntries({
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
    })
    expect(request).toHaveBeenCalledWith(
      '/calendar/entries?from=2026-07-01T00%3A00%3A00.000Z&to=2026-08-01T00%3A00%3A00.000Z'
    )
  })

  it('creates and updates a real calendar event', async () => {
    request.mockResolvedValue({ id: 'event-1' })
    const input = {
      title: '候选人面试',
      type: 'INTERVIEW' as const,
      startAt: '2026-07-20T02:00:00.000Z',
      endAt: '2026-07-20T03:00:00.000Z',
      allDay: false,
    }
    await createCalendarEvent(input)
    await updateCalendarEvent('event-1', { startAt: input.startAt, endAt: input.endAt })

    expect(request).toHaveBeenNthCalledWith(1, '/calendar/events', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    expect(request).toHaveBeenNthCalledWith(2, '/calendar/events/event-1', {
      method: 'PATCH',
      body: JSON.stringify({ startAt: input.startAt, endAt: input.endAt }),
    })
  })
})
