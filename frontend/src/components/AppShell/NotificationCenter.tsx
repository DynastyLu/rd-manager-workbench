import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Modal, Popover, Skeleton } from '@douyinfe/semi-ui'
import { IconBellStroked, IconChevronRight } from '@douyinfe/semi-icons'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import {
  dismissNotification,
  listNotifications,
  markNotificationRead,
  snoozeNotification,
  type WorkbenchNotification,
} from '@/modules/workbench/api/notifications'
import { subscribeToNotifications } from '@/modules/workbench/realtime/notificationSocket'
import './NotificationCenter.less'

type NotificationAction =
  | { type: 'read'; id: string }
  | { type: 'dismiss'; id: string }
  | { type: 'snooze'; id: string; snoozeUntil: string }

function formatNotificationTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间无效'
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function NotificationListItem({
  notification,
  isUpdating,
  onAction,
  onSnooze,
}: {
  notification: WorkbenchNotification
  isUpdating: boolean
  onAction: (action: NotificationAction) => void
  onSnooze: (notification: WorkbenchNotification) => void
}) {
  return (
    <article className="notification-center__item" aria-label={`通知：${notification.title}`}>
      <span className="notification-center__unread-mark" aria-hidden="true" />
      <div className="notification-center__item-content">
        <strong>{notification.title}</strong>
        <p>{notification.body}</p>
        <time dateTime={notification.triggeredAt}>
          {formatNotificationTime(notification.triggeredAt)}
        </time>
        <div className="notification-center__item-actions">
          <Button
            size="small"
            theme="borderless"
            aria-label={`标记已读：${notification.title}`}
            disabled={isUpdating}
            onClick={() => onAction({ type: 'read', id: notification.id })}
          >
            已读
          </Button>
          <Button
            size="small"
            theme="borderless"
            aria-label={`稍后提醒：${notification.title}`}
            disabled={isUpdating}
            onClick={() => onSnooze(notification)}
          >
            稍后提醒
          </Button>
          <Button
            size="small"
            theme="borderless"
            type="tertiary"
            aria-label={`关闭通知：${notification.title}`}
            disabled={isUpdating}
            onClick={() => onAction({ type: 'dismiss', id: notification.id })}
          >
            关闭
          </Button>
        </div>
      </div>
      {notification.sourcePath ? (
        <Link
          className="notification-center__source-link"
          to={notification.sourcePath}
          aria-label={`打开关联事项：${notification.title}`}
        >
          <IconChevronRight />
        </Link>
      ) : null}
    </article>
  )
}

export function NotificationCenter() {
  const queryClient = useQueryClient()
  const [snoozeTarget, setSnoozeTarget] = useState<WorkbenchNotification | null>(null)
  const [snoozeUntil, setSnoozeUntil] = useState('')
  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'UNREAD'],
    queryFn: () => listNotifications({ status: 'UNREAD', page: 1, pageSize: 20 }),
  })

  useEffect(
    () =>
      subscribeToNotifications({
        onReconnect: () => {
          void queryClient.invalidateQueries({ queryKey: ['notifications'] })
        },
        onNotification: (notification) => {
          toast.info(notification.title, { description: notification.body })
          void queryClient.invalidateQueries({ queryKey: ['notifications'] })
        },
      }),
    [queryClient],
  )

  const actionMutation = useMutation<unknown, Error, NotificationAction>({
    mutationFn: async (action): Promise<unknown> => {
      if (action.type === 'read') return await markNotificationRead(action.id)
      if (action.type === 'dismiss') return await dismissNotification(action.id)
      return await snoozeNotification(action.id, { snoozeUntil: action.snoozeUntil })
    },
    onSuccess: async (_result, action) => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success(
        action.type === 'read'
          ? '已标记为已读'
          : action.type === 'dismiss'
            ? '通知已关闭'
            : '已设置稍后提醒',
      )
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '通知操作失败，请重试。')
    },
  })

  function openSnooze(notification: WorkbenchNotification) {
    setSnoozeTarget(notification)
    setSnoozeUntil('')
  }

  function closeSnooze() {
    setSnoozeTarget(null)
    setSnoozeUntil('')
  }

  function submitSnooze() {
    if (!snoozeTarget || !snoozeUntil) return
    actionMutation.mutate({
      type: 'snooze',
      id: snoozeTarget.id,
      snoozeUntil: new Date(snoozeUntil).toISOString(),
    })
    closeSnooze()
  }

  const unreadCount = notificationsQuery.data?.meta.total
  const content = (
    <div className="notification-center" aria-label="通知中心内容">
      <header className="notification-center__header">
        <strong>通知中心</strong>
        <span>{unreadCount === undefined ? '—' : `${unreadCount} 条未读`}</span>
      </header>

      {notificationsQuery.isPending ? (
        <div className="notification-center__loading" aria-label="正在加载通知" aria-busy="true">
          <Skeleton placeholder={<Skeleton.Title style={{ width: '100%' }} />} loading />
          <Skeleton placeholder={<Skeleton.Title style={{ width: '82%' }} />} loading />
        </div>
      ) : null}

      {notificationsQuery.isError ? (
        <div className="notification-center__state" role="alert">
          <strong>无法读取通知</strong>
          <span>请确认本地服务已启动后重试。</span>
          <Button
            size="small"
            theme="solid"
            type="primary"
            aria-label="重试通知"
            onClick={() => void notificationsQuery.refetch()}
          >
            重试
          </Button>
        </div>
      ) : null}

      {notificationsQuery.data?.data.length === 0 ? (
        <div className="notification-center__state">
          <strong>没有未读通知</strong>
          <span>任务、会议和日程到点后会显示在这里。</span>
        </div>
      ) : null}

      {notificationsQuery.data?.data.length ? (
        <div className="notification-center__list">
          {notificationsQuery.data.data.map((notification) => (
            <NotificationListItem
              key={notification.id}
              notification={notification}
              isUpdating={actionMutation.isPending}
              onAction={(action) => actionMutation.mutate(action)}
              onSnooze={openSnooze}
            />
          ))}
        </div>
      ) : null}
    </div>
  )

  return (
    <>
      <Popover trigger="click" position="bottomRight" content={content}>
        <Badge count={unreadCount ?? 0} overflowCount={99} type="danger">
          <Button
            theme="borderless"
            icon={<IconBellStroked />}
            aria-label="通知中心"
            className="workspace-header__icon-button"
          />
        </Badge>
      </Popover>

      <Modal
        title="稍后提醒"
        visible={snoozeTarget !== null}
        onCancel={closeSnooze}
        onOk={submitSnooze}
        okText="保存"
        cancelText="取消"
        okButtonProps={{ disabled: !snoozeUntil, 'aria-label': '确认稍后提醒' }}
        closeOnEsc
      >
        <div className="notification-center__snooze-form">
          <p>到达新时间后会生成新的有效提醒，当前通知将离开未读列表。</p>
          <label>
            <span>再次提醒时间</span>
            <input
              type="datetime-local"
              value={snoozeUntil}
              onChange={(event) => setSnoozeUntil(event.target.value)}
            />
          </label>
        </div>
      </Modal>
    </>
  )
}
