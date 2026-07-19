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
  | 'LOOKUP'
  | 'ROLLUP'
  | 'FORMULA'
  | 'CREATED_AT'
  | 'UPDATED_AT'

export type DataViewType = 'GRID' | 'KANBAN' | 'CALENDAR' | 'FORM'

export interface RelationFieldConfig {
  targetTableId: string
  multiple: boolean
  relationMode: 'ONE_WAY' | 'TWO_WAY'
  inverseFieldId?: string
}

export interface CreateRelationOptions {
  inverseFieldName?: string
  inverseMultiple?: boolean
}

export interface LookupFieldConfig {
  relationFieldId: string
  targetFieldId: string
}

export interface RollupFieldConfig {
  relationFieldId: string
  targetFieldId?: string
  aggregation: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX'
}

export type FormulaFunctionName =
  | 'IF'
  | 'COALESCE'
  | 'ROUND'
  | 'ABS'
  | 'SUM'
  | 'COUNT'
  | 'CONCAT'
  | 'LOWER'
  | 'UPPER'
  | 'LEN'
  | 'DATE_ADD'
  | 'DATE_DIFF'

export type FormulaAst =
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'field'; fieldId: string }
  | { kind: 'unary'; operator: '+' | '-'; operand: FormulaAst }
  | {
      kind: 'binary'
      operator: '+' | '-' | '*' | '/' | '%' | '=' | '!=' | '>' | '>=' | '<' | '<='
      left: FormulaAst
      right: FormulaAst
    }
  | { kind: 'call'; name: FormulaFunctionName; args: FormulaAst[] }

export interface FormulaFieldConfig {
  expression: string
  astVersion: 1
  dependencies: string[]
  ast: FormulaAst
}

export interface FormulaPreviewInput {
  expression: string
  recordId?: string
}

export interface FormulaPreviewDependency {
  id: string
  key?: string
  name?: string
  type?: DataFieldType
}

export interface FormulaPreviewResult {
  astVersion: 1
  ast: FormulaAst
  dependencies: string[]
  dependencyFields: FormulaPreviewDependency[]
  value: unknown
  error?: Pick<ComputedFieldError, 'code' | 'message'>
}

export interface ComputedFieldError {
  code: 'INVALID_FORMULA' | 'TYPE_ERROR' | 'DIV_ZERO' | 'CYCLE' | 'MISSING_TARGET'
  message: string
}

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
  computedErrors?: Record<string, ComputedFieldError>
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
  inverseFieldName?: string
  inverseMultiple?: boolean
}
