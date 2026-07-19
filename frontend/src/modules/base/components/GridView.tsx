import { useEffect, useMemo, useRef, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getGroupedRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type GroupingState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { Empty, Tag } from '@douyinfe/semi-ui'
import { Link } from 'react-router-dom'
import type {
  BaseRecord,
  ComputedFieldError,
  DataField,
  DataTable,
  DataView,
  DataViewConfig,
  RelationRecordLookup,
  ViewFilter,
  ViewSort,
} from '../types'
import {
  editableValueText,
  isoDateTimeValue,
  isComputedFieldType,
  operatorsForField,
} from '../viewSettings'
import { FieldEditor } from './FieldEditor'

function renderCompact(value: unknown) {
  if (value === null || value === undefined || value === '') return '未填写'
  if (Array.isArray(value)) return value.join('、')
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return `${value}`
  return '未填写'
}

function orderedFields(fields: DataField[], config: DataViewConfig) {
  const order = config.fieldOrder ?? []
  return [...fields].sort((left, right) => {
    const leftIndex = order.indexOf(left.id)
    const rightIndex = order.indexOf(right.id)
    if (leftIndex >= 0 || rightIndex >= 0) {
      if (leftIndex < 0) return 1
      if (rightIndex < 0) return -1
      return leftIndex - rightIndex
    }
    return left.sequence - right.sequence
  })
}

const COMPUTED_TYPES = new Set(['LOOKUP', 'ROLLUP', 'FORMULA'])
const EMPTY_TABLES: DataTable[] = []
const EMPTY_RELATION_LOOKUPS = new Map<string, RelationRecordLookup>()

function configuredSorts(config: DataViewConfig): ViewSort[] {
  if (config.sorts) return config.sorts
  return config.sortField
    ? [{ fieldKey: config.sortField, direction: config.sortOrder ?? 'asc' }]
    : []
}

function configuredFilters(config: DataViewConfig, fields: DataField[]): ViewFilter[] {
  if (config.filters) return config.filters
  if (!config.filterField) return []
  const field = fields.find((item) => item.key === config.filterField)
  const operator = operatorsForField(field).includes('CONTAINS') ? 'CONTAINS' : 'EQ'
  return [{ fieldKey: config.filterField, operator, value: config.filterValue }]
}

function quickFilterValue(field: DataField, rawValue: string): unknown {
  if (!rawValue.trim()) return undefined
  if (field.type === 'NUMBER') {
    const value = Number(rawValue)
    return Number.isFinite(value) ? value : undefined
  }
  if (field.type === 'CHECKBOX') {
    if (rawValue === 'true') return true
    if (rawValue === 'false') return false
    return undefined
  }
  if (['DATETIME', 'CREATED_AT', 'UPDATED_AT'].includes(field.type)) {
    return isoDateTimeValue(rawValue)
  }
  return rawValue
}

function ComputedCell({ value, error }: { value: unknown; error?: ComputedFieldError }) {
  if (!error) return <span className="base-grid__readonly">{renderCompact(value)}</span>
  const text =
    error.code === 'DIV_ZERO'
      ? '#DIV/0!'
      : error.code === 'CYCLE'
        ? '#CYCLE!'
        : `⚠ ${error.message || '计算错误'}`
  return (
    <span className="base-grid__computed-error" title={error.message}>
      {text}
    </span>
  )
}

export function GridView({
  fields,
  records,
  view,
  onRecordChange,
  onViewChange,
  onRecordSelect,
  isSaving = false,
  tables = EMPTY_TABLES,
  relationLookups = EMPTY_RELATION_LOOKUPS,
  temporaryQuery,
  onTemporaryQueryChange,
}: {
  fields: DataField[]
  records: BaseRecord[]
  view: DataView
  onRecordChange: (recordId: string, values: Record<string, unknown>) => Promise<unknown> | void
  onViewChange: (config: DataViewConfig) => void
  onRecordSelect?: (record: BaseRecord) => void
  isSaving?: boolean
  tables?: DataTable[]
  relationLookups?: Map<string, RelationRecordLookup>
  temporaryQuery?: string
  onTemporaryQueryChange?: (query: string) => void
}) {
  const [config, setConfig] = useState<DataViewConfig>(view.config)
  const [editing, setEditing] = useState<{ recordId: string; fieldKey: string } | null>(null)
  const initialQuickFilter = configuredFilters(view.config, fields)[0]
  const [quickFilterFieldKey, setQuickFilterFieldKey] = useState(initialQuickFilter?.fieldKey ?? '')
  const [quickFilterInput, setQuickFilterInput] = useState(
    editableValueText(initialQuickFilter?.value)
  )
  const synchronizedView = useRef({ id: view.id, config: view.config, fields })
  useEffect(() => {
    if (
      synchronizedView.current.id === view.id &&
      synchronizedView.current.config === view.config &&
      synchronizedView.current.fields === fields
    )
      return
    synchronizedView.current = { id: view.id, config: view.config, fields }
    setConfig(view.config)
    const nextQuickFilter = configuredFilters(view.config, fields)[0]
    setQuickFilterFieldKey(nextQuickFilter?.fieldKey ?? '')
    setQuickFilterInput(editableValueText(nextQuickFilter?.value))
  }, [fields, view.id, view.config])

  const visibleFields = useMemo(() => orderedFields(fields, config), [fields, config])
  const configurableFields = useMemo(
    () => fields.filter((field) => !isComputedFieldType(field.type)),
    [fields]
  )
  const visibility = useMemo<VisibilityState>(
    () =>
      Object.fromEntries(
        fields.map((field) => [field.key, !(config.hiddenFieldIds ?? []).includes(field.id)])
      ),
    [fields, config.hiddenFieldIds]
  )
  const sorting = useMemo<SortingState>(() => {
    const firstSort = config.sorts?.[0]
    if (firstSort) return [{ id: firstSort.fieldKey, desc: firstSort.direction === 'desc' }]
    return config.sortField ? [{ id: config.sortField, desc: config.sortOrder === 'desc' }] : []
  }, [config.sortField, config.sortOrder, config.sorts])
  const grouping = useMemo<GroupingState>(
    () => (config.groupField ? [config.groupField] : []),
    [config.groupField]
  )

  function updateConfig(patch: Partial<DataViewConfig>) {
    setConfig((current) => {
      const next = { ...current, ...patch }
      onViewChange(next)
      return next
    })
  }

  function moveField(fieldId: string, offset: -1 | 1) {
    const order = orderedFields(fields, config).map((field) => field.id)
    const currentIndex = order.indexOf(fieldId)
    const targetIndex = currentIndex + offset
    if (currentIndex < 0 || targetIndex < 1 || targetIndex >= order.length) return
    const nextOrder = [...order]
    const moving = nextOrder[currentIndex]!
    nextOrder[currentIndex] = nextOrder[targetIndex]!
    nextOrder[targetIndex] = moving
    updateConfig({ fieldOrder: nextOrder })
  }

  const columns = useMemo<ColumnDef<BaseRecord>[]>(
    () =>
      visibleFields.map((field) => ({
        id: field.key,
        accessorFn: (record) => record.values[field.key],
        header: field.name,
        cell: ({ row }) => {
          const record = row.original
          const value = record.values[field.key]
          const computedError = record.computedErrors?.[field.key]
          const isEditing = editing?.recordId === record.id && editing.fieldKey === field.key
          const readOnlyRecordTypes = Array.isArray(field.config.readOnlyRecordTypes)
            ? field.config.readOnlyRecordTypes.filter(
                (item): item is string => typeof item === 'string'
              )
            : []
          const recordType =
            typeof record.values.recordType === 'string' ? record.values.recordType : ''
          const readOnly =
            isSaving ||
            field.config.readOnly === true ||
            readOnlyRecordTypes.includes(recordType) ||
            COMPUTED_TYPES.has(field.type)
          const relationTargetTable =
            field.type === 'RELATION' && typeof field.config.targetTableId === 'string'
              ? tables.find((table) => table.id === field.config.targetTableId)
              : undefined
          return (
            <div className="base-grid__cell-content">
              {COMPUTED_TYPES.has(field.type) ? (
                <ComputedCell value={value} error={computedError} />
              ) : (
                <FieldEditor
                  key={`${record.id}:${field.id}:${isEditing ? 'editing' : 'display'}:${record.updatedAt}`}
                  field={field}
                  value={value}
                  editing={isEditing}
                  readOnly={readOnly}
                  relationTargetTable={relationTargetTable}
                  relationLookup={
                    relationTargetTable ? relationLookups.get(relationTargetTable.id) : undefined
                  }
                  onStartEdit={() => setEditing({ recordId: record.id, fieldKey: field.key })}
                  onCancel={() => setEditing(null)}
                  onCommit={(nextValue) => {
                    setEditing(null)
                    if (nextValue !== value)
                      void onRecordChange(record.id, { [field.key]: nextValue })
                  }}
                />
              )}
              {field.isPrimary && record.sourcePath ? (
                <Link
                  className="base-grid__source-link"
                  aria-label={`打开：${renderCompact(value)}`}
                  to={record.sourcePath}
                >
                  ↗
                </Link>
              ) : null}
            </div>
          )
        },
      })),
    [editing, isSaving, onRecordChange, relationLookups, tables, visibleFields]
  )

  // TanStack Table intentionally exposes non-memoizable callbacks managed by its own state model.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: records,
    columns,
    state: {
      sorting,
      grouping,
      columnVisibility: visibility,
      columnOrder: visibleFields.map((field) => field.key),
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
  })

  return (
    <section className="base-grid" aria-label="表格视图">
      <div className="base-grid__controls">
        <input
          aria-label="搜索当前表"
          type="search"
          placeholder="搜索记录"
          value={temporaryQuery ?? config.query ?? ''}
          onChange={(event) => {
            if (onTemporaryQueryChange) onTemporaryQueryChange(event.target.value)
            else updateConfig({ query: event.target.value })
          }}
        />
        <label>
          <span>排序</span>
          <select
            aria-label="排序字段"
            value={configuredSorts(config)[0]?.fieldKey ?? ''}
            onChange={(event) => {
              const fieldKey = event.target.value || undefined
              const sorts = configuredSorts(config)
              const direction = sorts[0]?.direction ?? config.sortOrder ?? 'asc'
              updateConfig({
                sortField: fieldKey,
                sortOrder: fieldKey ? direction : undefined,
                sorts: fieldKey ? [{ fieldKey, direction }, ...sorts.slice(1)] : sorts.slice(1),
              })
            }}
          >
            <option value="">默认顺序</option>
            {configurableFields.map((field) => (
              <option key={field.id} value={field.key}>
                {field.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="base-grid__order"
          onClick={() => {
            const sorts = configuredSorts(config)
            const direction = (sorts[0]?.direction ?? config.sortOrder) === 'desc' ? 'asc' : 'desc'
            const fieldKey = sorts[0]?.fieldKey
            updateConfig({
              sortOrder: direction,
              sorts: fieldKey ? [{ fieldKey, direction }, ...sorts.slice(1)] : sorts,
            })
          }}
        >
          {(configuredSorts(config)[0]?.direction ?? config.sortOrder) === 'desc' ? '降序' : '升序'}
        </button>
        <label>
          <span>筛选</span>
          <select
            aria-label="筛选字段"
            value={quickFilterFieldKey}
            onChange={(event) => {
              const fieldKey = event.target.value
              setQuickFilterFieldKey(fieldKey)
              setQuickFilterInput('')
              if (!fieldKey) {
                const filters = configuredFilters(config, fields)
                updateConfig({
                  filterField: undefined,
                  filterValue: undefined,
                  filters: filters.slice(1),
                })
              }
            }}
          >
            <option value="">无筛选</option>
            {configurableFields.map((field) => (
              <option key={field.id} value={field.key}>
                {field.name}
              </option>
            ))}
          </select>
        </label>
        {quickFilterFieldKey ? (
          <input
            aria-label="筛选值"
            value={quickFilterInput}
            onChange={(event) => {
              const rawValue = event.target.value
              setQuickFilterInput(rawValue)
              const field = configurableFields.find((item) => item.key === quickFilterFieldKey)
              if (!field) return
              const value = quickFilterValue(field, rawValue)
              if (value === undefined) return
              const filters = configuredFilters(config, fields)
              const operator = operatorsForField(field).includes('CONTAINS') ? 'CONTAINS' : 'EQ'
              updateConfig({
                filterField: quickFilterFieldKey,
                filterValue: rawValue,
                filters: [{ fieldKey: quickFilterFieldKey, operator, value }, ...filters.slice(1)],
              })
            }}
            placeholder="筛选值"
          />
        ) : null}
        <label>
          <span>分组</span>
          <select
            aria-label="分组字段"
            value={config.groupField ?? ''}
            onChange={(event) => updateConfig({ groupField: event.target.value || undefined })}
          >
            <option value="">不分组</option>
            {configurableFields.map((field) => (
              <option key={field.id} value={field.key}>
                {field.name}
              </option>
            ))}
          </select>
        </label>
        <details className="base-grid__field-visibility">
          <summary>显示字段</summary>
          <div>
            {orderedFields(fields, config).map((field, index, ordered) => (
              <label key={field.id} className="base-grid__field-option">
                <input
                  type="checkbox"
                  checked={!config.hiddenFieldIds?.includes(field.id)}
                  disabled={field.isPrimary}
                  onChange={(event) => {
                    const hidden = new Set(config.hiddenFieldIds ?? [])
                    if (event.target.checked) hidden.delete(field.id)
                    else hidden.add(field.id)
                    updateConfig({ hiddenFieldIds: [...hidden] })
                  }}
                />
                <span>{field.name}</span>
                {!field.isPrimary ? (
                  <span className="base-grid__field-order-actions">
                    <button
                      type="button"
                      aria-label={`前移：${field.name}`}
                      disabled={index <= 1}
                      onClick={() => moveField(field.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`后移：${field.name}`}
                      disabled={index >= ordered.length - 1}
                      onClick={() => moveField(field.id, 1)}
                    >
                      ↓
                    </button>
                  </span>
                ) : null}
              </label>
            ))}
          </div>
        </details>
      </div>

      {records.length === 0 ? (
        <Empty title="暂无记录" description="当前筛选条件下没有数据。" />
      ) : (
        <div className="base-grid__scroller">
          <table>
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  <th className="base-grid__row-number">#</th>
                  {headerGroup.headers.map((header) => {
                    const field = fields.find((item) => item.key === header.column.id)
                    return (
                      <th key={header.id} className={field?.isPrimary ? 'base-grid__primary' : ''}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.flatMap((row, index) => {
                const renderRow = (currentRow: typeof row, rowIndex: number): React.ReactNode[] => {
                  if (currentRow.getIsGrouped()) {
                    return [
                      <tr key={currentRow.id} className="base-grid__group-row">
                        <td colSpan={currentRow.getVisibleCells().length + 1}>
                          <Tag color="blue">
                            {renderCompact(
                              currentRow.getGroupingValue(currentRow.groupingColumnId!)
                            )}
                          </Tag>
                          <span>{currentRow.subRows.length} 条记录</span>
                        </td>
                      </tr>,
                      ...currentRow.subRows.flatMap((subRow, subIndex) =>
                        renderRow(subRow, subIndex)
                      ),
                    ]
                  }
                  return [
                    <tr
                      key={currentRow.id}
                      onClick={(event) => {
                        if (
                          (event.target as Element).closest(
                            'button, a, input, textarea, select, [role="checkbox"], [role="combobox"]'
                          )
                        )
                          return
                        onRecordSelect?.(currentRow.original)
                      }}
                    >
                      <td className="base-grid__row-number">
                        {currentRow.index + 1 || rowIndex + 1}
                      </td>
                      {currentRow.getVisibleCells().map((cell) => {
                        const field = fields.find((item) => item.key === cell.column.id)
                        return (
                          <td
                            key={cell.id}
                            className={field?.isPrimary ? 'base-grid__primary' : ''}
                          >
                            {cell.getIsPlaceholder()
                              ? null
                              : flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        )
                      })}
                    </tr>,
                  ]
                }
                return renderRow(row, index)
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
