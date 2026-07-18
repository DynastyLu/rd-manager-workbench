import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NotificationCenter } from '../NotificationCenter'
import type { WorkbenchNotification } from '@/modules/workbench/api/notifications'

const {
  listNotifications,
  markNotificationRead,
  dismissNotification,
  snoozeNotification,
  subscribeToNotifications,
} = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  dismissNotification: vi.fn(),
  snoozeNotification: vi.fn(),
  subscribeToNotifications: vi.fn(),
}))

vi.mock('@/modules/workbench/api/notifications', () => ({
  listNotifications,
  markNotificationRead,
  dismissNotification,
  snoozeNotification,
}))

vi.mock('@/modules/workbench/realtime/notificationSocket', () => ({
  subscribeToNotifications,
}))

function renderCenter(
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <NotificationCenter />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

const notification: WorkbenchNotification = {
  id: 'notification-1',
  reminderRuleId: 'rule-1',
  title: '项目评审即将开始',
  body: '评审将在 10 分钟后开始。',
  status: 'UNREAD',
  sourceType: 'TASK',
  sourceId: 'task-1',
  sourcePath: '/my-work',
  scheduledFor: '2026-07-20T01:20:00.000Z',
  triggeredAt: '2026-07-20T01:20:00.000Z',
  readAt: null,
  dismissedAt: null,
  snoozedUntil: null,
  createdAt: '2026-07-20T01:20:00.000Z',
  updatedAt: '2026-07-20T01:20:00.000Z',
}

describe('NotificationCenter', () => {
  let socketHandlers: {
    onReconnect: () => void
    onNotification: (notification: WorkbenchNotification) => void
  } | undefined

  beforeEach(() => {
    listNotifications.mockReset()
    markNotificationRead.mockReset()
    dismissNotification.mockReset()
    snoozeNotification.mockReset()
    subscribeToNotifications.mockReset()
    socketHandlers = undefined
    subscribeToNotifications.mockImplementation((handlers) => {
      socketHandlers = handlers
      return vi.fn()
    })
  })

  it('shows the real unread count and supports linked read and dismiss actions', async () => {
    listNotifications.mockResolvedValue({
      data: [notification, { ...notification, id: 'notification-2', title: '明天面试' }],
      meta: { page: 1, pageSize: 20, total: 2 },
    })
    markNotificationRead.mockResolvedValue({ ...notification, status: 'READ' })
    dismissNotification.mockResolvedValue(undefined)
    const user = userEvent.setup()

    renderCenter()

    expect(await screen.findByText('2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '通知中心' }))
    expect(await screen.findByText('项目评审即将开始')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '打开关联事项：项目评审即将开始' })).toHaveAttribute(
      'href',
      '/my-work',
    )

    await user.click(screen.getByRole('button', { name: '标记已读：项目评审即将开始' }))
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('notification-1'))

    await user.click(screen.getByRole('button', { name: '关闭通知：明天面试' }))
    await waitFor(() => expect(dismissNotification).toHaveBeenCalledWith('notification-2'))
  })

  it('shows retryable error and truthful empty states', async () => {
    listNotifications.mockRejectedValueOnce(new Error('离线'))
    const user = userEvent.setup()

    renderCenter()
    await user.click(screen.getByRole('button', { name: '通知中心' }))
    expect(await screen.findByText('无法读取通知')).toBeInTheDocument()

    listNotifications.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    })
    await user.click(screen.getByRole('button', { name: '重试通知' }))
    expect(await screen.findByText('没有未读通知')).toBeInTheDocument()
  })

  it('snoozes a notification until the selected local time', async () => {
    listNotifications.mockResolvedValue({
      data: [notification],
      meta: { page: 1, pageSize: 20, total: 1 },
    })
    snoozeNotification.mockResolvedValue({
      ...notification,
      snoozedUntil: '2026-07-21T01:30:00.000Z',
    })
    const user = userEvent.setup()

    renderCenter()
    await user.click(screen.getByRole('button', { name: '通知中心' }))
    await user.click(await screen.findByRole('button', { name: '稍后提醒：项目评审即将开始' }))
    fireEvent.change(screen.getByLabelText('再次提醒时间'), {
      target: { value: '2026-07-21T09:30' },
    })
    await user.click(screen.getByRole('button', { name: '确认稍后提醒' }))

    await waitFor(() =>
      expect(snoozeNotification).toHaveBeenCalledWith('notification-1', {
        snoozeUntil: new Date('2026-07-21T09:30').toISOString(),
      }),
    )
  })

  it('refetches REST data after reconnect and a pushed notification', async () => {
    listNotifications.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    })

    renderCenter()
    await waitFor(() => expect(listNotifications).toHaveBeenCalledTimes(1))

    await act(async () => socketHandlers?.onReconnect())
    await waitFor(() => expect(listNotifications).toHaveBeenCalledTimes(2))
    await act(async () => socketHandlers?.onNotification(notification))
    await waitFor(() => expect(listNotifications).toHaveBeenCalledTimes(3))
  })
})
