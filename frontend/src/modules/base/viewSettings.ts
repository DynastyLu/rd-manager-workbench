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
const COMMON_OPERATORS: ViewFilterOperator[] = ['EQ', 'NE', 'EMPTY', 'NOT_EMPTY']

export function isComputedFieldType(type: DataFieldType) {
  return COMPUTED_FIELD_TYPES.has(type)
}

export function isValuelessOperator(operator: ViewFilterOperator) {
  return VALUELESS_OPERATORS.has(operator)
}

export function operatorsForField(field?: DataField): ViewFilterOperator[] {
  if (!field || isComputedFieldType(field.type)) return []
  if (['TEXT', 'LONG_TEXT', 'LINK', 'ATTACHMENT', 'RELATION'].includes(field.type)) {
    return ['EQ', 'NE', 'CONTAINS', 'NOT_CONTAINS', 'EMPTY', 'NOT_EMPTY', 'IN']
  }
  if (field.type === 'NUMBER')
    return ['EQ', 'NE', 'GT', 'GTE', 'LT', 'LTE', 'EMPTY', 'NOT_EMPTY', 'IN']
  if (['DATETIME', 'CREATED_AT', 'UPDATED_AT'].includes(field.type)) {
    return ['EQ', 'NE', 'BEFORE', 'AFTER', 'EMPTY', 'NOT_EMPTY']
  }
  if (['SINGLE_SELECT', 'MULTI_SELECT'].includes(field.type)) return [...COMMON_OPERATORS, 'IN']
  return COMMON_OPERATORS
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
  if (!field || ['TEXT', 'LONG_TEXT', 'LINK', 'ATTACHMENT', 'RELATION'].includes(field.type))
    return 'CONTAINS'
  return 'EQ'
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
