import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, download, request } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/store'
import type { CurrentUser, LoginResponse } from '@/modules/auth/types'

const user: CurrentUser = {
  id: 'user-1',
  username: 'admin',
  employeeNo: 'RD-001',
  status: 'ACTIVE',
  mustChangePassword: false,
  permissionVersion: 1,
  resourceProfileId: 'employee-1',
  displayName: '系统管理员',
  department: '研发部',
  roleTitle: '研发主管',
  roleCodes: ['SUPER_ADMIN'],
  permissions: [{ code: 'project.read', dataScope: 'ALL', scopeConfig: null }],
}

const initialSession: LoginResponse = {
  accessToken: 'expired-access-token',
  csrfToken: 'csrf-token-1',
  user,
  mustChangePassword: false,
}

const refreshedSession: LoginResponse = {
  ...initialSession,
  accessToken: 'fresh-access-token',
  csrfToken: 'csrf-token-2',
}

const otherUserSession: LoginResponse = {
  accessToken: 'other-user-access-token',
  csrfToken: 'other-user-csrf-token',
  mustChangePassword: false,
  user: {
    ...user,
    id: 'user-2',
    username: 'employee',
    resourceProfileId: 'employee-2',
    displayName: '普通员工',
    roleCodes: ['EMPLOYEE'],
  },
}

function success<T>(data: T, init?: ResponseInit): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function failure(status: number, code: string, message = code): Response {
  return new Response(JSON.stringify({ success: false, error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function requestPath(input: RequestInfo | URL): string {
  return typeof input === 'string' ? new URL(input).pathname : new URL(input.url).pathname
}

function requestHeaders(init: RequestInit | undefined): Headers {
  return new Headers(init?.headers)
}

describe('authenticated HTTP client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useAuthStore.setState({
      status: 'BOOTSTRAPPING',
      authEpoch: 0,
      accessToken: undefined,
      csrfToken: undefined,
      user: undefined,
    })
  })

  it('sends cookies and the in-memory bearer token on protected requests', async () => {
    useAuthStore.getState().setSession(initialSession)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(success({ id: 'project-1' }))

    await request('/projects/project-1')

    const [, init] = fetchMock.mock.calls[0]!
    expect(init?.credentials).toBe('include')
    expect(requestHeaders(init).get('Authorization')).toBe('Bearer expired-access-token')
  })

  it.each(['/auth/refresh', '/auth/logout'])(
    'attaches the current CSRF token to %s',
    async (path) => {
      useAuthStore.getState().setSession(initialSession)
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        path.endsWith('/refresh')
          ? success(refreshedSession, { status: 201 })
          : success({
              loggedOut: true,
            })
      )

      await request(path, { method: 'POST' })

      const [, init] = fetchMock.mock.calls[0]!
      expect(init?.credentials).toBe('include')
      expect(requestHeaders(init).get('X-CSRF-Token')).toBe('csrf-token-1')
    }
  )

  it('uses one refresh for simultaneous 401 responses and retries both requests', async () => {
    useAuthStore.getState().setSession(initialSession)
    const attempts = new Map<string, number>()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = requestPath(input)
      attempts.set(path, (attempts.get(path) ?? 0) + 1)

      if (path.endsWith('/auth/refresh')) {
        expect(requestHeaders(init).get('X-CSRF-Token')).toBe('csrf-token-1')
        return success(refreshedSession, { status: 201 })
      }
      if (attempts.get(path) === 1) {
        return failure(401, 'AUTH_REQUIRED')
      }
      expect(requestHeaders(init).get('Authorization')).toBe('Bearer fresh-access-token')
      return success(path.endsWith('/projects') ? [{ id: 'project-1' }] : [{ id: 'task-1' }])
    })

    const [projects, tasks] = await Promise.all([
      request<Array<{ id: string }>>('/projects'),
      request<Array<{ id: string }>>('/tasks'),
    ])

    expect(projects).toEqual([{ id: 'project-1' }])
    expect(tasks).toEqual([{ id: 'task-1' }])
    expect(
      fetchMock.mock.calls.filter(([input]) => requestPath(input).endsWith('/auth/refresh'))
    ).toHaveLength(1)
    expect(attempts.get('/api/projects')).toBe(2)
    expect(attempts.get('/api/tasks')).toBe(2)
    expect(useAuthStore.getState().accessToken).toBe('fresh-access-token')
  })

  it('does not refresh twice when a delayed 401 arrives after the token was rotated', async () => {
    useAuthStore.getState().setSession(initialSession)
    let releaseDelayedUnauthorized: (() => void) | undefined
    const delayedUnauthorized = new Promise<void>((resolve) => {
      releaseDelayedUnauthorized = resolve
    })
    let refreshCount = 0
    const attempts = new Map<string, number>()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = requestPath(input)
      const attempt = (attempts.get(path) ?? 0) + 1
      attempts.set(path, attempt)

      if (path.endsWith('/auth/refresh')) {
        refreshCount += 1
        return success(refreshedSession, { status: 201 })
      }
      if (path.endsWith('/projects') && attempt === 1) {
        return failure(401, 'AUTH_REQUIRED')
      }
      if (path.endsWith('/tasks') && attempt === 1) {
        await delayedUnauthorized
        return failure(401, 'AUTH_REQUIRED')
      }
      expect(requestHeaders(init).get('Authorization')).toBe('Bearer fresh-access-token')
      return success(path.endsWith('/projects') ? [{ id: 'project-1' }] : [{ id: 'task-1' }])
    })

    const projectsPromise = request<Array<{ id: string }>>('/projects')
    const tasksPromise = request<Array<{ id: string }>>('/tasks')
    await projectsPromise
    releaseDelayedUnauthorized?.()

    await expect(tasksPromise).resolves.toEqual([{ id: 'task-1' }])
    expect(refreshCount).toBe(1)
    expect(attempts.get('/api/tasks')).toBe(2)
  })

  it('does not replay a delayed request under a different signed-in user', async () => {
    useAuthStore.getState().setSession(initialSession)
    let releaseUnauthorized: (() => void) | undefined
    const delayedUnauthorized = new Promise<void>((resolve) => {
      releaseUnauthorized = resolve
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      await delayedUnauthorized
      return failure(401, 'AUTH_REQUIRED')
    })

    const oldRequest = request('/tasks')
    useAuthStore.getState().setSession(otherUserSession)
    releaseUnauthorized?.()

    await expect(oldRequest).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState()).toMatchObject({
      status: 'AUTHENTICATED',
      accessToken: 'other-user-access-token',
      user: expect.objectContaining({ id: 'user-2' }),
    })
  })

  it('ignores an old refresh result when the active identity changes', async () => {
    useAuthStore.getState().setSession(initialSession)
    let resolveRefresh: ((response: Response) => void) | undefined
    const pendingRefresh = new Promise<Response>((resolve) => {
      resolveRefresh = resolve
    })
    let refreshStarted: (() => void) | undefined
    const didStartRefresh = new Promise<void>((resolve) => {
      refreshStarted = resolve
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (requestPath(input).endsWith('/auth/refresh')) {
        refreshStarted?.()
        return pendingRefresh
      }
      return failure(401, 'AUTH_REQUIRED')
    })

    const oldRequest = request('/projects')
    await didStartRefresh
    useAuthStore.getState().setSession(otherUserSession)
    resolveRefresh?.(success(refreshedSession, { status: 201 }))

    await expect(oldRequest).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    expect(useAuthStore.getState()).toMatchObject({
      status: 'AUTHENTICATED',
      accessToken: 'other-user-access-token',
      user: expect.objectContaining({ id: 'user-2' }),
    })
  })

  it('does not clear a new identity when an old retry later returns 401', async () => {
    useAuthStore.getState().setSession(initialSession)
    let releaseRetry: (() => void) | undefined
    const delayedRetry = new Promise<void>((resolve) => {
      releaseRetry = resolve
    })
    let retryStarted: (() => void) | undefined
    const didStartRetry = new Promise<void>((resolve) => {
      retryStarted = resolve
    })
    let projectAttempts = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (requestPath(input).endsWith('/auth/refresh')) {
        return success(refreshedSession, { status: 201 })
      }
      projectAttempts += 1
      if (projectAttempts === 1) return failure(401, 'AUTH_REQUIRED')
      retryStarted?.()
      await delayedRetry
      return failure(401, 'AUTH_REQUIRED')
    })

    const oldRequest = request('/projects')
    await didStartRetry
    useAuthStore.getState().setSession(otherUserSession)
    releaseRetry?.()

    await expect(oldRequest).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    expect(projectAttempts).toBe(2)
    expect(useAuthStore.getState()).toMatchObject({
      status: 'AUTHENTICATED',
      accessToken: 'other-user-access-token',
      user: expect.objectContaining({ id: 'user-2' }),
    })
  })

  it('retries an individual request at most once after a successful refresh', async () => {
    useAuthStore.getState().setSession(initialSession)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      return requestPath(input).endsWith('/auth/refresh')
        ? success(refreshedSession, { status: 201 })
        : failure(401, 'AUTH_REQUIRED')
    })

    await expect(request('/projects')).rejects.toMatchObject<ApiError>({
      status: 401,
      code: 'AUTH_REQUIRED',
    })

    expect(
      fetchMock.mock.calls.filter(([input]) => requestPath(input).endsWith('/projects'))
    ).toHaveLength(2)
    expect(
      fetchMock.mock.calls.filter(([input]) => requestPath(input).endsWith('/auth/refresh'))
    ).toHaveLength(1)
    expect(useAuthStore.getState().status).toBe('ANONYMOUS')
  })

  it.each(['AUTH_REFRESH_REPLAYED', 'AUTH_REQUIRED'])(
    'clears auth when refresh terminates with %s and does not start a second refresh',
    async (refreshErrorCode) => {
      useAuthStore.getState().setSession(initialSession)
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        return requestPath(input).endsWith('/auth/refresh')
          ? failure(401, refreshErrorCode)
          : failure(401, 'AUTH_REQUIRED')
      })

      await expect(request('/projects')).rejects.toMatchObject<ApiError>({
        status: 401,
        code: refreshErrorCode,
      })

      expect(
        fetchMock.mock.calls.filter(([input]) => requestPath(input).endsWith('/auth/refresh'))
      ).toHaveLength(1)
      expect(useAuthStore.getState()).toMatchObject({
        status: 'ANONYMOUS',
        accessToken: undefined,
        csrfToken: undefined,
        user: undefined,
      })
    }
  )

  it('clears a revoked session without attempting refresh', async () => {
    useAuthStore.getState().setSession(initialSession)
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(failure(401, 'AUTH_SESSION_REVOKED'))

    await expect(request('/projects')).rejects.toMatchObject<ApiError>({
      status: 401,
      code: 'AUTH_SESSION_REVOKED',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().status).toBe('ANONYMOUS')
  })

  it('preserves FormData and AbortSignal when an upload is replayed', async () => {
    useAuthStore.getState().setSession(initialSession)
    const form = new FormData()
    form.append('file', new Blob(['weekly report']), '周报.xlsx')
    const controller = new AbortController()
    let uploadAttempts = 0
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (requestPath(input).endsWith('/auth/refresh')) {
        return success(refreshedSession, { status: 201 })
      }
      uploadAttempts += 1
      return uploadAttempts === 1 ? failure(401, 'AUTH_REQUIRED') : success({ id: 'file-1' })
    })

    await request('/files', {
      method: 'POST',
      body: form,
      signal: controller.signal,
    })

    const uploadCalls = fetchMock.mock.calls.filter(
      ([input]) => !requestPath(input).endsWith('/auth/refresh')
    )
    expect(uploadCalls).toHaveLength(2)
    for (const [, init] of uploadCalls) {
      expect(init?.body).toBe(form)
      expect(init?.signal).toBe(controller.signal)
      expect(requestHeaders(init).has('Content-Type')).toBe(false)
    }
  })

  it('preserves the encoded download filename after refresh and replay', async () => {
    useAuthStore.getState().setSession(initialSession)
    let downloadAttempts = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (requestPath(input).endsWith('/auth/refresh')) {
        return success(refreshedSession, { status: 201 })
      }
      downloadAttempts += 1
      if (downloadAttempts === 1) return failure(401, 'AUTH_REQUIRED')
      return new Response('xlsx', {
        status: 200,
        headers: {
          'Content-Disposition': "attachment; filename*=UTF-8''%E5%91%A8%E6%8A%A5.xlsx",
        },
      })
    })

    const result = await download('/employee-work-imports/template', {
      signal: new AbortController().signal,
    })

    expect(result.fileName).toBe('周报.xlsx')
    await expect(result.blob.text()).resolves.toBe('xlsx')
    expect(downloadAttempts).toBe(2)
  })
})
