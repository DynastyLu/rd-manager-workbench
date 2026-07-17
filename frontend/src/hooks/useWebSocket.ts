import { useEffect, useRef, useState, useCallback } from 'react'
import type { SocketClient } from '@/lib/socket'
import { createSocket } from '@/lib/socket'

interface UseWebSocketOptions<T> {
  url: string
  /** Called for every incoming message. T is the full parsed message { type, payload } by default. */
  onMessage?: (data: T) => void
  enabled?: boolean // false 时不建立连接（未登录时）
}

interface UseWebSocketResult {
  connected: boolean
  send: (data: unknown) => void
}

export function useWebSocket<T = unknown>(options: UseWebSocketOptions<T>): UseWebSocketResult {
  const { url, onMessage, enabled = true } = options
  const [connected, setConnected] = useState(false)
  const clientRef = useRef<SocketClient | null>(null)
  const onMessageRef = useRef(onMessage)

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    if (!enabled) return

    const client = createSocket({
      url,
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
    })

    client.on<T>('*', (data) => onMessageRef.current?.(data))

    client.connect()
    clientRef.current = client

    return () => {
      client.disconnect()
      clientRef.current = null
      setConnected(false)
    }
  }, [url, enabled])

  const send = useCallback((data: unknown) => {
    clientRef.current?.send(data)
  }, [])

  return { connected, send }
}
