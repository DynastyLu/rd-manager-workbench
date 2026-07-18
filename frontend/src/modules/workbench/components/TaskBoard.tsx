import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TaskStatus, WorkTask } from '@/modules/workbench/types'

interface TaskBoardProps {
  tasks: WorkTask[]
  onStatusChange: (taskId: string, status: TaskStatus) => void
  isUpdating: boolean
}

interface BoardColumn {
  status: TaskStatus
  label: string
}

const BOARD_COLUMNS: BoardColumn[] = [
  { status: 'TODO', label: '待开始' },
  { status: 'IN_PROGRESS', label: '进行中' },
  { status: 'BLOCKED', label: '受阻' },
  { status: 'DONE', label: '已完成' },
  { status: 'CANCELLED', label: '已取消' },
]

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'TODO', label: '待开始' },
  { value: 'IN_PROGRESS', label: '进行中' },
  { value: 'BLOCKED', label: '受阻' },
  { value: 'DONE', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
]

const PRIORITY_LABELS = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  CRITICAL: '紧急',
} as const

function getNextStatus(task: WorkTask): { status: TaskStatus; label: string } | null {
  switch (task.status) {
    case 'TODO':
      return { status: 'IN_PROGRESS', label: '开始任务' }
    case 'IN_PROGRESS':
      return { status: 'DONE', label: '完成任务' }
    case 'BLOCKED':
      return { status: 'IN_PROGRESS', label: '恢复任务' }
    case 'DONE':
      return { status: 'TODO', label: '重新打开' }
    default:
      return null
  }
}

function formatDueDate(dueAt: string | null) {
  if (!dueAt) {
    return null
  }

  return dueAt.slice(0, 10)
}

function TaskCard({ task, onStatusChange, isUpdating }: Pick<TaskBoardProps, 'onStatusChange' | 'isUpdating'> & { task: WorkTask }) {
  const nextStatus = getNextStatus(task)

  return (
    <Card className="shadow-none">
      <CardHeader className="gap-2 px-3 pt-3 pb-0">
        <CardTitle className="text-sm leading-5">{task.title}</CardTitle>
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary">优先级：{PRIORITY_LABELS[task.priority]}</Badge>
          {task.assigneeName ? <Badge variant="outline">负责人：{task.assigneeName}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 px-3 pt-3 pb-3 text-sm text-muted-foreground">
        {task.dueAt ? <p>截止：{formatDueDate(task.dueAt)}</p> : null}
        <Select
          value={task.status}
          onValueChange={(status) => onStatusChange(task.id, status as TaskStatus)}
          disabled={isUpdating}
        >
          <SelectTrigger aria-label={`设置任务状态：${task.title}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {nextStatus ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onStatusChange(task.id, nextStatus.status)}
            disabled={isUpdating}
            aria-label={`${nextStatus.label}：${task.title}`}
          >
            {nextStatus.label}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function TaskBoard({ tasks, onStatusChange, isUpdating }: TaskBoardProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-4 2xl:grid-cols-5">
      {BOARD_COLUMNS.map((column) => {
        const columnTasks = tasks.filter((task) => task.status === column.status)

        return (
          <section key={column.status} className="grid content-start gap-3" aria-labelledby={`task-column-${column.status}`}>
            <h2 id={`task-column-${column.status}`} className="text-sm font-semibold tracking-wide text-muted-foreground">
              {column.label}
            </h2>
            {columnTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onStatusChange={onStatusChange}
                isUpdating={isUpdating}
              />
            ))}
            {columnTasks.length === 0 ? <p className="text-sm text-muted-foreground">暂无任务</p> : null}
          </section>
        )
      })}
    </div>
  )
}
