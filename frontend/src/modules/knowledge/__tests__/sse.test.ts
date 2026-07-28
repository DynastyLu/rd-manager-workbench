import { createSseParser } from '../sse'

describe('createSseParser', () => {
  it('keeps the event name and JSON data across network packet boundaries', () => {
    const onEvent = vi.fn()
    const parser = createSseParser(onEvent)

    parser.push('event: status\n')
    parser.push('data: {"phase":"empty",')
    parser.push('"message":"无结果"}\n\n')

    expect(onEvent).toHaveBeenCalledWith('status', {
      phase: 'empty',
      message: '无结果',
    })
  })

  it('flushes a final event even when the stream omits the trailing blank line', () => {
    const onEvent = vi.fn()
    const parser = createSseParser(onEvent)

    parser.push('event: token\r\ndata: {"content":"完成","index":2}')
    parser.finish()

    expect(onEvent).toHaveBeenCalledWith('token', {
      content: '完成',
      index: 2,
    })
  })
})
