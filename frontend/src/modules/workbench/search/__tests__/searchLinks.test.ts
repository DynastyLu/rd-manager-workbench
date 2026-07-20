import { describe, expect, it } from 'vitest'

import { buildLocalSearchResultLink } from '../searchLinks'

describe('search result share links', () => {
  it('builds a HashRouter URL for the web shell', () => {
    expect(
      buildLocalSearchResultLink(
        'http://127.0.0.1:4312/#/search?q=%E9%A1%B9%E7%9B%AE',
        '/my-work?taskId=task-1'
      )
    ).toBe('http://127.0.0.1:4312/#/my-work?taskId=task-1')
  })

  it('preserves a file URL for the Electron shell instead of producing a null origin', () => {
    expect(
      buildLocalSearchResultLink(
        'file:///Applications/RD%20Workbench.app/Contents/Resources/app/index.html#/search',
        '/docs?documentId=document-1'
      )
    ).toBe(
      'file:///Applications/RD%20Workbench.app/Contents/Resources/app/index.html#/docs?documentId=document-1'
    )
  })
})
