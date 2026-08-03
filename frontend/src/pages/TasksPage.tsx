import { useMemo, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banner, Button, Dropdown, Empty, Modal, Skeleton, Tag } from '@douyinfe/semi-ui'
import {
  IconAlertTriangle,
  IconBellStroked,
  IconCalendar,
  IconCheckCircleStroked,
  IconClock,
  IconHistory,
  IconInbox,
  IconMore,
  IconPlus,
  IconTick,
} from '@douyinfe/semi-icons'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'

import {
  listMyWork,
  getTask,
  removeTaskLater,
  removeTaskReminder,
  setTaskLater,
  setTaskReminder,
  updateTask,
  type MyWorkView,
} from '@/modules/workbench/api/tasks'
import { TaskForm } from '@/modules/workbench/components/TaskForm'
import type { TaskPriority, WorkTask } from '@/modules/workbench/types'
import { ROUTES } from '@/constants/routes'
import { DateTimePickerField } from '@/components/FormControls/DateTimePickerField'
import { useWorkspaceSearchParams } from '@/hooks/useWorkspaceSearchParams'
import './TasksPage.less'

const VIEW_OPTIONS: Array<{
  value: MyWorkView
  label: string
  description: string
  empty: string
  icon: typeof IconInbox
}> = [
  {
    value: 'INBOX',
    label: '收件箱',
    description: '集中处理还未归档到时间计划的任务。',
    empty: '收件箱里没有待处理任务',
    icon: IconInbox,
  },
  {
    value: 'TODAY',
    label: '今日',
    description: '只看今天需要完成的工作。',
    empty: '今天没有到期任务',
    icon: IconCalendar,
  },
  {
    value: 'WEEK',
    label: '本周',
    description: '提前安排本周截止的工作。',
    empty: '本周没有到期任务',
    icon: IconClock,
  },
  {
    value: 'OVERDUE',
    label: '逾期',
    description: '优先处理已经超过截止时间的事项。',
    empty: '没有逾期任务',
    icon: IconAlertTriangle,
  },
  {
    value: 'LATER',
    label: '稍后处理',
    description: '暂时隐藏，等恢复日期再进入执行视图。',
    empty: '没有稍后处理的任务',
    icon: IconHistory,
  },
  {
    value: 'COMPLETED',
    label: '已完成',
    description: '回顾近期已经完成的任务。',
    empty: '还没有已完成任务',
    icon: IconCheckCircleStroked,
  },
]

const PRIORITY_META: Record<TaskPriority, { label: string; color: 'grey' | 'blue' | 'amber' | 'red' }> = {
  LOW: { label: '低', color: 'grey' },
  MEDIUM: { label: '中', color: 'blue' },
  HIGH: { label: '高', color: 'amber' },
  CRITICAL: { label: '紧急', color: 'red' },
}

type ScheduleKind = 'later' | 'reminder' | 'due'

interface ScheduleDialogState {
  kind: ScheduleKind
  task: WorkTask
}

type TaskAction =
  | { type: 'status'; taskId: string; status: 'DONE' | 'CANCELLED' }
  | { type: 'later'; taskId: string; deferredUntil: string }
  | { type: 'restore'; taskId: string }
  | { type: 'reminder'; taskId: string; remindAt: string }
  | { type: 'clear-reminder'; taskId: string }
  | { type: 'due'; taskId: string; dueAt: string }

function formatDate(value: string | null | undefined, includeTime = false): string {
  if (!value) return '未设置'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '日期无效'
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}

function getActionMessage(action: TaskAction): string {
  switch (action.type) {
    case 'status':
      return action.status === 'DONE' ? '任务已完成' : '任务已取消'
    case 'later':
      return '任务已移到稍后处理'
    case 'restore':
      return '任务已恢复'
    case 'reminder':
      return '提醒已设置'
    case 'clear-reminder':
      return '提醒已清除'
    case 'due':
      return '截止日期已更新'
  }
}

function TaskRow({
  task,
  isUpdating,
  onAction,
  onOpenSchedule,
  onRequestCancel,
}: {
  task: WorkTask
  isUpdating: boolean
  onAction: (action: TaskAction) => void
  onOpenSchedule: (kind: ScheduleKind, task: WorkTask) => void
  onRequestCancel: (task: WorkTask) => void
}) {
  const priority = PRIORITY_META[task.priority]
  const isTerminal = task.status === 'DONE' || task.status === 'CANCELLED'

  return (
    <article className="my-work-task" aria-label={`任务：${task.title}`}>
      <Button
        className="my-work-task__complete"
        theme="borderless"
        icon={<IconTick />}
        aria-label={`完成任务：${task.title}`}
        disabled={isUpdating || isTerminal}
        onClick={() => onAction({ type: 'status', taskId: task.id, status: 'DONE' })}
      />

      <div className="my-work-task__body">
        <div className="my-work-task__title-line">
          <strong>{task.title}</strong>
          <Tag color={priority.color} size="small">
            {priority.label}
          </Tag>
        </div>
        <div className="my-work-task__meta">
          <span className={task.dueAt ? 'my-work-task__due' : undefined}>
            <IconCalendar size="small" /> 截止 {formatDate(task.dueAt)}
          </span>
          {task.assigneeName ? <span>负责人 {task.assigneeName}</span> : null}
          {task.reminder ? (
            <span className="my-work-task__reminder">
              <IconBellStroked size="small" /> {formatDate(task.reminder.remindAt, true)}提醒
            </span>
          ) : null}
          {task.later ? <span>恢复 {formatDate(task.later.deferredUntil)}</span> : null}
          {task.projectId ? (
            <Link to={ROUTES.projectWorkspace(task.projectId)}>打开项目</Link>
          ) : null}
        </div>
      </div>

      {!isTerminal ? <div className="my-work-task__actions">
        {task.later ? (
          <Button
            theme="borderless"
            aria-label={`恢复任务：${task.title}`}
            disabled={isUpdating}
            onClick={() => onAction({ type: 'restore', taskId: task.id })}
          >
            恢复
          </Button>
        ) : (
          <Button
            theme="borderless"
            aria-label={`稍后处理：${task.title}`}
            disabled={isUpdating}
            onClick={() => onOpenSchedule('later', task)}
          >
            稍后
          </Button>
        )}
        <Button
          theme="borderless"
          icon={<IconBellStroked />}
          aria-label={`${task.reminder ? '清除' : '设置'}提醒：${task.title}`}
          disabled={isUpdating}
          onClick={() =>
            task.reminder
              ? onAction({ type: 'clear-reminder', taskId: task.id })
              : onOpenSchedule('reminder', task)
          }
        />
        <Dropdown
          trigger="click"
          position="bottomRight"
          render={
            <Dropdown.Menu>
              <Dropdown.Item onClick={() => onOpenSchedule('due', task)}>
                延期 / 修改截止日期
              </Dropdown.Item>
              <Dropdown.Item
                type="danger"
                onClick={() => onRequestCancel(task)}
              >
                取消任务
              </Dropdown.Item>
            </Dropdown.Menu>
          }
        >
          <Button
            theme="borderless"
            icon={<IconMore />}
            aria-label={`更多操作：${task.title}`}
            disabled={isUpdating}
          />
        </Dropdown>
      </div> : null}
    </article>
  )
}

export default function TasksPage() {
  const queryClient = useQueryClient()
  const query = useWorkspaceSearchParams()
  const { searchParams } = query
  const projectId = searchParams.get('projectId')?.trim() || undefined
  const taskId = searchParams.get('taskId')?.trim() || undefined
  const activeView = query.getEnum(
    'view',
    VIEW_OPTIONS.map((option) => option.value),
    'INBOX',
  )
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [scheduleDialog, setScheduleDialog] = useState<ScheduleDialogState | null>(null)
  const [scheduleValue, setScheduleValue] = useState('')
  const [cancelTask, setCancelTask] = useState<WorkTask | null>(null)

  const viewQueries = useQueries({
    queries: VIEW_OPTIONS.map(({ value }) => ({
      queryKey: ['my-work', value, { projectId }],
      queryFn: () => listMyWork({ view: value, projectId }),
    })),
  })
  const focusedTaskQuery = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => getTask(taskId!),
    enabled: Boolean(taskId),
  })

  const queryByView = useMemo(
    () =>
      Object.fromEntries(
        VIEW_OPTIONS.map(({ value }, index) => [value, viewQueries[index]]),
      ) as Record<MyWorkView, (typeof viewQueries)[number]>,
    [viewQueries],
  )
  const activeQuery = queryByView[activeView]
  const activeOption =
    VIEW_OPTIONS.find(({ value }) => value === activeView) ?? VIEW_OPTIONS[0]!

  async function refreshTaskViews() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['my-work'] }),
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['project'] }),
    ])
  }

  const actionMutation = useMutation<unknown, Error, TaskAction>({
    mutationFn: async (action: TaskAction): Promise<unknown> => {
      switch (action.type) {
        case 'status':
          return await updateTask(action.taskId, { status: action.status })
        case 'later':
          return await setTaskLater(action.taskId, { deferredUntil: action.deferredUntil })
        case 'restore':
          return await removeTaskLater(action.taskId)
        case 'reminder':
          return await setTaskReminder(action.taskId, { remindAt: action.remindAt })
        case 'clear-reminder':
          return await removeTaskReminder(action.taskId)
        case 'due':
          return await updateTask(action.taskId, { dueAt: action.dueAt })
      }
    },
    onSuccess: async (_result, action) => {
      await refreshTaskViews()
      toast.success(getActionMessage(action))
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '任务操作失败，请重试。')
    },
  })

  function openSchedule(kind: ScheduleKind, task: WorkTask) {
    setScheduleDialog({ kind, task })
    setScheduleValue('')
  }

  function closeSchedule() {
    setScheduleDialog(null)
    setScheduleValue('')
  }

  function submitSchedule() {
    if (!scheduleDialog || !scheduleValue) return
    const { kind, task } = scheduleDialog

    if (kind === 'later') {
      actionMutation.mutate({
        type: 'later',
        taskId: task.id,
        deferredUntil: `${scheduleValue}T00:00:00+08:00`,
      })
    } else if (kind === 'reminder') {
      actionMutation.mutate({
        type: 'reminder',
        taskId: task.id,
        remindAt: new Date(scheduleValue).toISOString(),
      })
    } else {
      actionMutation.mutate({ type: 'due', taskId: task.id, dueAt: scheduleValue })
    }
    closeSchedule()
  }

  const scheduleFieldLabel =
    scheduleDialog?.kind === 'later'
      ? '恢复日期'
      : scheduleDialog?.kind === 'reminder'
        ? '提醒时间'
        : '新的截止日期'

  return (
    <div className="my-work-page workspace-page">
      <div className="my-work-page__inner workspace-page__inner">
      <div className="workspace-module-toolbar">
        <div className="workspace-module-toolbar__actions">
        <Button
          theme="solid"
          type="primary"
          icon={<IconPlus />}
          aria-label="新建任务"
          onClick={() => setIsCreateOpen(true)}
        >
          新建任务
        </Button>
        </div>
      </div>

      {projectId ? <div className="my-work-page__context">当前仅显示本项目任务</div> : null}

      {focusedTaskQuery.data ? (
        <section className="my-work-page__focused" aria-label="当前定位任务">
          <span>当前定位</span>
          <TaskRow
            task={focusedTaskQuery.data}
            isUpdating={actionMutation.isPending}
            onAction={(action) => actionMutation.mutate(action)}
            onOpenSchedule={openSchedule}
            onRequestCancel={setCancelTask}
          />
        </section>
      ) : null}

      <div className="my-work-page__workspace workspace-card">
        <nav className="my-work-page__views" aria-label="我的工作视图">
          <span className="my-work-page__views-label">个人任务</span>
          {VIEW_OPTIONS.map(({ value, label, icon: ViewIcon }) => {
            const count = queryByView[value].data?.meta.total
            return (
              <button
                key={value}
                type="button"
                className={activeView === value ? 'is-active' : undefined}
                aria-current={activeView === value ? 'page' : undefined}
                onClick={() => query.update({ view: value }, { defaults: { view: 'INBOX' } })}
              >
                <ViewIcon size="small" />
                <span>{label}</span>
                <b aria-label={count === undefined ? '加载中' : `${count} 条`}>{count ?? '—'}</b>
              </button>
            )
          })}
        </nav>

        <section className="my-work-page__content" aria-labelledby="my-work-view-title">
          <div className="my-work-page__content-header">
            <div>
              <h2 id="my-work-view-title">{activeOption.label}</h2>
              <p>{activeOption.description}</p>
            </div>
            <span>{activeQuery.data ? activeQuery.data.meta.total : '—'} 项</span>
          </div>

          {activeQuery.isPending ? (
            <div className="my-work-page__loading" aria-label="正在加载我的工作" aria-busy="true">
              {[0, 1, 2].map((item) => (
                <Skeleton key={item} placeholder={<Skeleton.Title style={{ width: '100%' }} />} loading />
              ))}
            </div>
          ) : null}

          {activeQuery.isError ? (
            <div className="my-work-page__error">
              <Banner
                type="danger"
                fullMode={false}
                title="无法读取我的工作"
                description="请确认本地后端和 PostgreSQL 已启动后重试。"
                closeIcon={null}
              />
              <Button theme="solid" type="danger" onClick={() => void activeQuery.refetch()}>
                重试
              </Button>
            </div>
          ) : null}

          {activeQuery.data && activeQuery.data.data.length === 0 ? (
            <Empty
              className="my-work-page__empty"
              title={activeOption.empty}
              description="你可以新建任务，或切换到其他视图继续处理。"
            />
          ) : null}

          {activeQuery.data?.data.length ? (
            <div className="my-work-page__list">
              {activeQuery.data.data.map((item) => (
                <TaskRow
                  key={item.id}
                  task={item}
                  isUpdating={actionMutation.isPending}
                  onAction={(action) => actionMutation.mutate(action)}
                  onOpenSchedule={openSchedule}
                  onRequestCancel={setCancelTask}
                />
              ))}
            </div>
          ) : null}
        </section>
      </div>

      <Modal
        title="新建任务"
        visible={isCreateOpen}
        onCancel={() => setIsCreateOpen(false)}
        footer={null}
        width={520}
        closeOnEsc
      >
        <TaskForm projectId={projectId} onSuccess={() => setIsCreateOpen(false)} />
      </Modal>

      <Modal
        title={
          scheduleDialog?.kind === 'later'
            ? '稍后处理'
            : scheduleDialog?.kind === 'reminder'
              ? '设置提醒'
              : '修改截止日期'
        }
        visible={scheduleDialog !== null}
        onCancel={closeSchedule}
        onOk={submitSchedule}
        okButtonProps={{
          disabled: !scheduleValue,
          'aria-label':
            scheduleDialog?.kind === 'later'
              ? '确认稍后处理'
              : scheduleDialog?.kind === 'reminder'
                ? '保存提醒'
                : '保存截止日期',
        }}
        okText="保存"
        cancelText="取消"
        closeOnEsc
      >
        <div className="my-work-page__schedule-form">
          <p>
            {scheduleDialog?.kind === 'later'
              ? '恢复日期前，这项任务不会出现在今日和本周视图。'
              : scheduleDialog?.kind === 'reminder'
                ? '提醒会按本机时间触发，并保存在任务记录中。'
                : '设置任务新的截止日期。'}
          </p>
          <label htmlFor="task-schedule-value">
            <span>{scheduleFieldLabel}</span>
            <DateTimePickerField
              id="task-schedule-value"
              aria-label={scheduleFieldLabel}
              mode={scheduleDialog?.kind === 'reminder' ? 'dateTime' : 'date'}
              value={scheduleValue}
              onChange={setScheduleValue}
            />
          </label>
        </div>
      </Modal>

      <Modal
        title="确认取消任务"
        visible={cancelTask !== null}
        okText="确认取消"
        cancelText="返回"
        okButtonProps={{ type: 'danger' }}
        onCancel={() => setCancelTask(null)}
        onOk={() => {
          if (!cancelTask) return
          actionMutation.mutate({ type: 'status', taskId: cancelTask.id, status: 'CANCELLED' })
          setCancelTask(null)
        }}
      >
        <p>取消后任务将退出当前执行视图。历史记录仍会保留。</p>
      </Modal>
      </div>
    </div>
  )
}
