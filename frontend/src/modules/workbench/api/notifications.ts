export type NotificationStatus = 'UNREAD' | 'READ' | 'DISMISSED' | 'SNOOZED'

export interface WorkbenchNotification {
  id: string
  reminderRuleId: string
  title: string
  body: string
  status: NotificationStatus
  sourceType: string
  sourceId: string
  sourcePath: string
  scheduledFor: string
  triggeredAt: string
  readAt: string | null
  dismissedAt: string | null
  snoozedUntil: string | null
  createdAt: string
  updatedAt: string
}

export interface ListNotificationsParams {
  status?: NotificationStatus
  page?: number
  pageSize?: number
}

export interface ListNotificationsResult {
  data: WorkbenchNotification[]
  meta: { page: number; pageSize: number; total: number }
}

export interface SnoozeNotificationInput {
  snoozeUntil: string
}

function toQueryString(params: ListNotificationsParams): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) searchParams.set(key, String(value))
  }
  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

export function listNotifications(
  params: ListNotificationsParams = {},
): Promise<ListNotificationsResult> {
  return request<ListNotificationsResult>(`/notifications${toQueryString(params)}`)
}

export function markNotificationRead(id: string): Promise<WorkbenchNotification> {
  return request<WorkbenchNotification>(`/notifications/${encodeURIComponent(id)}/read`, {
    method: 'PUT',
  })
}

export function dismissNotification(id: string): Promise<void> {
  return request<void>(`/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function snoozeNotification(
  id: string,
  input: SnoozeNotificationInput,
): Promise<WorkbenchNotification> {
  return request<WorkbenchNotification>(`/notifications/${encodeURIComponent(id)}/snooze`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}
import { request } from '@/lib/http'
