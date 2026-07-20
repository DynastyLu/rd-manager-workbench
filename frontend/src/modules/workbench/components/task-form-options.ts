import type { TaskPriority, TaskStatus } from '@/modules/workbench/types'

export const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
  { value: 'LOW', label: '低' },
  { value: 'MEDIUM', label: '中' },
  { value: 'HIGH', label: '高' },
  { value: 'CRITICAL', label: '紧急' },
]

export const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'TODO', label: '待开始' },
  { value: 'IN_PROGRESS', label: '进行中' },
  { value: 'BLOCKED', label: '受阻' },
  { value: 'DONE', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
]
