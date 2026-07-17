import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSocket } from '../socket'

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onclose: ((e: { code: number; reason: string }) => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: ((e: Event) => void) | null = null

  readonly url: string
  readonly sentMessages: string[] = []

  constructor(url: string) {
    this.url = url
    // Simulate async open
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      this.onopen?.()
    }, 0)
  }

  send(data: string) {
    this.sentMessages.push(data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code: 1000, reason: 'Normal' })
  }
}

describe('createSocket / SocketClient', () => {
  let mockWsInstance: MockWebSocket

  beforeEach(() => {
    const WsMock = function (this: MockWebSocket, url: string) {
      mockWsInstance = new MockWebSocket(url)
      return mockWsInstance
    } as unknown as typeof WebSocket
    ;(WsMock as unknown as typeof MockWebSocket).OPEN = MockWebSocket.OPEN
    ;(WsMock as unknown as typeof MockWebSocket).CONNECTING = MockWebSocket.CONNECTING
    ;(WsMock as unknown as typeof MockWebSocket).CLOSED = MockWebSocket.CLOSED
    vi.stubGlobal('WebSocket', WsMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('connect() opens a WebSocket to the given URL', async () => {
    vi.useFakeTimers()
    const socket = createSocket({ url: 'ws://localhost/ws' })
    socket.connect()
    await vi.advanceTimersByTimeAsync(0)
    expect(mockWsInstance.url).toBe('ws://localhost/ws')
  })

  it('send() serialises data as JSON', async () => {
    vi.useFakeTimers()
    const socket = createSocket({ url: 'ws://localhost/ws' })
    socket.connect()
    await vi.advanceTimersByTimeAsync(0)
    socket.send({ type: 'ping' })
    expect(mockWsInstance.sentMessages[0]).toBe(JSON.stringify({ type: 'ping' }))
  })

  it('on() registers a type handler and returns an unsubscribe function', async () => {
    vi.useFakeTimers()
    const socket = createSocket({ url: 'ws://localhost/ws' })
    socket.connect()
    await vi.advanceTimersByTimeAsync(0)

    const handler = vi.fn()
    const unsub = socket.on<{ value: number }>('test.event', handler)

    // Simulate incoming message
    mockWsInstance.onmessage?.({
      data: JSON.stringify({ type: 'test.event', payload: { value: 42 } }),
    })
    expect(handler).toHaveBeenCalledWith({ value: 42 })

    // Unsubscribe stops further calls
    unsub()
    mockWsInstance.onmessage?.({
      data: JSON.stringify({ type: 'test.event', payload: { value: 99 } }),
    })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('disconnect() closes the WebSocket', async () => {
    vi.useFakeTimers()
    const socket = createSocket({ url: 'ws://localhost/ws' })
    socket.connect()
    await vi.advanceTimersByTimeAsync(0)
    socket.disconnect()
    expect(mockWsInstance.readyState).toBe(MockWebSocket.CLOSED)
  })

  it('does not dispatch to wrong type handlers', async () => {
    vi.useFakeTimers()
    const socket = createSocket({ url: 'ws://localhost/ws' })
    socket.connect()
    await vi.advanceTimersByTimeAsync(0)

    const handler = vi.fn()
    socket.on('ocr.progress', handler)

    mockWsInstance.onmessage?.({ data: JSON.stringify({ type: 'other.event', payload: {} }) })
    expect(handler).not.toHaveBeenCalled()
  })

  it('wildcard "*" handler receives every message as { type, payload }', async () => {
    vi.useFakeTimers()
    const socket = createSocket({ url: 'ws://localhost/ws' })
    socket.connect()
    await vi.advanceTimersByTimeAsync(0)

    const wildcard = vi.fn()
    socket.on('*', wildcard)

    mockWsInstance.onmessage?.({
      data: JSON.stringify({ type: 'ocr.progress', payload: { pct: 50 } }),
    })
    mockWsInstance.onmessage?.({
      data: JSON.stringify({ type: 'chat.message', payload: { text: 'hi' } }),
    })
    expect(wildcard).toHaveBeenCalledTimes(2)
    expect(wildcard).toHaveBeenNthCalledWith(1, { type: 'ocr.progress', payload: { pct: 50 } })
  })
})
