import { request } from '@/lib/http'

import type {
  ListTasksResult,
  TaskLater,
  TaskPriority,
  TaskReminder,
  TaskStatus,
  WorkTask,
} from '@/modules/workbench/types'

export interface ListTasksParams {
  page?: number
  pageSize?: number
  projectId?: string
  status?: TaskStatus
  assigneeName?: string
  dueBefore?: string
  overdue?: boolean
}

export type MyWorkView = 'INBOX' | 'TODAY' | 'WEEK' | 'OVERDUE' | 'LATER' | 'COMPLETED'

export interface ListMyWorkParams {
  view: MyWorkView
  projectId?: string
}

export interface ListMyWorkResult {
  data: WorkTask[]
  meta: { total: number }
}

export interface SetTaskLaterInput {
  deferredUntil: string
}

export interface SetTaskReminderInput {
  remindAt: string
}

export interface CreateTaskInput {
  title: string
  projectId?: string
  milestoneId?: string
  parentId?: string
  dependencyIds?: string[]
  description?: string
  assigneeName?: string
  collaboratorNames?: string[]
  status?: TaskStatus
  priority?: TaskPriority
  dueAt?: string
  sourceType?: string
  sourceId?: string
}

export interface UpdateTaskInput {
  title?: string
  projectId?: string | null
  milestoneId?: string | null
  parentId?: string | null
  dependencyIds?: string[]
  description?: string | null
  assigneeName?: string | null
  collaboratorNames?: string[]
  status?: TaskStatus
  priority?: TaskPriority
  dueAt?: string | null
  sourceType?: string | null
  sourceId?: string | null
}

function toQueryString(params: ListTasksParams): string {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value))
    }
  }

  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

export function listTasks(params: ListTasksParams = {}): Promise<ListTasksResult> {
  return request<ListTasksResult>(`/tasks${toQueryString(params)}`)
}

export function listMyWork(params: ListMyWorkParams): Promise<ListMyWorkResult> {
  return request<ListMyWorkResult>(`/tasks/my-work${toQueryString(params)}`)
}

export function getTask(id: string): Promise<WorkTask> {
  return request<WorkTask>(`/tasks/${encodeURIComponent(id)}`)
}

export function createTask(input: CreateTaskInput): Promise<WorkTask> {
  return request<WorkTask>('/tasks', { method: 'POST', body: JSON.stringify(input) })
}

export function updateTask(id: string, input: UpdateTaskInput): Promise<WorkTask> {
  return request<WorkTask>(`/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function archiveTask(id: string): Promise<void> {
  return request<void>(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function setTaskLater(id: string, input: SetTaskLaterInput): Promise<TaskLater> {
  return request<TaskLater>(`/tasks/${encodeURIComponent(id)}/later`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function removeTaskLater(id: string): Promise<void> {
  return request<void>(`/tasks/${encodeURIComponent(id)}/later`, { method: 'DELETE' })
}

export function setTaskReminder(id: string, input: SetTaskReminderInput): Promise<TaskReminder> {
  return request<TaskReminder>(`/tasks/${encodeURIComponent(id)}/reminder`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function removeTaskReminder(id: string): Promise<void> {
  return request<void>(`/tasks/${encodeURIComponent(id)}/reminder`, { method: 'DELETE' })
}
