export type DataTableSource =
  | 'CUSTOM'
  | 'PROJECTS'
  | 'WORK_TASKS'
  | 'MEETING_ACTIONS'
  | 'DOCUMENTS'
  | 'RISKS_DECISIONS'

export type DataFieldType =
  | 'TEXT'
  | 'LONG_TEXT'
  | 'NUMBER'
  | 'DATETIME'
  | 'SINGLE_SELECT'
  | 'MULTI_SELECT'
  | 'CHECKBOX'
  | 'LINK'
  | 'ATTACHMENT'
  | 'RELATION'
  | 'CREATED_AT'
  | 'UPDATED_AT'

export type DataViewType = 'GRID' | 'KANBAN' | 'CALENDAR' | 'FORM'

export interface DataWorkspace {
  id: string
  name: string
  description: string | null
  sequence: number
  tables?: DataTable[]
  createdAt: string
  updatedAt: string
}

export interface DataTable {
  id: string
  workspaceId: string
  name: string
  description: string | null
  source: DataTableSource
  icon: string | null
  sequence: number
  fields?: DataField[]
  views?: DataView[]
  createdAt: string
  updatedAt: string
}

export interface DataField {
  id: string
  tableId: string
  key: string
  name: string
  type: DataFieldType
  config: Record<string, unknown>
  isPrimary: boolean
  isRequired: boolean
  sequence: number
  createdAt: string
  updatedAt: string
}

export interface DataViewConfig extends Record<string, unknown> {
  query?: string
  filterField?: string
  filterValue?: string
  sortField?: string
  sortOrder?: 'asc' | 'desc'
  groupField?: string
  dateField?: string
  hiddenFieldIds?: string[]
  fieldOrder?: string[]
}

export interface DataView {
  id: string
  tableId: string
  name: string
  type: DataViewType
  config: DataViewConfig
  isDefault: boolean
  sequence: number
  createdAt: string
  updatedAt: string
}

export interface BaseRecord {
  id: string
  values: Record<string, unknown>
  sourceType: string | null
  sourceId: string | null
  sourcePath: string | null
  createdAt: string
  updatedAt: string
}

export type DataRecord = BaseRecord

export interface PageResult<T> {
  data: T[]
  meta: { page: number; pageSize: number; total: number }
}

export interface BaseRecordQuery {
  query?: string
  filterField?: string
  filterValue?: string
  sortField?: string
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface CreateDataFieldInput {
  key: string
  name: string
  type: DataFieldType
  config?: Record<string, unknown>
  isPrimary?: boolean
  isRequired?: boolean
  sequence?: number
}
