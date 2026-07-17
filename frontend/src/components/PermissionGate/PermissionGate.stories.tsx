import type { Meta, StoryObj } from '@storybook/react'
import { PermissionGate } from './PermissionGate'
import { useAuthStore } from '@/stores/auth'
import type { UserInfo } from '@/types/user'

const meta: Meta<typeof PermissionGate> = {
  title: 'Components/PermissionGate',
  component: PermissionGate,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof PermissionGate>

const adminUser: UserInfo = { id: 'u1', username: 'admin', role: 'admin' }
const normalUser: UserInfo = { id: 'u2', username: 'user', role: 'user' }

export const AdminAuthorized: Story = {
  args: {
    permission: 'ocr:upload',
    children: (
      <div style={{ padding: 16, background: '#1a1a2e', color: '#00fff0' }}>
        Protected content (visible)
      </div>
    ),
  },
  decorators: [
    (Story) => {
      useAuthStore.setState({ user: adminUser, accessToken: 'tok', isLoading: false })
      return <Story />
    },
  ],
}

export const UserUnauthorized: Story = {
  args: {
    permission: 'admin:users',
    children: <div>Protected content</div>,
    fallback: <div style={{ padding: 16, color: '#ff0055' }}>No permission</div>,
  },
  decorators: [
    (Story) => {
      useAuthStore.setState({ user: normalUser, accessToken: 'tok', isLoading: false })
      return <Story />
    },
  ],
}
