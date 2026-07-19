import type { DataField, ViewFilter, ViewFilterOperator } from '../types'
import {
  editableValueText,
  isComputedFieldType,
  isValuelessOperator,
  operatorsForField,
} from '../viewSettings'

const FILTER_LIMIT = 20
const OPERATOR_LABELS: Record<ViewFilterOperator, string> = {
  EQ: '等于',
  NE: '不等于',
  CONTAINS: '包含',
  NOT_CONTAINS: '不包含',
  EMPTY: '为空',
  NOT_EMPTY: '不为空',
  GT: '大于',
  GTE: '大于等于',
  LT: '小于',
  LTE: '小于等于',
  BEFORE: '早于',
  AFTER: '晚于',
  IN: '属于任一项',
}

function normalizeInputValue(
  field: DataField,
  operator: ViewFilterOperator,
  rawValue: string
): unknown {
  if (operator === 'IN')
    return rawValue
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 100)
  if (field.type === 'NUMBER') return rawValue === '' ? undefined : Number(rawValue)
  if (field.type === 'CHECKBOX') return rawValue === 'true'
  return rawValue
}

function valueInputType(field: DataField) {
  if (field.type === 'NUMBER') return 'number'
  if (['DATETIME', 'CREATED_AT', 'UPDATED_AT'].includes(field.type)) return 'datetime-local'
  return 'text'
}

function optionValues(field: DataField) {
  const configured: unknown = field.config.options
  if (!Array.isArray(configured)) return []
  return configured.flatMap((option: unknown) => {
    if (typeof option === 'string') return [{ label: option, value: option }]
    if (!option || typeof option !== 'object') return []
    const candidate = option as Record<string, unknown>
    const value = candidate.value
    if (typeof value !== 'string') return []
    const label = typeof candidate.label === 'string' ? candidate.label : value
    return [{ label, value }]
  })
}

function FilterValueEditor({
  filter,
  field,
  index,
  onChange,
}: {
  filter: ViewFilter
  field: DataField
  index: number
  onChange: (filter: ViewFilter) => void
}) {
  if (isValuelessOperator(filter.operator)) return null
  const ariaLabel = `筛选值 ${index + 1}`
  const configuredOptions = optionValues(field)
  if (filter.operator !== 'IN' && (configuredOptions.length > 0 || field.type === 'CHECKBOX')) {
    const options =
      field.type === 'CHECKBOX'
        ? [
            { label: '是', value: 'true' },
            { label: '否', value: 'false' },
          ]
        : configuredOptions
    return (
      <select
        aria-label={ariaLabel}
        value={editableValueText(filter.value)}
        onChange={(event) =>
          onChange({
            ...filter,
            value: normalizeInputValue(field, filter.operator, event.target.value),
          })
        }
      >
        <option value="">选择值</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }
  const renderedValue = editableValueText(filter.value)
  return (
    <input
      aria-label={ariaLabel}
      type={filter.operator === 'IN' ? 'text' : valueInputType(field)}
      value={renderedValue}
      placeholder={filter.operator === 'IN' ? '多个值用逗号分隔' : '输入筛选值'}
      onChange={(event) =>
        onChange({
          ...filter,
          value: normalizeInputValue(field, filter.operator, event.target.value),
        })
      }
    />
  )
}

export function ViewFilterBuilder({
  fields,
  filters,
  onChange,
}: {
  fields: DataField[]
  filters: ViewFilter[]
  onChange: (filters: ViewFilter[]) => void
}) {
  const filterableFields = fields.filter((field) => !isComputedFieldType(field.type))

  function updateFilter(index: number, next: ViewFilter) {
    onChange(filters.map((filter, currentIndex) => (currentIndex === index ? next : filter)))
  }

  return (
    <section className="view-settings__section" aria-labelledby="view-filter-heading">
      <div className="view-settings__section-heading">
        <div>
          <h3 id="view-filter-heading">筛选</h3>
          <p>所有条件同时满足时显示记录</p>
        </div>
        <span>
          {filters.length}/{FILTER_LIMIT}
        </span>
      </div>
      <div className="view-filter-list">
        {filters.map((filter, index) => {
          const field = fields.find((item) => item.key === filter.fieldKey)
          const availableOperators = operatorsForField(field)
          return (
            <div className="view-filter-row" key={`${index}:${filter.fieldKey}`}>
              <span className="view-filter-row__and">{index === 0 ? '当' : '且'}</span>
              <select
                aria-label={`筛选字段 ${index + 1}`}
                value={filter.fieldKey}
                onChange={(event) => {
                  const nextField = fields.find((item) => item.key === event.target.value)
                  const nextOperator = operatorsForField(nextField)[0] ?? 'EQ'
                  updateFilter(index, { fieldKey: event.target.value, operator: nextOperator })
                }}
              >
                {!field ? <option value={filter.fieldKey}>失效字段</option> : null}
                <option value="">选择字段</option>
                {filterableFields.map((option) => (
                  <option key={option.id} value={option.key}>
                    {option.name}
                  </option>
                ))}
              </select>
              <select
                aria-label={`筛选运算符 ${index + 1}`}
                value={filter.operator}
                disabled={!field}
                onChange={(event) =>
                  updateFilter(index, {
                    fieldKey: filter.fieldKey,
                    operator: event.target.value as ViewFilterOperator,
                  })
                }
              >
                {!availableOperators.includes(filter.operator) ? (
                  <option value={filter.operator}>不可用</option>
                ) : null}
                {availableOperators.map((operator) => (
                  <option key={operator} value={operator}>
                    {OPERATOR_LABELS[operator]}
                  </option>
                ))}
              </select>
              {field ? (
                <FilterValueEditor
                  filter={filter}
                  field={field}
                  index={index}
                  onChange={(next) => updateFilter(index, next)}
                />
              ) : (
                <span className="view-filter-row__invalid">字段已失效：{filter.fieldKey}</span>
              )}
              <button
                type="button"
                aria-label={`删除筛选条件 ${index + 1}`}
                className="view-settings__icon-button"
                onClick={() =>
                  onChange(filters.filter((_, currentIndex) => currentIndex !== index))
                }
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
      <button
        type="button"
        aria-label="添加筛选条件"
        className="view-settings__add-button"
        disabled={filters.length >= FILTER_LIMIT || filterableFields.length === 0}
        onClick={() => onChange([...filters, { fieldKey: '', operator: 'EQ' }])}
      >
        ＋ 添加筛选条件
      </button>
    </section>
  )
}
