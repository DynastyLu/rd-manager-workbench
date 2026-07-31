import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { ApiError } from '@/lib/http'
import * as api from '../../api'
import LoginPage from '../LoginPage'

vi.mock('../../api')

describe('LoginPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders login form', () => {
    render(<LoginPage />, { wrapper: MemoryRouter })
    expect(screen.getByPlaceholderText('请输入账号或员工工号')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('请输入密码')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /登录/i })).toBeInTheDocument()
  })

  it('shows loading while submitting', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'login').mockImplementation(
      () => new Promise(() => {})
    )

    render(<LoginPage />, { wrapper: MemoryRouter })
    await user.type(screen.getByPlaceholderText('请输入账号或员工工号'), 'admin')
    await user.type(screen.getByPlaceholderText('请输入密码'), 'password')
    await user.click(screen.getByRole('button', { name: /登录/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /登录/i })).toBeDisabled()
    })
  })

  it('shows error on failed login', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'login').mockRejectedValue(
      new ApiError('invalid credentials', 401, 'AUTH_INVALID_CREDENTIALS')
    )

    render(<LoginPage />, { wrapper: MemoryRouter })
    await user.type(screen.getByPlaceholderText('请输入账号或员工工号'), 'admin')
    await user.type(screen.getByPlaceholderText('请输入密码'), 'wrong')
    await user.click(screen.getByRole('button', { name: /登录/i }))

    await waitFor(() => {
      expect(screen.getByText('账号或密码错误，请重新输入。')).toBeInTheDocument()
    })
  })
})
