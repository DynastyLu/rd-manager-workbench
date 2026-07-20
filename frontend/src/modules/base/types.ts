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

export type DataViewType = 'GRID' | 'KANBAN' | 'CALENDAR' | 'FORM' | 'GANTT' | 'GALLERY'

export type ViewFilterOperator =
  | 'EQ'
  | 'NE'
  | 'CONTAINS'
  | 'NOT_CONTAINS'
  | 'EMPTY'
  | 'NOT_EMPTY'
  | 'GT'
  | 'GTE'
  | 'LT'
  | 'LTE'
  | 'BEFORE'
  | 'AFTER'
  | 'IN'

export interface ViewFilter {
  fieldKey: string
  operator: ViewFilterOperator
  value?: unknown
}

export interface ViewSort {
  fieldKey: string
  direction: 'asc' | 'desc'
}

export interface SharedViewConfig extends Record<string, unknown> {
  query?: string
  filters?: ViewFilter[]
  sorts?: ViewSort[]
  groupField?: string
  hiddenFieldIds?: string[]
  fieldOrder?: string[]
}

export interface GanttViewConfig extends SharedViewConfig {
  titleFieldKey?: string
  startFieldKey?: string
  endFieldKey?: string
  scale?: 'DAY' | 'WEEK' | 'MONTH'
  rowHeight?: 'COMPACT' | 'STANDARD'
}

export interface GalleryViewConfig extends SharedViewConfig {
  titleFieldKey?: string
  coverFieldKey?: string
  visibleFieldIds?: string[]
  cardSize?: 'COMPACT' | 'STANDARD' | 'WIDE'
  coverFit?: 'COVER' | 'CONTAIN'
}

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

export interface DataViewConfig extends SharedViewConfig {
  filterField?: string
  filterValue?: string
  sortField?: string
  sortOrder?: 'asc' | 'desc'
  dateField?: string
  titleFieldKey?: string
  startFieldKey?: string
  endFieldKey?: string
  scale?: GanttViewConfig['scale']
  rowHeight?: GanttViewConfig['rowHeight']
  coverFieldKey?: string
  visibleFieldIds?: string[]
  cardSize?: GalleryViewConfig['cardSize']
  coverFit?: GalleryViewConfig['coverFit']
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

export interface RelationRecordLookup {
  records: BaseRecord[]
  isPending: boolean
  isError: boolean
  isSuccess: boolean
  refetch?: () => void | Promise<unknown>
}

export type DataRecord = BaseRecord

export interface PageResult<T> {
  data: T[]
  meta: { page: number; pageSize: number; total: number }
}

export interface BaseRecordQuery {
  recordIds?: string[]
  viewId?: string
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

export interface DataTableTemplateSummary {
  key: string
  version: 1
  name: string
  description: string
  icon: string
  category: 'PARTNER' | 'APPLICATION' | 'GOVERNANCE' | 'INTERVIEW' | 'RESEARCH'
  fieldCount: number
  viewTypes: DataViewType[]
  primaryFields: string[]
}

export interface DataTableTemplateDetail extends Omit<DataTableTemplateSummary, 'fieldCount' | 'viewTypes' | 'primaryFields'> {
  fields: Array<Pick<DataField, 'key' | 'name' | 'type' | 'config' | 'isPrimary' | 'isRequired' | 'sequence'>>
  views: Array<Pick<DataView, 'name' | 'type' | 'config' | 'isDefault' | 'sequence'>>
}

export type DataImportStatus = 'UPLOADED' | 'PREVIEWED' | 'IMPORTING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'EXPIRED'

export interface BaseImportSession {
  id: string
  tableId: string
  originalName: string
  format: 'CSV' | 'XLSX'
  selectedSheet: string | null
  status: DataImportStatus
  totalRows: number
  validRows: number
  errorRows: number
  importedRows: number
  hasErrors: boolean
  expiresAt: string
}

export interface BaseImportPreview {
  sheetNames: string[]
  selectedSheet: string
  columns: string[]
  inferredTypes: Record<string, 'TEXT' | 'NUMBER' | 'DATETIME' | 'CHECKBOX'>
  rows: Array<{ rowNumber: number; values: Record<string, unknown> }>
}

export interface ImportColumnMapping {
  sourceColumn: string
  targetFieldId?: string
  newField?: { name: string; key: string; type: Extract<DataFieldType, 'TEXT' | 'LONG_TEXT' | 'NUMBER' | 'DATETIME' | 'SINGLE_SELECT' | 'MULTI_SELECT' | 'CHECKBOX' | 'LINK'> }
  ignored?: boolean
}

export interface BaseImportUploadResult { session: BaseImportSession; preview: BaseImportPreview }
export interface BaseImportPreviewResult extends BaseImportUploadResult {
  errors: Array<{ rowNumber: number; fields: string[]; message: string; source: Record<string, unknown> }>
}
