import { describe, expect, it } from 'vitest'
import { resolveApiUrl } from '../api-url'

describe('resolveApiUrl', () => {
  it('uses the development backend for an HTTP page without runtime configuration', () => {
    expect(
      resolveApiUrl('/knowledge/sessions', {
        apiBaseUrl: '',
        isDevelopment: true,
        pageProtocol: 'http:',
      })
    ).toBe('http://127.0.0.1:4311/api/knowledge/sessions')
  })

  it('uses packaged runtime configuration for file pages', () => {
    expect(
      resolveApiUrl('/knowledge/documents/upload', {
        apiBaseUrl: 'http://127.0.0.1:4999/runtime-api/',
        isDevelopment: false,
        pageProtocol: 'file:',
      })
    ).toBe('http://127.0.0.1:4999/runtime-api/knowledge/documents/upload')
  })

  it('rejects packaged file pages without a runtime API base URL', () => {
    expect(() =>
      resolveApiUrl('/knowledge/chat/session-1/messages', {
        apiBaseUrl: '',
        isDevelopment: false,
        pageProtocol: 'file:',
      })
    ).toThrow('运行时 API 地址')
  })

  it('does not duplicate separators when resolving relative paths', () => {
    expect(
      resolveApiUrl('knowledge/folders/watch-1/progress', {
        apiBaseUrl: 'http://127.0.0.1:4311/api/',
        isDevelopment: false,
        pageProtocol: 'file:',
      })
    ).toBe('http://127.0.0.1:4311/api/knowledge/folders/watch-1/progress')
  })
})
