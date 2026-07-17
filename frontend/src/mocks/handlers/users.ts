import { http, HttpResponse } from 'msw'
import type { UserInfo, UserRole } from '@/types/user'

let mockUsers: UserInfo[] = [
  { id: 'user-1', username: 'admin', role: 'admin' },
  { id: 'user-2', username: 'alice', role: 'user' },
  { id: 'user-3', username: 'bob', role: 'guest' },
]

let nextId = 4

export const usersHandlers = [
  /** GET /api/auth/users */
  http.get('/api/auth/users', () => {
    return HttpResponse.json(mockUsers)
  }),

  /** POST /api/auth/users */
  http.post('/api/auth/users', async ({ request }) => {
    const body = (await request.json()) as {
      username: string
      password: string
      role: UserRole
    }

    if (mockUsers.some((u) => u.username === body.username)) {
      return HttpResponse.json(
        { code: 'USERNAME_TAKEN', message: 'Username already exists' },
        { status: 409 }
      )
    }

    const newUser: UserInfo = {
      id: `user-${nextId++}`,
      username: body.username,
      role: body.role,
    }
    mockUsers.push(newUser)

    return HttpResponse.json(newUser, { status: 201 })
  }),

  /** PATCH /api/auth/users/:id/role */
  http.patch('/api/auth/users/:id/role', async ({ params, request }) => {
    const { id } = params as { id: string }
    const body = (await request.json()) as { role: UserRole }
    const user = mockUsers.find((u) => u.id === id)

    if (!user) {
      return HttpResponse.json({ message: 'User not found' }, { status: 404 })
    }

    user.role = body.role
    return HttpResponse.json(user)
  }),

  /** DELETE /api/auth/users/:id */
  http.delete('/api/auth/users/:id', ({ params }) => {
    const { id } = params as { id: string }
    mockUsers = mockUsers.filter((u) => u.id !== id)
    return new HttpResponse(null, { status: 204 })
  }),
]
