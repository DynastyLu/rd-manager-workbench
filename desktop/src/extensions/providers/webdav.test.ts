import { afterEach, describe, expect, it, vi } from 'vitest'
import { webDav } from './webdav.js'

describe('webDav', () => {
  afterEach(() => vi.unstubAllGlobals())
  const profile = {
    id: 'drive-1', kind: 'CLOUD_DRIVE' as const, provider: 'WEBDAV' as const, enabled: true,
    publicConfig: { baseUrl: 'https://dav.example.com', remoteRoot: '/workbench/' },
  }
  const credential = { username: 'user', password: 'secret' }

  it('rejects traversal before any request and refuses cross-host redirects', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(webDav({
      runId: 'run-1', profile, operation: 'CLOUD_UPLOAD_PREFLIGHT', payload: { remotePath: '../secret' },
    }, credential)).resolves.toMatchObject({ status: 'REJECTED', errorCode: 'EXTERNAL_PATH_INVALID' })
    expect(fetchMock).not.toHaveBeenCalled()

    fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://evil.example/file' } }))
    await expect(webDav({ runId: 'run-2', profile, operation: 'TEST_CONNECTION', payload: {} }, credential)).resolves.toMatchObject({
      status: 'FAILED', errorCode: 'EXTERNAL_CROSS_HOST_REDIRECT',
    })
  })

  it('rejects a network-path remote root before credentials can be sent', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(webDav({
      runId: 'run-root',
      profile: { ...profile, publicConfig: { ...profile.publicConfig, remoteRoot: '//evil.example/files' } },
      operation: 'TEST_CONNECTION',
      payload: {},
    }, credential)).resolves.toMatchObject({ status: 'REJECTED', errorCode: 'EXTERNAL_PATH_INVALID' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('preflights remote version/hash and reports conflicts without overwriting', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
      status: 200, headers: { etag: '"v2"', 'x-content-sha256': 'b'.repeat(64) },
    }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(webDav({
      runId: 'run-3', profile, operation: 'CLOUD_UPLOAD_PREFLIGHT',
      payload: { remotePath: 'backups/a.zip', remoteVersion: '"v1"', localHash: 'a'.repeat(64) },
    }, credential)).resolves.toMatchObject({
      status: 'SUCCEEDED', output: { action: 'CONFLICT', remoteVersion: '"v2"', remoteHash: 'b'.repeat(64) },
    })
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('HEAD')
  })

  it('verifies upload and download SHA-256 without silent overwrite', async () => {
    const bytes = Buffer.from('hello')
    const sha256 = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204, headers: { etag: '"v3"' } }))
      .mockResolvedValueOnce(new Response(bytes, { status: 200, headers: { etag: '"v3"' } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(webDav({
      runId: 'run-4', profile, operation: 'CLOUD_UPLOAD_COMMIT',
      payload: { remotePath: 'files/a.txt', contentBase64: bytes.toString('base64'), sha256, remoteVersion: '"v2"' },
    }, credential)).resolves.toMatchObject({ status: 'SUCCEEDED', output: { sha256, remoteVersion: '"v3"' } })
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({ 'if-match': '"v2"' })

    await expect(webDav({
      runId: 'run-5', profile, operation: 'CLOUD_DOWNLOAD_COMMIT',
      payload: { remotePath: 'files/a.txt', expectedHash: sha256, expectedVersion: '"v3"' },
    }, credential)).resolves.toMatchObject({ status: 'SUCCEEDED', output: { contentBase64: bytes.toString('base64'), sha256 } })
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).headers).toMatchObject({ 'if-match': '"v3"' })
  })
})
