import { WorkspaceFormSelect } from '@/components/workspace/WorkspaceFormSelect'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useRef, useState } from 'react'

import type { DataField, DataRecord } from '../types'

interface SelectOption {
  label: string
  value: string
  color?: string
}

interface KanbanViewProps {
  fields: DataField[]
  records: DataRecord[]
  groupFieldKey?: string
  onGroupFieldChange?: (fieldKey: string) => void
  onRecordUpdate: (recordId: string, input: { values: Record<string, unknown> }) => unknown
  onOpenRecord?: (record: DataRecord) => void
  isUpdating?: boolean
}

const UNGROUPED_VALUE = '__base_ungrouped__'

function readSelectOptions(field: DataField): SelectOption[] {
  const options = Array.isArray(field.config.options) ? field.config.options : []

  return options.flatMap((option) => {
    if (typeof option === 'string') return [{ label: option, value: option }]
    if (!isUnknownRecord(option)) return []
    const value = option['value']
    if (typeof value !== 'string') return []
    const optionLabel = option['label']
    const optionColor = option['color']
    const label = typeof optionLabel === 'string' ? optionLabel : value
    const color = typeof optionColor === 'string' ? optionColor : undefined
    return [{ label, value, ...(color ? { color } : {}) }]
  })
}

function readRecordTypeOptions(field: DataField, record: DataRecord): SelectOption[] | null {
  const optionsByRecordType = field.config.optionsByRecordType
  if (!isUnknownRecord(optionsByRecordType)) return null

  const recordType = readText(record.values.recordType)
  const configuredOptions = recordType ? optionsByRecordType[recordType] : undefined
  if (!Array.isArray(configuredOptions)) return []

  const optionByValue = new Map(readSelectOptions(field).map((option) => [option.value, option]))
  return configuredOptions.flatMap((configuredOption) => {
    const value =
      typeof configuredOption === 'string'
        ? configuredOption
        : isUnknownRecord(configuredOption) && typeof configuredOption.value === 'string'
          ? configuredOption.value
          : ''
    if (!value) return []

    const existingOption = optionByValue.get(value)
    if (existingOption) return [existingOption]
    if (!isUnknownRecord(configuredOption)) return [{ label: value, value }]

    const label = typeof configuredOption.label === 'string' ? configuredOption.label : value
    const color = typeof configuredOption.color === 'string' ? configuredOption.color : undefined
    return [{ label, value, ...(color ? { color } : {}) }]
  })
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return isUnknownRecord(value) && typeof value.then === 'function'
}

function readText(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return ''
}

function getRecordTitle(record: DataRecord, fields: DataField[]) {
  const primaryField = fields.find((field) => field.isPrimary) ?? fields[0]
  if (!primaryField) return '未命名记录'
  return readText(record.values[primaryField.key]) || '未命名记录'
}

function isReadOnlyForRecord(field: DataField, record: DataRecord) {
  if (field.config.readOnly === true) return true

  const readOnlyRecordTypes = Array.isArray(field.config.readOnlyRecordTypes)
    ? field.config.readOnlyRecordTypes.filter((item): item is string => typeof item === 'string')
    : []
  const recordType = readText(record.values.recordType)
  return Boolean(recordType && readOnlyRecordTypes.includes(recordType))
}

function moveKanbanRecord(_record: DataRecord, fieldKey: string, nextValue: string | null) {
  return { values: { [fieldKey]: nextValue } }
}

function KanbanCard({
  disabled,
  fields,
  groupField,
  onMove,
  onOpen,
  options,
  showUngroupedOption,
  record,
}: {
  disabled: boolean
  fields: DataField[]
  groupField: DataField
  onMove: (value: string | null) => void
  onOpen?: () => void
  options: SelectOption[]
  showUngroupedOption: boolean
  record: DataRecord
}) {
  const title = getRecordTitle(record, fields)
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `record:${record.id}`,
      data: { recordId: record.id },
      disabled,
    })
  const secondaryFields = fields
    .filter((field) => !field.isPrimary && field.key !== groupField.key)
    .filter((field) => readText(record.values[field.key]))
    .slice(0, 2)

  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        display: 'grid',
        gap: 10,
        padding: '12px 13px',
        border: '1px solid #e5e6eb',
        borderRadius: 8,
        background: '#fff',
        boxShadow: isDragging ? '0 12px 32px rgba(31,35,41,.16)' : '0 1px 2px rgba(31,35,41,.04)',
        opacity: isDragging ? 0.78 : 1,
        cursor: disabled ? 'default' : 'grab',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'start', gap: 7 }}>
        <button
          type="button"
          onClick={onOpen}
          style={{
            flex: 1,
            padding: 0,
            border: 0,
            background: 'transparent',
            color: '#1f2329',
            font: 'inherit',
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.5,
            textAlign: 'left',
            cursor: onOpen ? 'pointer' : 'default',
          }}
        >
          {title}
        </button>
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`拖动“${title}”`}
          disabled={disabled}
          style={{
            padding: '1px 3px',
            border: 0,
            background: 'transparent',
            color: '#8f959e',
            cursor: 'grab',
          }}
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
      </div>
      {secondaryFields.length > 0 ? (
        <dl style={{ display: 'grid', gap: 5, margin: 0 }}>
          {secondaryFields.map((field) => (
            <div key={field.id} style={{ display: 'flex', minWidth: 0, gap: 6, fontSize: 12 }}>
              <dt style={{ flex: '0 0 auto', color: '#8f959e' }}>{field.name}</dt>
              <dd
                style={{
                  overflow: 'hidden',
                  margin: 0,
                  color: '#646a73',
                  textOverflow: 'ellipsis',
                }}
              >
                {readText(record.values[field.key])}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <WorkspaceFormSelect
        aria-label={`移动“${title}”`}
        value={readText(record.values[groupField.key]) || UNGROUPED_VALUE}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onChange={(event) =>
          onMove(event.target.value === UNGROUPED_VALUE ? null : event.target.value)
        }
        disabled={disabled}
        style={{
          width: '100%',
          height: 28,
          padding: '0 8px',
          border: '1px solid #dee0e3',
          borderRadius: 6,
          background: '#f7f8fa',
          color: '#646a73',
          fontSize: 12,
        }}
      >
        {showUngroupedOption ? <option value={UNGROUPED_VALUE}>未分组</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </WorkspaceFormSelect>
    </article>
  )
}

function KanbanColumn({
  children,
  count,
  label,
  value,
  color,
}: {
  children: React.ReactNode
  count: number
  label: string
  value: string
  color?: string
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `column:${value}` })

  return (
    <section
      ref={setNodeRef}
      style={{
        minWidth: 260,
        padding: 10,
        border: `1px solid ${isOver ? '#8fb4ff' : '#ebedf0'}`,
        borderRadius: 10,
        background: isOver ? '#edf4ff' : '#f7f8fa',
        transition: 'background .16s ease, border-color .16s ease',
      }}
    >
      <h3
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          margin: '2px 2px 10px',
          fontSize: 13,
        }}
        aria-label={`${label} ${count}`}
      >
        <span
          aria-hidden="true"
          style={{ width: 8, height: 8, borderRadius: '50%', background: color ?? '#8f959e' }}
        />
        <span>{label}</span>
        <span style={{ color: '#8f959e', fontWeight: 400 }}>{count}</span>
      </h3>
      <div style={{ display: 'grid', gap: 8 }}>{children}</div>
    </section>
  )
}

export function KanbanView({
  fields,
  records,
  groupFieldKey,
  onGroupFieldChange,
  onRecordUpdate,
  onOpenRecord,
  isUpdating = false,
}: KanbanViewProps) {
  const [pendingRecordIds, setPendingRecordIds] = useState<Set<string>>(() => new Set())
  const pendingRecordIdsRef = useRef(pendingRecordIds)
  const groupableFields = fields.filter(
    (field) => field.type === 'SINGLE_SELECT' && field.config.readOnly !== true
  )
  const groupField =
    groupableFields.find((field) => field.key === groupFieldKey) ?? groupableFields[0]
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor))
  const options = groupField ? readSelectOptions(groupField) : []
  const columns = [...options, { label: '未分组', value: UNGROUPED_VALUE, color: '#bbbfc4' }]

  if (!groupField) {
    return (
      <div style={{ padding: 32, color: '#646a73', textAlign: 'center' }}>
        请先添加单选字段，再创建看板分组。
      </div>
    )
  }

  const moveRecord = (record: DataRecord, nextValue: string | null) => {
    if (
      isUpdating ||
      pendingRecordIdsRef.current.has(record.id) ||
      isReadOnlyForRecord(groupField, record)
    ) {
      return
    }
    if ((record.values[groupField.key] ?? null) === nextValue) return
    const recordTypeOptions = readRecordTypeOptions(groupField, record)
    if (
      recordTypeOptions &&
      (nextValue === null || !recordTypeOptions.some((option) => option.value === nextValue))
    )
      return

    const pendingAfterMove = new Set(pendingRecordIdsRef.current).add(record.id)
    pendingRecordIdsRef.current = pendingAfterMove
    setPendingRecordIds(pendingAfterMove)
    const clearPending = () => {
      const pendingAfterSave = new Set(pendingRecordIdsRef.current)
      pendingAfterSave.delete(record.id)
      pendingRecordIdsRef.current = pendingAfterSave
      setPendingRecordIds(pendingAfterSave)
    }

    try {
      const result = onRecordUpdate(record.id, moveKanbanRecord(record, groupField.key, nextValue))
      if (isPromiseLike(result)) {
        void Promise.resolve(result)
          .finally(clearPending)
          .catch(() => undefined)
      } else {
        clearPending()
      }
    } catch (error) {
      clearPending()
      throw error
    }
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return
    const recordId = String(active.id).replace(/^record:/, '')
    const target = String(over.id).replace(/^column:/, '')
    const record = records.find((item) => item.id === recordId)
    if (!record) return
    moveRecord(record, target === UNGROUPED_VALUE ? null : target)
  }

  return (
    <div style={{ display: 'grid', gap: 12, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label htmlFor="base-kanban-group" style={{ color: '#646a73', fontSize: 12 }}>
          分组字段
        </label>
        <WorkspaceFormSelect
          id="base-kanban-group"
          aria-label="分组字段"
          value={groupField.key}
          onChange={(event) => onGroupFieldChange?.(event.target.value)}
          style={{ height: 30, border: '1px solid #dee0e3', borderRadius: 6, background: '#fff' }}
        >
          {groupableFields.map((field) => (
            <option key={field.id} value={field.key}>
              {field.name}
            </option>
          ))}
        </WorkspaceFormSelect>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div
          style={{ display: 'flex', minHeight: 320, gap: 12, overflowX: 'auto', paddingBottom: 8 }}
        >
          {columns.map((column) => {
            const columnRecords = records.filter((record) => {
              const value = readText(record.values[groupField.key]) || UNGROUPED_VALUE
              return value === column.value
            })
            return (
              <KanbanColumn
                key={column.value}
                label={column.label}
                value={column.value}
                count={columnRecords.length}
                color={column.color}
              >
                {columnRecords.map((record) => (
                  <KanbanCard
                    key={record.id}
                    disabled={
                      isUpdating ||
                      pendingRecordIds.has(record.id) ||
                      isReadOnlyForRecord(groupField, record)
                    }
                    fields={fields}
                    groupField={groupField}
                    record={record}
                    options={readRecordTypeOptions(groupField, record) ?? options}
                    showUngroupedOption={readRecordTypeOptions(groupField, record) === null}
                    onOpen={onOpenRecord ? () => onOpenRecord(record) : undefined}
                    onMove={(value) => moveRecord(record, value)}
                  />
                ))}
                {columnRecords.length === 0 ? (
                  <p
                    style={{
                      margin: '28px 0',
                      color: '#bbbfc4',
                      fontSize: 12,
                      textAlign: 'center',
                    }}
                  >
                    拖动记录到这里
                  </p>
                ) : null}
              </KanbanColumn>
            )
          })}
        </div>
      </DndContext>
    </div>
  )
}
