import { it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/mocks/server'
import { useAuthStore } from '@/stores/auth'

function TestComponent() {
  const { user, isLoading, login, logout } = useAuthStore()
  if (isLoading) return <div>loading</div>
  if (!user) return <button onClick={() => login('admin', 'pass')}>login</button>
  return (
    <div>
      <span>{user.username}</span>
      <button onClick={logout}>logout</button>
    </div>
  )
}

beforeEach(() => {
  // Reset store to a clean non-loading state between tests
  useAuthStore.setState({ user: null, accessToken: null, isLoading: false })
})

it('starts loading then resolves unauthenticated when refresh fails', async () => {
  server.use(
    http.post('/api/auth/refresh', () =>
      HttpResponse.json({ error: 'TOKEN_MISSING' }, { status: 401 })
    )
  )
  useAuthStore.setState({ isLoading: true })
  // Kick off refresh manually (as main.tsx does in production)
  useAuthStore
    .getState()
    .refreshAccessToken()
    .finally(() => {
      useAuthStore.getState().setLoading(false)
    })
  render(<TestComponent />)
  expect(screen.getByText('loading')).toBeTruthy()
  await waitFor(() => expect(screen.getByRole('button', { name: 'login' })).toBeTruthy())
})

it('restores session when refresh succeeds on mount', async () => {
  // Default MSW handlers already return success for refresh and me
  useAuthStore.setState({ isLoading: true })
  useAuthStore
    .getState()
    .refreshAccessToken()
    .finally(() => {
      useAuthStore.getState().setLoading(false)
    })
  render(<TestComponent />)
  await waitFor(() => expect(screen.getByText('admin')).toBeTruthy())
})

it('sets user after successful login', async () => {
  server.use(
    http.post('/api/auth/login', async () =>
      HttpResponse.json({
        accessToken: 'tok',
        user: { id: '1', username: 'admin', role: 'admin' },
      })
    )
  )
  render(<TestComponent />)
  await waitFor(() => screen.getByRole('button', { name: 'login' }))
  await userEvent.click(screen.getByRole('button', { name: 'login' }))
  await waitFor(() => expect(screen.getByText('admin')).toBeTruthy())
})

it('clears user after logout', async () => {
  useAuthStore.setState({
    user: { id: '1', username: 'admin', role: 'admin' },
    accessToken: 'tok',
    isLoading: false,
  })
  render(<TestComponent />)
  await waitFor(() => screen.getByRole('button', { name: 'logout' }))
  await userEvent.click(screen.getByRole('button', { name: 'logout' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'login' })).toBeTruthy())
})
