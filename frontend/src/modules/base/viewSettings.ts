import type {
  DataField,
  DataFieldType,
  DataViewConfig,
  SharedViewConfig,
  ViewFilter,
  ViewFilterOperator,
} from './types'

const VALUELESS_OPERATORS = new Set<ViewFilterOperator>(['EMPTY', 'NOT_EMPTY'])
const COMPUTED_FIELD_TYPES = new Set<DataFieldType>(['LOOKUP', 'ROLLUP', 'FORMULA'])
const TEXT_OPERATORS: ViewFilterOperator[] = [
  'EQ',
  'NE',
  'CONTAINS',
  'NOT_CONTAINS',
  'EMPTY',
  'NOT_EMPTY',
  'IN',
]
const NUMBER_OPERATORS: ViewFilterOperator[] = [
  'EQ',
  'NE',
  'GT',
  'GTE',
  'LT',
  'LTE',
  'EMPTY',
  'NOT_EMPTY',
  'IN',
]
const DATE_OPERATORS: ViewFilterOperator[] = [
  'EQ',
  'NE',
  'BEFORE',
  'AFTER',
  'EMPTY',
  'NOT_EMPTY',
  'IN',
]
const COLLECTION_OPERATORS: ViewFilterOperator[] = [
  'CONTAINS',
  'NOT_CONTAINS',
  'EMPTY',
  'NOT_EMPTY',
  'IN',
]
const BOOLEAN_OPERATORS: ViewFilterOperator[] = ['EQ', 'NE', 'EMPTY', 'NOT_EMPTY']

export function isComputedFieldType(type: DataFieldType) {
  return COMPUTED_FIELD_TYPES.has(type)
}

export function isValuelessOperator(operator: ViewFilterOperator) {
  return VALUELESS_OPERATORS.has(operator)
}

export function operatorsForField(field?: DataField): ViewFilterOperator[] {
  if (!field || isComputedFieldType(field.type)) return []
  if (field.type === 'NUMBER') return NUMBER_OPERATORS
  if (['DATETIME', 'CREATED_AT', 'UPDATED_AT'].includes(field.type)) return DATE_OPERATORS
  if (field.type === 'CHECKBOX') return BOOLEAN_OPERATORS
  if (['MULTI_SELECT', 'ATTACHMENT', 'RELATION'].includes(field.type)) {
    return COLLECTION_OPERATORS
  }
  return TEXT_OPERATORS
}

export function isFilterValid(filter: ViewFilter, fields: DataField[]): boolean {
  const field = fields.find((item) => item.key === filter.fieldKey)
  if (!field || !operatorsForField(field).includes(filter.operator)) return false
  if (isValuelessOperator(filter.operator)) return true
  if (filter.operator === 'IN')
    return Array.isArray(filter.value) && filter.value.length > 0 && filter.value.length <= 100
  return filter.value !== undefined && filter.value !== null && filter.value !== ''
}

function legacyFilterOperator(field?: DataField): ViewFilterOperator {
  return operatorsForField(field)[0] ?? 'EQ'
}

export function normalizeClientViewConfig(
  config: DataViewConfig,
  fields: DataField[] = []
): DataViewConfig {
  const { filterField, filterValue, sortField, sortOrder, ...current } = config
  const filters =
    config.filters ??
    (filterField
      ? [
          {
            fieldKey: filterField,
            operator: legacyFilterOperator(fields.find((field) => field.key === filterField)),
            value: filterValue,
          },
        ]
      : [])
  const sorts =
    config.sorts ?? (sortField ? [{ fieldKey: sortField, direction: sortOrder ?? 'asc' }] : [])
  return { ...current, filters, sorts }
}

export function sharedViewConfig(
  config: DataViewConfig,
  fields: DataField[] = []
): SharedViewConfig {
  const normalized = normalizeClientViewConfig(config, fields)
  return {
    ...(normalized.query ? { query: normalized.query } : {}),
    ...(normalized.filters?.length
      ? { filters: normalized.filters.map((filter) => ({ ...filter })) }
      : {}),
    ...(normalized.sorts?.length ? { sorts: normalized.sorts.map((sort) => ({ ...sort })) } : {}),
    ...(normalized.groupField ? { groupField: normalized.groupField } : {}),
    ...(normalized.hiddenFieldIds?.length
      ? { hiddenFieldIds: [...normalized.hiddenFieldIds] }
      : {}),
    ...(normalized.fieldOrder?.length ? { fieldOrder: [...normalized.fieldOrder] } : {}),
  }
}

export function editableValueText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (typeof value === 'boolean') return String(value)
  if (Array.isArray(value))
    return value
      .filter(
        (item): item is string | number => typeof item === 'string' || typeof item === 'number'
      )
      .join(', ')
  return ''
}

export function localDateTimeText(value: unknown): string {
  if (typeof value !== 'string' || !value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const part = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`
}

export function isoDateTimeValue(localValue: string): string | undefined {
  if (!localValue) return undefined
  const date = new Date(localValue)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}
