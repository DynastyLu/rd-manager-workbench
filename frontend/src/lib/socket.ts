import { useAuthStore } from '@/stores/auth'

interface SocketOptions {
  url: string
  reconnectDelay?: number // ms, default 3000
  heartbeatInterval?: number // ms, default 30000
  onOpen?: () => void
  onClose?: () => void
  onError?: (event: Event) => void
}

type MessageHandler<T = unknown> = (data: T) => void

interface IncomingMessage {
  type: string
  payload: unknown
}

export class SocketClient {
  private ws: WebSocket | null = null
  private handlers: Map<string, Set<MessageHandler>> = new Map()
  private heartbeatId: ReturnType<typeof setInterval> | null = null
  private reconnectId: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private destroyed = false

  constructor(
    private readonly options: SocketOptions & { reconnectDelay: number; heartbeatInterval: number }
  ) {}

  connect(): void {
    if (this.destroyed) return
    const token = useAuthStore.getState().accessToken
    const url = token
      ? `${this.options.url}${this.options.url.includes('?') ? '&' : '?'}token=${token}`
      : this.options.url

    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.startHeartbeat()
      this.options.onOpen?.()
    }

    this.ws.onclose = () => {
      this.stopHeartbeat()
      this.options.onClose?.()
      if (!this.destroyed) this.scheduleReconnect()
    }

    this.ws.onerror = (e) => {
      this.options.onError?.(e)
    }

    this.ws.onmessage = (e: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(e.data) as IncomingMessage
        // Dispatch to typed handlers (exact match)
        const bucket = this.handlers.get(msg.type)
        if (bucket) {
          bucket.forEach((h) => h(msg.payload))
        }
        // Dispatch to wildcard handlers (receive full message: { type, payload })
        const wildcardBucket = this.handlers.get('*')
        if (wildcardBucket) {
          wildcardBucket.forEach((h) => h(msg))
        }
      } catch {
        // non-JSON frame — ignore
      }
    }
  }

  disconnect(): void {
    this.destroyed = true
    this.stopHeartbeat()
    if (this.reconnectId !== null) {
      clearTimeout(this.reconnectId)
      this.reconnectId = null
    }
    this.ws?.close()
    this.ws = null
    this.handlers.clear()
  }

  send<T>(data: T): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  on<T>(type: string, handler: MessageHandler<T>): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set())
    }
    this.handlers.get(type)!.add(handler as MessageHandler)
    return () => {
      this.handlers.get(type)?.delete(handler as MessageHandler)
    }
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  private startHeartbeat(): void {
    this.heartbeatId = setInterval(() => {
      this.send({ type: 'ping' })
    }, this.options.heartbeatInterval)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatId !== null) {
      clearInterval(this.heartbeatId)
      this.heartbeatId = null
    }
  }

  private scheduleReconnect(): void {
    // Exponential backoff: delay * 2^attempts, capped at 30s
    const delay = Math.min(this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts), 30000)
    this.reconnectAttempts++
    this.reconnectId = setTimeout(() => {
      if (this.destroyed) return // was killed while waiting
      this.connect()
    }, delay)
  }
}

export function createSocket(options: SocketOptions): SocketClient {
  return new SocketClient({
    reconnectDelay: 3000,
    heartbeatInterval: 30000,
    ...options,
  })
}
