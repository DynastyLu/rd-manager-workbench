import { useEffect, useMemo, useState } from 'react'
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
import type { BaseRecord, DataField, DataView, DataViewConfig } from '../types'
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

export function GridView({
  fields,
  records,
  view,
  onRecordChange,
  onViewChange,
  onRecordSelect,
}: {
  fields: DataField[]
  records: BaseRecord[]
  view: DataView
  onRecordChange: (recordId: string, values: Record<string, unknown>) => Promise<unknown> | void
  onViewChange: (config: DataViewConfig) => void
  onRecordSelect?: (record: BaseRecord) => void
}) {
  const [config, setConfig] = useState<DataViewConfig>(view.config)
  const [editing, setEditing] = useState<{ recordId: string; fieldKey: string } | null>(null)
  useEffect(() => setConfig(view.config), [view.id, view.config])

  const visibleFields = useMemo(() => orderedFields(fields, config), [fields, config])
  const visibility = useMemo<VisibilityState>(() => Object.fromEntries(
    fields.map((field) => [field.key, !(config.hiddenFieldIds ?? []).includes(field.id)]),
  ), [fields, config.hiddenFieldIds])
  const sorting = useMemo<SortingState>(
    () => config.sortField ? [{ id: config.sortField, desc: config.sortOrder === 'desc' }] : [],
    [config.sortField, config.sortOrder],
  )
  const grouping = useMemo<GroupingState>(() => config.groupField ? [config.groupField] : [], [config.groupField])

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

  const columns = useMemo<ColumnDef<BaseRecord>[]>(() => visibleFields.map((field) => ({
    id: field.key,
    accessorFn: (record) => record.values[field.key],
    header: field.name,
    cell: ({ row }) => {
      const record = row.original
      const value = record.values[field.key]
      const isEditing = editing?.recordId === record.id && editing.fieldKey === field.key
      return (
        <div className="base-grid__cell-content">
          <FieldEditor
            key={`${record.id}:${field.id}:${isEditing ? 'editing' : 'display'}:${record.updatedAt}`}
            field={field}
            value={value}
            editing={isEditing}
            onStartEdit={() => setEditing({ recordId: record.id, fieldKey: field.key })}
            onCancel={() => setEditing(null)}
            onCommit={(nextValue) => {
              setEditing(null)
              if (nextValue !== value) void onRecordChange(record.id, { [field.key]: nextValue })
            }}
          />
          {field.isPrimary && record.sourcePath ? (
            <Link className="base-grid__source-link" aria-label={`打开：${renderCompact(value)}`} to={record.sourcePath}>↗</Link>
          ) : null}
        </div>
      )
    },
  })), [editing, onRecordChange, visibleFields])

  // TanStack Table intentionally exposes non-memoizable callbacks managed by its own state model.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: records,
    columns,
    state: { sorting, grouping, columnVisibility: visibility, columnOrder: visibleFields.map((field) => field.key) },
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
          value={config.query ?? ''}
          onChange={(event) => updateConfig({ query: event.target.value })}
        />
        <label><span>排序</span><select aria-label="排序字段" value={config.sortField ?? ''} onChange={(event) => updateConfig({ sortField: event.target.value || undefined })}>
          <option value="">默认顺序</option>{fields.map((field) => <option key={field.id} value={field.key}>{field.name}</option>)}
        </select></label>
        <button type="button" className="base-grid__order" onClick={() => updateConfig({ sortOrder: config.sortOrder === 'desc' ? 'asc' : 'desc' })}>
          {config.sortOrder === 'desc' ? '降序' : '升序'}
        </button>
        <label><span>筛选</span><select aria-label="筛选字段" value={config.filterField ?? ''} onChange={(event) => updateConfig({ filterField: event.target.value || undefined })}>
          <option value="">无筛选</option>{fields.map((field) => <option key={field.id} value={field.key}>{field.name}</option>)}
        </select></label>
        {config.filterField ? <input aria-label="筛选值" value={config.filterValue ?? ''} onChange={(event) => updateConfig({ filterValue: event.target.value })} placeholder="筛选值" /> : null}
        <label><span>分组</span><select aria-label="分组字段" value={config.groupField ?? ''} onChange={(event) => updateConfig({ groupField: event.target.value || undefined })}>
          <option value="">不分组</option>{fields.map((field) => <option key={field.id} value={field.key}>{field.name}</option>)}
        </select></label>
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
                    <button type="button" aria-label={`前移：${field.name}`} disabled={index <= 1} onClick={() => moveField(field.id, -1)}>↑</button>
                    <button type="button" aria-label={`后移：${field.name}`} disabled={index >= ordered.length - 1} onClick={() => moveField(field.id, 1)}>↓</button>
                  </span>
                ) : null}
              </label>
            ))}
          </div>
        </details>
      </div>

      {records.length === 0 ? <Empty title="暂无记录" description="当前筛选条件下没有数据。" /> : (
        <div className="base-grid__scroller">
          <table>
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  <th className="base-grid__row-number">#</th>
                  {headerGroup.headers.map((header) => {
                    const field = fields.find((item) => item.key === header.column.id)
                    return <th key={header.id} className={field?.isPrimary ? 'base-grid__primary' : ''}>{flexRender(header.column.columnDef.header, header.getContext())}</th>
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row, index) => {
                if (row.getIsGrouped()) {
                  return (
                    <tr key={row.id} className="base-grid__group-row">
                      <td colSpan={row.getVisibleCells().length + 1}>
                        <Tag color="blue">{renderCompact(row.getGroupingValue(row.groupingColumnId!))}</Tag>
                        <span>{row.subRows.length} 条记录</span>
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr
                    key={row.id}
                    onClick={(event) => {
                      if ((event.target as Element).closest('button, a, input, textarea, select, [role="checkbox"]')) return
                      onRecordSelect?.(row.original)
                    }}
                  >
                    <td className="base-grid__row-number">{index + 1}</td>
                    {row.getVisibleCells().map((cell) => {
                      const field = fields.find((item) => item.key === cell.column.id)
                      return <td key={cell.id} className={field?.isPrimary ? 'base-grid__primary' : ''}>{cell.getIsPlaceholder() ? null : flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
