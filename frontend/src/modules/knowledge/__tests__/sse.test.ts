import { createSseParser } from '../sse'

describe('createSseParser', () => {
  it('keeps the event name and JSON data across network packet boundaries', () => {
    const onEvent = vi.fn()
    const parser = createSseParser(onEvent)

    parser.push('event: retrieval_completed\n')
    parser.push('data: {"searchedDocumentCount":0,')
    parser.push('"relevantCount":0}\n\n')

    expect(onEvent).toHaveBeenCalledWith('retrieval_completed', {
      searchedDocumentCount: 0,
      relevantCount: 0,
    })
  })

  it('flushes a final event even when the stream omits the trailing blank line', () => {
    const onEvent = vi.fn()
    const parser = createSseParser(onEvent)

    parser.push('event: answer_delta\r\ndata: {"text":"完成"}')
    parser.finish()

    expect(onEvent).toHaveBeenCalledWith('answer_delta', {
      text: '完成',
    })
  })
})
