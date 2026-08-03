import { WorkspaceFormSelect } from '@/components/workspace/WorkspaceFormSelect'
import { useState, type FormEvent } from 'react'
import { Button, Checkbox, Input, InputNumber, Select, TextArea } from '@douyinfe/semi-ui'

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
        <TextArea
          id={`base-form-${field.id}`}
          aria-label={field.name}
          aria-required={required}
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          rows={4}
          autosize={{ minRows: 4, maxRows: 10 }}
        />
      )
    case 'NUMBER':
      return (
        <InputNumber
          id={`base-form-${field.id}`}
          aria-label={field.name}
          aria-required={required}
          value={typeof value === 'number' || typeof value === 'string' ? value : ''}
          onChange={(nextValue) => onChange(nextValue === '' ? '' : Number(nextValue))}
          style={{ width: '100%' }}
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
        <WorkspaceFormSelect
          id={`base-form-${field.id}`}
          aria-label={field.name}
          required={required}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          className="base-form-view__control"
        >
          <option value="">请选择</option>
          {getOptions(field).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </WorkspaceFormSelect>
      )
    case 'MULTI_SELECT':
      return (
        <>
          <span id={`base-form-${field.id}-label`} className="workspace-visually-hidden">
            {field.name}
          </span>
          <Select<string>
            id={`base-form-${field.id}`}
            aria-labelledby={`base-form-${field.id}-label`}
            aria-required={required}
            multiple
            value={Array.isArray(value) ? value.map(String) : []}
            onChange={(nextValue) => onChange(Array.isArray(nextValue) ? nextValue : [])}
            optionList={getOptions(field)}
            className="base-form-view__control"
            style={{ width: '100%' }}
          />
        </>
      )
    case 'CHECKBOX':
      return (
        <Checkbox
          id={`base-form-${field.id}`}
          aria-label={field.name}
          aria-required={required}
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        >
          已选择
        </Checkbox>
      )
    case 'LINK':
      return (
        <Input
          id={`base-form-${field.id}`}
          aria-label={field.name}
          aria-required={required}
          type="url"
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          placeholder="https://"
        />
      )
    case 'ATTACHMENT':
      return (
        <TextArea
          id={`base-form-${field.id}`}
          aria-label={field.name}
          aria-required={required}
          value={Array.isArray(value) ? value.join('\n') : typeof value === 'string' ? value : ''}
          onChange={onChange}
          placeholder="每行一个本地文件路径，也可以用逗号分隔"
          rows={3}
          autosize={{ minRows: 3, maxRows: 8 }}
        />
      )
    default:
      return (
        <Input
          id={`base-form-${field.id}`}
          aria-label={field.name}
          aria-required={required}
          value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
          onChange={onChange}
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
      <div className="base-form-view__unavailable">
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
    <div className="base-form-view workspace-form-surface">
      <header className="base-form-view__header">
        <h2>新增记录</h2>
        <p>
          填写后直接写入当前自定义数据表。
        </p>
      </header>
      <form className="base-form-view__form" noValidate onSubmit={(event) => void submit(event)}>
        {writableFields.map((field) => (
          <div
            key={field.id}
            className={`base-form-view__field base-form-view__field--${field.type.toLowerCase()}`}
          >
            <label htmlFor={`base-form-${field.id}`}>
              {field.name}
              {field.isPrimary || field.isRequired ? <span aria-hidden="true">*</span> : null}
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
          <p className="base-form-view__error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="base-form-view__actions workspace-section__footer">
          <Button htmlType="submit" theme="solid" type="primary" loading={isSubmitting}>
            {isSubmitting ? '提交中…' : '提交记录'}
          </Button>
        </div>
      </form>
    </div>
  )
}
