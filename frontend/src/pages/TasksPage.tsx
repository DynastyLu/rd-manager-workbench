import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { listTasks, updateTask } from '@/modules/workbench/api/tasks'
import { TaskBoard } from '@/modules/workbench/components/TaskBoard'
import { TaskForm } from '@/modules/workbench/components/TaskForm'
import type { TaskStatus } from '@/modules/workbench/types'

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'TODO', label: '待开始' },
  { value: 'IN_PROGRESS', label: '进行中' },
  { value: 'BLOCKED', label: '受阻' },
  { value: 'DONE', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
]

export default function TasksPage() {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('projectId')?.trim() || undefined
  const [status, setStatus] = useState<TaskStatus | undefined>()
  const [assigneeName, setAssigneeName] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const tasksQuery = useQuery({
    queryKey: ['tasks', { projectId, status, assigneeName }],
    queryFn: () => listTasks({ projectId, status, assigneeName: assigneeName || undefined }),
  })
  const statusMutation = useMutation({
    mutationFn: ({ taskId, nextStatus }: { taskId: string; nextStatus: TaskStatus }) =>
      updateTask(taskId, { status: nextStatus }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      toast.success('任务状态已更新')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '更新任务状态失败，请重试。')
    },
  })

  return (
    <div className="app-page">
      <div className="app-page__inner app-page__inner--wide">
        <div className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">Task Workspace</p>
            <h1 className="app-page__title">任务</h1>
            <p className="app-page__subtitle">按状态推进研发工作，并及时处理受阻事项。</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button disabled={statusMutation.isPending}>新建任务</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新建任务</DialogTitle>
                <DialogDescription>记录一个可追踪的研发行动项。</DialogDescription>
              </DialogHeader>
              <TaskForm projectId={projectId} onSuccess={() => setIsCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        {projectId ? (
          <p className="mb-4 text-sm text-muted-foreground">当前仅显示本项目任务</p>
        ) : null}

        <Card className="mb-4">
          <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
            <Select
              value={status ?? 'ALL'}
              onValueChange={(value) => setStatus(value === 'ALL' ? undefined : (value as TaskStatus))}
            >
              <SelectTrigger aria-label="按状态筛选">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部状态</SelectItem>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              aria-label="按负责人筛选"
              placeholder="按负责人筛选"
              value={assigneeName}
              onChange={(event) => setAssigneeName(event.target.value)}
            />
          </CardContent>
        </Card>

        {tasksQuery.isPending ? (
          <Card aria-busy="true" aria-label="正在加载任务">
            <CardContent className="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-4">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
        ) : null}

        {tasksQuery.isError ? (
          <Card>
            <CardHeader>
              <CardTitle>无法读取任务列表</CardTitle>
              <CardDescription>请确认本地服务已启动后重试。</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => void tasksQuery.refetch()}>重试</Button>
            </CardContent>
          </Card>
        ) : null}

        {tasksQuery.data ? (
          tasksQuery.data.data.length ? (
            <TaskBoard
              tasks={tasksQuery.data.data}
              onStatusChange={(taskId, nextStatus) => statusMutation.mutate({ taskId, nextStatus })}
              isUpdating={statusMutation.isPending}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>还没有任务，先新建一个任务吧。</CardTitle>
              </CardHeader>
            </Card>
          )
        ) : null}
      </div>
    </div>
  )
}
