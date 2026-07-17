import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PermissionGate } from '../PermissionGate'
import { useAuthStore } from '@/stores/auth'
import type { UserInfo } from '@/types/user'

const adminUser: UserInfo = { id: '1', username: 'admin', role: 'admin' }
const normalUser: UserInfo = { id: '2', username: 'user', role: 'user' }
const guestUser: UserInfo = { id: '3', username: 'guest', role: 'guest' }

function setUser(user: UserInfo | null) {
  useAuthStore.setState({ user, accessToken: user ? 'token' : null })
}

beforeEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, isLoading: false })
})

describe('PermissionGate', () => {
  it('renders children when user has the required permission', () => {
    setUser(normalUser)
    render(
      <PermissionGate permission="ocr:upload">
        <span>Upload area</span>
      </PermissionGate>
    )
    expect(screen.getByText('Upload area')).toBeTruthy()
  })

  it('renders null by default when user lacks permission', () => {
    setUser(guestUser)
    const { container } = render(
      <PermissionGate permission="ocr:upload">
        <span>Upload area</span>
      </PermissionGate>
    )
    expect(screen.queryByText('Upload area')).toBeNull()
    expect(container.firstChild).toBeNull()
  })

  it('renders fallback when user lacks permission and fallback is provided', () => {
    setUser(guestUser)
    render(
      <PermissionGate permission="ocr:upload" fallback={<span>No access</span>}>
        <span>Upload area</span>
      </PermissionGate>
    )
    expect(screen.queryByText('Upload area')).toBeNull()
    expect(screen.getByText('No access')).toBeTruthy()
  })

  it('admin sees everything', () => {
    setUser(adminUser)
    render(
      <PermissionGate permission="admin:users">
        <span>Admin panel</span>
      </PermissionGate>
    )
    expect(screen.getByText('Admin panel')).toBeTruthy()
  })

  it('renders null when no user is logged in', () => {
    setUser(null)
    const { container } = render(
      <PermissionGate permission="ocr:upload">
        <span>Upload area</span>
      </PermissionGate>
    )
    expect(container.firstChild).toBeNull()
  })
})
