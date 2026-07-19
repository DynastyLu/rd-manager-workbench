import { useState } from 'react'
import { Checkbox, Input, InputNumber, Select, TextArea } from '@douyinfe/semi-ui'
import type { DataField, DataTable, RelationRecordLookup } from '../types'
import { RelationPicker, ResolvedRelationValue } from './RelationPicker'

function optionValues(field: DataField) {
  const options = Array.isArray(field.config.options) ? field.config.options : []
  return options.flatMap((option) => {
    if (typeof option === 'string') return [{ label: option, value: option }]
    if (option && typeof option === 'object' && 'value' in option) {
      const record = option as Record<string, unknown>
      const value = typeof record.value === 'string' ? record.value : ''
      const label = typeof record.label === 'string' ? record.label : value
      return value ? [{ label, value }] : []
    }
    return []
  })
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.join('、')
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return `${value}`
  return '—'
}

export function FieldEditor({
  field,
  value,
  editing,
  readOnly = false,
  onStartEdit,
  onCancel,
  onCommit,
  relationTargetTable,
  relationLookup,
}: {
  field: DataField
  value: unknown
  editing: boolean
  readOnly?: boolean
  onStartEdit: () => void
  onCancel: () => void
  onCommit: (value: unknown) => void
  relationTargetTable?: DataTable
  relationLookup?: RelationRecordLookup
}) {
  const [draft, setDraft] = useState(value)

  if (readOnly || ['LOOKUP', 'ROLLUP', 'FORMULA', 'CREATED_AT', 'UPDATED_AT'].includes(field.type)) {
    return <span className="base-grid__readonly">{displayValue(value)}</span>
  }

  if (field.type === 'CHECKBOX') {
    return (
      <Checkbox
        aria-label={`编辑${field.name}`}
        checked={Boolean(value)}
        onChange={(event) => onCommit(Boolean(event.target.checked))}
      />
    )
  }

  if (!editing) {
    return (
      <button type="button" className="base-grid__cell-value" onDoubleClick={onStartEdit} onClick={onStartEdit}>
        {field.type === 'RELATION' && relationTargetTable ? (
          <ResolvedRelationValue
            field={field}
            targetTable={relationTargetTable}
            value={value}
            lookup={relationLookup}
          />
        ) : displayValue(value)}
      </button>
    )
  }

  if (field.type === 'RELATION' && relationTargetTable) {
    return (
      <RelationPicker
        field={field}
        targetTable={relationTargetTable}
        value={draft}
        onChange={(next) => {
          setDraft(next)
          if (field.config.multiple !== true) onCommit(next)
        }}
        onComplete={field.config.multiple === true ? () => onCommit(draft) : undefined}
      />
    )
  }

  const commit = () => onCommit(draft)
  const keyboard = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') onCancel()
    if (event.key === 'Enter' && !['LONG_TEXT', 'ATTACHMENT', 'RELATION'].includes(field.type)) commit()
  }

  if (field.type === 'NUMBER') {
    return (
      <InputNumber
        aria-label={`编辑${field.name}`}
        value={typeof draft === 'number' ? draft : undefined}
        onChange={(next) => setDraft(next ?? null)}
        onBlur={commit}
        onKeyDown={keyboard}
      />
    )
  }

  if (field.type === 'SINGLE_SELECT' || field.type === 'MULTI_SELECT') {
    return (
      <Select
        aria-label={`编辑${field.name}`}
        multiple={field.type === 'MULTI_SELECT'}
        value={draft as string | string[] | undefined}
        optionList={optionValues(field)}
        onChange={(next) => {
          setDraft(next)
          onCommit(next)
        }}
      />
    )
  }

  if (field.type === 'LONG_TEXT' || field.type === 'ATTACHMENT' || field.type === 'RELATION') {
    const commitTextArea = () => {
      if (field.type === 'ATTACHMENT' || field.type === 'RELATION') {
        const text = typeof draft === 'string' ? draft : Array.isArray(draft) ? draft.filter((item): item is string => typeof item === 'string').join(', ') : ''
        const values = text.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean)
        onCommit(field.type === 'RELATION' && field.config.multiple !== true ? (values[0] ?? '') : values)
      } else {
        onCommit(draft)
      }
    }
    return (
      <TextArea
        aria-label={`编辑${field.name}`}
        value={displayValue(draft) === '—' ? '' : displayValue(draft)}
        onChange={setDraft}
        onBlur={commitTextArea}
        onKeyDown={keyboard}
      />
    )
  }

  return (
    <Input
      aria-label={`编辑${field.name}`}
      type={field.type === 'DATETIME' ? 'datetime-local' : field.type === 'LINK' ? 'url' : 'text'}
      value={typeof draft === 'string' || typeof draft === 'number' ? `${draft}` : ''}
      onChange={setDraft}
      onBlur={commit}
      onKeyDown={keyboard}
    />
  )
}
