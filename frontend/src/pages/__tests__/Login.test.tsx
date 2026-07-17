import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../stores/auth', () => ({ useAuthStore: vi.fn() }))
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams()],
  }
})

import { useAuthStore } from '../../stores/auth'
import Login from '../Login'

function wrap() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  )
}

beforeEach(() => {
  mockNavigate.mockReset()
  useAuthStore.mockImplementation((selector) =>
    selector({ login: vi.fn(), user: null, isLoading: false })
  )
})

it('renders username and password fields', () => {
  wrap()
  expect(screen.getByTestId('login-root')).toHaveAttribute('data-theme', 'world-cup')
  expect(screen.getByTestId('login-root')).toHaveAttribute('data-layout', 'full-bleed-stadium')
  expect(screen.getByTestId('login-split-layout')).toBeTruthy()
  expect(screen.getByTestId('login-panel')).toHaveAttribute('data-placement', 'right')
  expect(screen.getByTestId('login-panel')).toHaveAttribute('data-edge', 'far-right')
  expect(screen.getByTestId('login-panel')).toHaveAttribute('data-tone', 'stadium-login')
  expect(screen.getByPlaceholderText(/用户名/i)).toBeTruthy()
  expect(screen.getByPlaceholderText(/密码/i)).toBeTruthy()
  expect(screen.getByTestId('password-peekers')).toHaveAttribute('data-placement', 'left-stage')
  expect(screen.getByTestId('password-peekers')).toHaveAttribute(
    'data-character-style',
    'cartoon-football-stars'
  )
  expect(screen.getByTestId('password-peekers')).toHaveAttribute(
    'data-roster',
    'messi-ronaldo-neymar-mbappe-haaland'
  )
  expect(screen.getByTestId('password-peekers')).toHaveAttribute(
    'data-asset-style',
    'raster-illustration'
  )
  expect(screen.getByTestId('password-peekers')).toHaveAttribute(
    'data-composition-mode',
    'same-frame-head-gaze'
  )
  expect(screen.getByTestId('football-star-art-play')).toHaveAttribute(
    'src',
    expect.stringContaining('.webp')
  )
  expect(screen.getByTestId('football-star-art-watch')).toHaveAttribute(
    'src',
    expect.stringContaining('.webp')
  )
})

it('football players look at the input when a field is hovered or focused', async () => {
  const user = userEvent.setup()
  wrap()

  const usernameInput = screen.getByPlaceholderText(/用户名/i)
  const passwordInput = screen.getByPlaceholderText(/密码/i)
  const players = screen.getByTestId('password-peekers')

  expect(players).toHaveAttribute('data-player-state', 'playing')
  await user.hover(usernameInput)
  expect(players).toHaveAttribute('data-player-state', 'watch-input')
  await user.unhover(usernameInput)
  expect(players).toHaveAttribute('data-player-state', 'playing')
  await user.click(passwordInput)
  expect(players).toHaveAttribute('data-player-state', 'watch-input')

  await user.type(passwordInput, 'secret')
  expect(players).toHaveAttribute('data-password-length', '6')
})

it('toggles password visibility without changing the football attention model', async () => {
  const user = userEvent.setup()
  wrap()

  const passwordInput = screen.getByPlaceholderText(/密码/i)
  const toggle = screen.getByRole('button', { name: '显示密码' })

  expect(passwordInput).toHaveAttribute('type', 'password')
  await user.click(passwordInput)
  await user.click(toggle)

  expect(passwordInput).toHaveAttribute('type', 'text')
  expect(screen.getByTestId('password-peekers')).toHaveAttribute('data-player-state', 'watch-input')
  expect(screen.getByRole('button', { name: '隐藏密码' })).toBeTruthy()
})

it('shows ACCESS DENIED on failed login', async () => {
  const login = vi.fn().mockRejectedValue(new Error('INVALID_CREDENTIALS'))
  useAuthStore.mockImplementation((selector) => selector({ login, user: null, isLoading: false }))
  wrap()
  await userEvent.type(screen.getByPlaceholderText(/用户名/i), 'admin')
  await userEvent.type(screen.getByPlaceholderText(/密码/i), 'wrongpassword')
  await userEvent.click(screen.getByRole('button', { name: /login|kick off/i }))
  await waitFor(() => expect(screen.getByText(/ACCESS DENIED/i)).toBeTruthy())
})

it('shows a backend connection message when the API is unavailable', async () => {
  const login = vi.fn().mockRejectedValue(new Error('BACKEND_UNAVAILABLE'))
  useAuthStore.mockImplementation((selector) => selector({ login, user: null, isLoading: false }))
  wrap()
  await userEvent.type(screen.getByPlaceholderText(/用户名/i), 'admin')
  await userEvent.type(screen.getByPlaceholderText(/密码/i), 'changeme123')
  await userEvent.click(screen.getByRole('button', { name: /login|kick off/i }))
  await waitFor(() => expect(screen.getByText(/后端服务未连接/)).toBeTruthy())
})

it('navigates to / after successful login', async () => {
  const login = vi.fn().mockResolvedValue(undefined)
  useAuthStore.mockImplementation((selector) => selector({ login, user: null, isLoading: false }))
  wrap()
  await userEvent.type(screen.getByPlaceholderText(/用户名/i), 'admin')
  await userEvent.type(screen.getByPlaceholderText(/密码/i), 'password123')
  await userEvent.click(screen.getByRole('button', { name: /login|kick off/i }))
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }))
})
