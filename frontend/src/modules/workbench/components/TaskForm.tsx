import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createTask, type CreateTaskInput } from '@/modules/workbench/api/tasks'
import type { TaskPriority, TaskStatus, WorkTask } from '@/modules/workbench/types'

interface TaskFormProps {
  onSuccess?: (task: WorkTask) => void
  projectId?: string
}

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
  { value: 'LOW', label: '低' },
  { value: 'MEDIUM', label: '中' },
  { value: 'HIGH', label: '高' },
  { value: 'CRITICAL', label: '紧急' },
]

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'TODO', label: '待开始' },
  { value: 'IN_PROGRESS', label: '进行中' },
  { value: 'BLOCKED', label: '受阻' },
  { value: 'DONE', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
]

export function TaskForm({ onSuccess, projectId }: TaskFormProps) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [priority, setPriority] = useState<TaskPriority | undefined>()
  const [status, setStatus] = useState<TaskStatus | undefined>()
  const [validationMessage, setValidationMessage] = useState('')

  const mutation = useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(input),
    onSuccess: async (task) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      toast.success('任务已创建')
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
    })
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <div className="grid gap-2">
        <Label htmlFor="task-title">任务名称</Label>
        <Input
          id="task-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={mutation.isPending}
          autoComplete="off"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="task-due-at">截止日期（可选）</Label>
        <Input
          id="task-due-at"
          type="date"
          value={dueAt}
          onChange={(event) => setDueAt(event.target.value)}
          disabled={mutation.isPending}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="task-priority">优先级（可选）</Label>
          <Select
            value={priority ?? 'UNSET'}
            onValueChange={(value) => setPriority(value === 'UNSET' ? undefined : (value as TaskPriority))}
            disabled={mutation.isPending}
          >
            <SelectTrigger id="task-priority" aria-label="优先级（可选）">
              <SelectValue placeholder="不指定" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UNSET">不指定</SelectItem>
              {PRIORITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="task-status">状态（可选）</Label>
          <Select
            value={status ?? 'UNSET'}
            onValueChange={(value) => setStatus(value === 'UNSET' ? undefined : (value as TaskStatus))}
            disabled={mutation.isPending}
          >
            <SelectTrigger id="task-status" aria-label="状态（可选）">
              <SelectValue placeholder="不指定" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UNSET">不指定</SelectItem>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {validationMessage ? (
        <p className="text-sm text-destructive" role="alert">
          {validationMessage}
        </p>
      ) : null}
      <Button type="submit" disabled={mutation.isPending}>
        保存任务
      </Button>
    </form>
  )
}
