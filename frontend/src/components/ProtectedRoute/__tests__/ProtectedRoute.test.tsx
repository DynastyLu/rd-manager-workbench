import { it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from '../ProtectedRoute'

vi.mock('@/stores/auth', () => ({ useAuthStore: vi.fn() }))
import { useAuthStore } from '@/stores/auth'

function wrap(initialPath = '/protected') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>login page</div>} />
        <Route path="/" element={<div>home</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/protected" element={<div>protected content</div>} />
        </Route>
        <Route element={<ProtectedRoute requireAdmin />}>
          <Route path="/admin" element={<div>admin content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

it('shows loading text while isLoading', () => {
  useAuthStore.mockImplementation((selector) => selector({ user: null, isLoading: true }))
  wrap()
  expect(document.body.textContent).toContain('加载中')
})

it('redirects to /login when unauthenticated', () => {
  useAuthStore.mockImplementation((selector) => selector({ user: null, isLoading: false }))
  wrap()
  expect(screen.getByText('login page')).toBeTruthy()
})

it('renders content when authenticated', () => {
  useAuthStore.mockImplementation((selector) =>
    selector({ user: { id: 1, username: 'user', role: 'user' }, isLoading: false })
  )
  wrap()
  expect(screen.getByText('protected content')).toBeTruthy()
})

it('redirects non-admin to home for admin routes', () => {
  useAuthStore.mockImplementation((selector) =>
    selector({ user: { id: 1, username: 'user', role: 'user' }, isLoading: false })
  )
  wrap('/admin')
  expect(screen.getByText('home')).toBeTruthy()
})

it('renders admin content for admin users', () => {
  useAuthStore.mockImplementation((selector) =>
    selector({ user: { id: 1, username: 'admin', role: 'admin' }, isLoading: false })
  )
  wrap('/admin')
  expect(screen.getByText('admin content')).toBeTruthy()
})
