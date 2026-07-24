import type {
  EmployeeFilters,
  EmployeeImportDetailFilters,
  EmployeeWorkItemFilters,
  ImportFilters,
  ProgressFilters,
} from './types'

function normalizeFilters<T extends object>(filters: T): T {
  const entries = Object.entries(filters).flatMap(([key, value]) => {
    if (typeof value === 'string') {
      const normalized = value.trim()
      return normalized ? [[key, normalized]] : []
    }
    return value === undefined || value === null ? [] : [[key, value]]
  })
  return Object.fromEntries(entries) as T
}

export const employeeQueryKeys = {
  all: ['employees'] as const,
  lists: () => ['employees', 'list'] as const,
  list: (filters: EmployeeFilters) => ['employees', 'list', normalizeFilters(filters)] as const,
  details: () => ['employees', 'detail'] as const,
  detail: (id: string) => ['employees', 'detail', id] as const,
  teamProgress: (filters: ProgressFilters) =>
    ['employees', 'team-progress', normalizeFilters(filters)] as const,
  progress: (id: string, filters: ProgressFilters) =>
    ['employees', 'progress', id, normalizeFilters(filters)] as const,
  projectProgress: (id: string, filters: ProgressFilters) =>
    ['employees', 'project-progress', id, normalizeFilters(filters)] as const,
  workItems: (filters: EmployeeWorkItemFilters) =>
    ['employees', 'work-items', normalizeFilters(filters)] as const,
  workItem: (id: string) => ['employees', 'work-item', id] as const,
  imports: (filters: ImportFilters) => ['employees', 'imports', normalizeFilters(filters)] as const,
  importDetail: (id: string, filters: EmployeeImportDetailFilters = {}) =>
    ['employees', 'import', id, normalizeFilters(filters)] as const,
}
