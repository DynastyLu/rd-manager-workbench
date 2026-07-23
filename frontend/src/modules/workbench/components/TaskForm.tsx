import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, DatePicker, Input, InputNumber, Select } from '@douyinfe/semi-ui'
import { toast } from 'sonner'

import { createTask, updateTask, type CreateTaskInput } from '@/modules/workbench/api/tasks'
import type { TaskPriority, TaskStatus, WorkTask } from '@/modules/workbench/types'

import { PRIORITY_OPTIONS, STATUS_OPTIONS } from './task-form-options'

interface TaskFormProps {
  onSuccess?: (task: WorkTask) => void
  projectId?: string
  formId?: string
  showActions?: boolean
  task?: WorkTask
}

export function TaskForm({
  onSuccess,
  projectId,
  formId = 'task-form',
  showActions = true,
  task,
}: TaskFormProps) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(task?.title ?? '')
  const [dueAt, setDueAt] = useState(task?.dueAt?.slice(0, 10) ?? '')
  const [priority, setPriority] = useState<TaskPriority | undefined>(task?.priority)
  const [status, setStatus] = useState<TaskStatus | undefined>(task?.status)
  const [completionPercent, setCompletionPercent] = useState(task?.completionPercent ?? 0)
  const [validationMessage, setValidationMessage] = useState('')

  const mutation = useMutation({
    mutationFn: (input: CreateTaskInput) => task ? updateTask(task.id, input) : createTask(input),
    onSuccess: async (task) => {
      const invalidations = [
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['my-work'] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]
      if (projectId) {
        invalidations.push(queryClient.invalidateQueries({ queryKey: ['project', projectId] }))
      }
      await Promise.all(invalidations)
      toast.success(task ? '工作项已更新' : '任务已创建')
      onSuccess?.(task)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '保存任务失败，请重试。')
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedTitle = title.trim()

    if (!trimmedTitle) {
      setValidationMessage('请填写任务名称。')
      return
    }

    setValidationMessage('')
    mutation.mutate({
      title: trimmedTitle,
      ...(projectId ? { projectId } : {}),
      ...(dueAt ? { dueAt } : {}),
      ...(priority ? { priority } : {}),
      ...(status ? { status } : {}),
      completionPercent,
    })
  }

  return (
    <form id={formId} className="workspace-modal-form" onSubmit={handleSubmit} noValidate>
      <label htmlFor="task-title">
        <span>任务名称</span>
        <Input
          id="task-title"
          value={title}
          onChange={setTitle}
          disabled={mutation.isPending}
          autoComplete="off"
          placeholder="输入需要完成的事项"
        />
      </label>
      <div className="workspace-modal-form__field" role="group" aria-labelledby="task-due-at-label">
        <span id="task-due-at-label">截止日期（可选）</span>
        <DatePicker
          aria-labelledby="task-due-at-label"
          type="date"
          format="yyyy-MM-dd"
          value={dueAt}
          onChange={(_, value) => setDueAt(String(value ?? ''))}
          disabled={mutation.isPending}
          placeholder="选择截止日期"
          style={{ width: '100%' }}
          showClear
        />
      </div>
      <div className="workspace-modal-form__grid">
        <div
          className="workspace-modal-form__field"
          role="group"
          aria-labelledby="task-priority-label"
        >
          <span id="task-priority-label">优先级（可选）</span>
          <Select
            id="task-priority"
            aria-labelledby="task-priority-label"
            value={priority ?? 'UNSET'}
            onChange={(value) => setPriority(value === 'UNSET' ? undefined : (value as TaskPriority))}
            disabled={mutation.isPending}
            optionList={[{ value: 'UNSET', label: '不指定' }, ...PRIORITY_OPTIONS]}
            style={{ width: '100%' }}
          />
        </div>
        <div
          className="workspace-modal-form__field"
          role="group"
          aria-labelledby="task-status-label"
        >
          <span id="task-status-label">状态（可选）</span>
          <Select
            id="task-status"
            aria-labelledby="task-status-label"
            value={status ?? 'UNSET'}
            onChange={(value) => setStatus(value === 'UNSET' ? undefined : (value as TaskStatus))}
            disabled={mutation.isPending}
            optionList={[{ value: 'UNSET', label: '不指定' }, ...STATUS_OPTIONS]}
            style={{ width: '100%' }}
          />
        </div>
      </div>
      <div className="workspace-modal-form__field" role="group" aria-labelledby="task-progress-label">
        <span id="task-progress-label">完成进度</span>
        <InputNumber
          aria-labelledby="task-progress-label"
          value={completionPercent}
          min={0}
          max={100}
          suffix="%"
          onNumberChange={(value) => setCompletionPercent(Number(value ?? 0))}
          disabled={mutation.isPending}
          style={{ width: '100%' }}
        />
      </div>
      {validationMessage ? (
        <p className="workspace-modal-form__error" role="alert">
          {validationMessage}
        </p>
      ) : null}
      {showActions ? (
        <div className="workspace-modal-form__actions">
          <Button htmlType="submit" theme="solid" type="primary" loading={mutation.isPending}>
            {task ? '保存修改' : '保存任务'}
          </Button>
        </div>
      ) : null}
    </form>
  )
}
