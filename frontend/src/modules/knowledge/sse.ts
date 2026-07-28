export type KnowledgeSseEvent = 'status' | 'token' | 'citations' | 'done' | 'error' | 'message'

export function createSseParser(
  onEvent: (event: KnowledgeSseEvent, data: unknown) => void,
) {
  let buffer = ''

  const emitBlock = (block: string) => {
    let event: KnowledgeSseEvent = 'message'
    const dataLines: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        const candidate = line.slice(6).trim()
        if (['status', 'token', 'citations', 'done', 'error', 'message'].includes(candidate)) {
          event = candidate as KnowledgeSseEvent
        }
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^ /, ''))
      }
    }
    if (dataLines.length === 0) return
    const raw = dataLines.join('\n')
    try {
      onEvent(event, JSON.parse(raw) as unknown)
    } catch {
      onEvent(event, raw)
    }
  }

  const drain = () => {
    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      if (block.trim()) emitBlock(block)
      boundary = buffer.indexOf('\n\n')
    }
  }

  return {
    push(chunk: string) {
      buffer += chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      drain()
    },
    finish() {
      drain()
      if (buffer.trim()) emitBlock(buffer)
      buffer = ''
    },
  }
}
