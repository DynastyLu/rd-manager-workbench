import { request } from '@/lib/http'

import type {
  ListTasksResult,
  TaskPriority,
  TaskStatus,
  WorkTask,
} from '@/modules/workbench/types'

export interface ListTasksParams {
  page?: number
  pageSize?: number
  search?: string
  projectId?: string
  milestoneId?: string
  status?: TaskStatus
  priority?: TaskPriority
}

export interface CreateTaskInput {
  title: string
  projectId?: string
  milestoneId?: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  dueDate?: string
}

export interface UpdateTaskInput {
  title?: string
  projectId?: string | null
  milestoneId?: string | null
  description?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  dueDate?: string | null
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
