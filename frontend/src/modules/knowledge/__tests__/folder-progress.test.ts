import { parseFolderProgressEvent } from '../folder-progress'

describe('parseFolderProgressEvent', () => {
  it('unwraps the MessageEvent data envelope emitted by the Nest SSE endpoint', () => {
    expect(parseFolderProgressEvent(JSON.stringify({
      data: {
        watchId: 'watch-1',
        phase: 'importing',
        total: 10,
        current: 4,
        currentFile: '研发计划.docx',
        percent: 40,
      },
    }))).toEqual({
      watchId: 'watch-1',
      phase: 'importing',
      total: 10,
      current: 4,
      currentFile: '研发计划.docx',
      percent: 40,
    })
  })
})
