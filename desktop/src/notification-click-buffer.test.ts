import { describe, expect, it, vi } from 'vitest'
import { NotificationClickBuffer } from './notification-click-buffer.js'

describe('NotificationClickBuffer', () => {
  it('replays notification clicks that arrive before the renderer subscribes', () => {
    const buffer = new NotificationClickBuffer()
    const handler = vi.fn()

    buffer.push('/calendar/event-1')
    buffer.subscribe(handler)

    expect(handler).toHaveBeenCalledWith('/calendar/event-1')
  })

  it('delivers later clicks immediately and stops after unsubscribe', () => {
    const buffer = new NotificationClickBuffer()
    const handler = vi.fn()
    const unsubscribe = buffer.subscribe(handler)

    buffer.push('/my-work')
    unsubscribe()
    buffer.push('/projects/project-1')

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith('/my-work')
  })
})
