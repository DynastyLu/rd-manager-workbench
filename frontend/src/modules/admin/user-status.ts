import type { UserStatus } from './types'

export const STATUS_LABELS: Record<UserStatus, string> = {
  PENDING: '待激活',
  ACTIVE: '正常',
  DISABLED: '已停用',
  LOCKED: '已锁定',
}

export const STATUS_COLORS: Record<UserStatus, 'amber' | 'green' | 'grey' | 'red'> = {
  PENDING: 'amber',
  ACTIVE: 'green',
  DISABLED: 'grey',
  LOCKED: 'red',
}
