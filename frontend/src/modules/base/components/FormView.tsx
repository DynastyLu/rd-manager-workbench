import { useState, type FormEvent } from 'react'

import type { DataField, DataTableSource } from '../types'

interface FormViewProps {
  tableSource: DataTableSource
  fields: DataField[]
  onCreateRecord: (input: { values: Record<string, unknown> }) => unknown
  isSubmitting?: boolean
}

interface SelectOption {
  label: string
  value: string
}

const READONLY_FIELD_TYPES = new Set(['CREATED_AT', 'UPDATED_AT'])

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
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

function emptyValue(field: DataField) {
  if (field.type === 'CHECKBOX') return false
  if (field.type === 'MULTI_SELECT') return []
  return ''
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: DataField
  value: unknown
  onChange: (value: unknown) => void
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
    case 'LONG_TEXT':
      return (
        <textarea
          id={`base-form-${field.id}`}
          aria-label={field.name}
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
        <input
          id={`base-form-${field.id}`}
          aria-label={field.name}
          type="datetime-local"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          style={commonStyle}
        />
      )
    case 'SINGLE_SELECT':
      return (
        <select
          id={`base-form-${field.id}`}
          aria-label={field.name}
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
          type="url"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://"
          style={commonStyle}
        />
      )
    default:
      return (
        <input
          id={`base-form-${field.id}`}
          aria-label={field.name}
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
    const missingPrimary = writableFields.some(
      (field) => field.isPrimary && isBlank(values[field.key])
    )
    if (missingPrimary) {
      setError('请填写主字段。')
      return
    }
    setError('')
    try {
      await onCreateRecord({ values })
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
      <form onSubmit={(event) => void submit(event)} style={{ display: 'grid', gap: 17 }}>
        {writableFields.map((field) => (
          <div key={field.id} style={{ display: 'grid', gap: 7 }}>
            <label htmlFor={`base-form-${field.id}`} style={{ color: '#1f2329', fontSize: 13 }}>
              {field.name}
              {field.isPrimary ? <span style={{ marginLeft: 3, color: '#f54a45' }}>*</span> : null}
            </label>
            <FieldControl
              field={field}
              value={values[field.key]}
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
