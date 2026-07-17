import { http, HttpResponse } from 'msw'

const mockUser = {
  id: 'user-1',
  username: 'admin',
  role: 'admin' as const,
}

export const authHandlers = [
  /** POST /api/auth/login */
  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as { username: string; password: string }

    if (body.username === 'admin' && body.password === 'changeme123') {
      return HttpResponse.json({
        accessToken: 'mock-access-token',
        user: mockUser,
      })
    }

    return HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 })
  }),

  /** POST /api/auth/logout */
  http.post('/api/auth/logout', () => {
    return HttpResponse.json({ success: true })
  }),

  /** POST /api/auth/refresh */
  http.post('/api/auth/refresh', () => {
    return HttpResponse.json({ accessToken: 'mock-refreshed-token' })
  }),

  /** GET /api/auth/me */
  http.get('/api/auth/me', () => {
    return HttpResponse.json(mockUser)
  }),
]
