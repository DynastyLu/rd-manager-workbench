import { useState, type FormEvent } from 'react'

import type { DataField, DataTable, DataTableSource } from '../types'
import { RelationPicker } from './RelationPicker'
import { DateTimePickerField } from '@/components/FormControls/DateTimePickerField'

interface FormViewProps {
  tableSource: DataTableSource
  fields: DataField[]
  tables?: DataTable[]
  onCreateRecord: (input: { values: Record<string, unknown> }) => unknown
  isSubmitting?: boolean
}

interface SelectOption {
  label: string
  value: string
}

const READONLY_FIELD_TYPES = new Set(['LOOKUP', 'ROLLUP', 'FORMULA', 'CREATED_AT', 'UPDATED_AT'])

function getOptions(field: DataField): SelectOption[] {
  const options = Array.isArray(field.config.options) ? field.config.options : []
  return options.flatMap((option) => {
    if (typeof option === 'string') return [{ label: option, value: option }]
    if (!isUnknownRecord(option)) return []
    const value = option['value']
    if (typeof value !== 'string') return []
    const label = option['label']
    return [
      {
        value,
        label: typeof label === 'string' ? label : value,
      },
    ]
  })
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isBlank(value: unknown) {
  return value === null
    || value === undefined
    || (typeof value === 'string' && value.trim() === '')
    || (Array.isArray(value) && value.length === 0)
}

function emptyValue(field: DataField) {
  if (field.type === 'CHECKBOX') return false
  if (field.type === 'MULTI_SELECT' || field.type === 'ATTACHMENT' || (field.type === 'RELATION' && field.config.multiple === true)) return []
  return ''
}

function normalizeAttachmentValue(value: unknown) {
  const paths = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n]+/)
      : []
  return [
    ...new Set(
      paths
        .filter((path): path is string => typeof path === 'string')
        .map((path) => path.trim())
        .filter(Boolean)
    ),
  ]
}

function normalizeFieldValue(field: DataField, value: unknown) {
  return field.type === 'ATTACHMENT' ? normalizeAttachmentValue(value) : value
}

function FieldControl({
  field,
  value,
  required,
  onChange,
  relationTargetTable,
}: {
  field: DataField
  value: unknown
  required: boolean
  onChange: (value: unknown) => void
  relationTargetTable?: DataTable
}) {
  const commonStyle = {
    width: '100%',
    minHeight: 34,
    padding: '0 10px',
    border: '1px solid #dee0e3',
    borderRadius: 6,
    background: '#fff',
    color: '#1f2329',
    font: 'inherit',
  }

  switch (field.type) {
    case 'RELATION':
      return relationTargetTable ? (
        <RelationPicker
          field={field}
          targetTable={relationTargetTable}
          value={value}
          onChange={onChange}
        />
      ) : (
        <p className="relation-picker__legacy">请先在字段管理中补全目标数据表</p>
      )
    case 'LONG_TEXT':
      return (
        <textarea
          id={`base-form-${field.id}`}
          aria-label={field.name}
          required={required}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          rows={4}
          style={{ ...commonStyle, padding: 10, resize: 'vertical' }}
        />
      )
    case 'NUMBER':
      return (
        <input
          id={`base-form-${field.id}`}
          aria-label={field.name}
          required={required}
          type="number"
          value={typeof value === 'number' || typeof value === 'string' ? value : ''}
          onChange={(event) =>
            onChange(event.target.value === '' ? '' : Number(event.target.value))
          }
          style={commonStyle}
        />
      )
    case 'DATETIME':
      return (
        <DateTimePickerField
          id={`base-form-${field.id}`}
          aria-label={field.name}
          required={required}
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
        />
      )
    case 'SINGLE_SELECT':
      return (
        <select
          id={`base-form-${field.id}`}
          aria-label={field.name}
          required={required}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          style={commonStyle}
        >
          <option value="">请选择</option>
          {getOptions(field).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    case 'MULTI_SELECT':
      return (
        <select
          id={`base-form-${field.id}`}
          aria-label={field.name}
          required={required}
          multiple
          value={Array.isArray(value) ? value.map(String) : []}
          onChange={(event) =>
            onChange(Array.from(event.target.selectedOptions, (option) => option.value))
          }
          style={{ ...commonStyle, minHeight: 80, padding: 8 }}
        >
          {getOptions(field).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    case 'CHECKBOX':
      return (
        <input
          id={`base-form-${field.id}`}
          aria-label={field.name}
          required={required}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          style={{ width: 16, height: 16, accentColor: '#3370ff' }}
        />
      )
    case 'LINK':
      return (
        <input
          id={`base-form-${field.id}`}
          aria-label={field.name}
          required={required}
          type="url"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://"
          style={commonStyle}
        />
      )
    case 'ATTACHMENT':
      return (
        <textarea
          id={`base-form-${field.id}`}
          aria-label={field.name}
          required={required}
          value={Array.isArray(value) ? value.join('\n') : typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder="每行一个本地文件路径，也可以用逗号分隔"
          rows={3}
          style={{ ...commonStyle, padding: 10, resize: 'vertical' }}
        />
      )
    default:
      return (
        <input
          id={`base-form-${field.id}`}
          aria-label={field.name}
          required={required}
          type="text"
          value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
          onChange={(event) => onChange(event.target.value)}
          style={commonStyle}
        />
      )
  }
}

export function FormView({
  tableSource,
  fields,
  tables = [],
  onCreateRecord,
  isSubmitting = false,
}: FormViewProps) {
  const writableFields = fields.filter((field) => !READONLY_FIELD_TYPES.has(field.type))
  const buildInitialValues = () =>
    Object.fromEntries(writableFields.map((field) => [field.key, emptyValue(field)]))
  const [values, setValues] = useState<Record<string, unknown>>(buildInitialValues)
  const [error, setError] = useState('')

  if (tableSource !== 'CUSTOM') {
    return (
      <div style={{ padding: 32, color: '#646a73', textAlign: 'center' }}>
        预置业务表不能通过表单新增镜像记录。
      </div>
    )
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedValues = Object.fromEntries(
      writableFields.map((field) => [field.key, normalizeFieldValue(field, values[field.key])])
    )
    const missingRequired = writableFields.filter(
      (field) => (field.isPrimary || field.isRequired) && isBlank(normalizedValues[field.key])
    )
    if (missingRequired.length) {
      setError(`请填写必填字段：${missingRequired.map((field) => field.name).join('、')}。`)
      return
    }
    setError('')
    try {
      await onCreateRecord({ values: normalizedValues })
      setValues(buildInitialValues())
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存记录失败，请稍后重试。')
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px' }}>
      <header style={{ marginBottom: 22 }}>
        <h2 style={{ margin: 0, color: '#1f2329', fontSize: 20 }}>新增记录</h2>
        <p style={{ margin: '6px 0 0', color: '#8f959e', fontSize: 13 }}>
          填写后直接写入当前自定义数据表。
        </p>
      </header>
      <form noValidate onSubmit={(event) => void submit(event)} style={{ display: 'grid', gap: 17 }}>
        {writableFields.map((field) => (
          <div key={field.id} style={{ display: 'grid', gap: 7 }}>
            <label htmlFor={`base-form-${field.id}`} style={{ color: '#1f2329', fontSize: 13 }}>
              {field.name}
              {field.isPrimary || field.isRequired ? <span style={{ marginLeft: 3, color: '#f54a45' }}>*</span> : null}
            </label>
            <FieldControl
              field={field}
              value={values[field.key]}
              required={field.isPrimary || field.isRequired}
              relationTargetTable={
                field.type === 'RELATION' && typeof field.config.targetTableId === 'string'
                  ? tables.find((table) => table.id === field.config.targetTableId)
                  : undefined
              }
              onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
            />
          </div>
        ))}
        {error ? (
          <p role="alert" style={{ margin: 0, color: '#f54a45', fontSize: 12 }}>
            {error}
          </p>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              height: 34,
              padding: '0 18px',
              border: 0,
              borderRadius: 6,
              background: '#3370ff',
              color: '#fff',
              fontWeight: 600,
              cursor: isSubmitting ? 'wait' : 'pointer',
              opacity: isSubmitting ? 0.6 : 1,
            }}
          >
            {isSubmitting ? '提交中…' : '提交记录'}
          </button>
        </div>
      </form>
    </div>
  )
}
