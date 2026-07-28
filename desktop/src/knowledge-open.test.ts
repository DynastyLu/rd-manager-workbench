import { describe, expect, it, vi } from 'vitest'
import { openKnowledgeOriginal } from './knowledge-open.js'

describe('openKnowledgeOriginal', () => {
  it('resolves the watched file through the backend before opening it', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: { filePath: '/allowed/研发计划.docx' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const openPath = vi.fn(async () => '')

    await expect(openKnowledgeOriginal(
      { documentId: 'document-1' },
      { fetchImpl, openPath, backendBaseUrl: 'http://127.0.0.1:4311/api' },
    )).resolves.toEqual({ opened: true })

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:4311/api/knowledge/documents/document-1/local-open-path',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(openPath).toHaveBeenCalledWith('/allowed/研发计划.docx')
  })

  it('rejects arbitrary renderer paths and invalid document identifiers', async () => {
    const fetchImpl = vi.fn()
    const openPath = vi.fn()

    await expect(openKnowledgeOriginal(
      { documentId: '../secret', filePath: '/tmp/secret' } as never,
      { fetchImpl, openPath, backendBaseUrl: 'http://127.0.0.1:4311/api' },
    )).rejects.toThrow('INVALID_DOCUMENT_ID')

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(openPath).not.toHaveBeenCalled()
  })
})
