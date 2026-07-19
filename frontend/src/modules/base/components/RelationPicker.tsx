import { useMemo, useState } from 'react'
import { Empty, Spin } from '@douyinfe/semi-ui'

import { useBaseRecords } from '../hooks'
import type { BaseRecord, DataField, DataTable, RelationFieldConfig } from '../types'

function readRelationConfig(field: DataField): RelationFieldConfig | null {
  const config = field.config
  return typeof config.targetTableId === 'string'
    ? {
        targetTableId: config.targetTableId,
        multiple: config.multiple === true,
        relationMode: config.relationMode === 'TWO_WAY' ? 'TWO_WAY' : 'ONE_WAY',
        ...(typeof config.inverseFieldId === 'string'
          ? { inverseFieldId: config.inverseFieldId }
          : {}),
      }
    : null
}

function recordLabel(record: BaseRecord, targetTable: DataTable) {
  const primary = targetTable.fields?.find((field) => field.isPrimary) ?? targetTable.fields?.[0]
  const value = primary ? record.values[primary.key] : null
  if (typeof value === 'string' || typeof value === 'number') return String(value) || '未命名记录'
  return '未命名记录'
}

function selectedIds(value: unknown, multiple: boolean) {
  if (multiple) {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && Boolean(item))
      : []
  }
  return typeof value === 'string' && value ? [value] : []
}

export function RelationValue({
  field,
  targetTable,
  value,
}: {
  field: DataField
  targetTable: DataTable
  value: unknown
}) {
  const config = readRelationConfig(field)
  const recordsQuery = useBaseRecords(config?.targetTableId ?? null, { page: 1, pageSize: 500 })
  const ids = selectedIds(value, config?.multiple === true)
  if (!ids.length) return <>—</>
  if (recordsQuery.isPending) return <>正在读取…</>
  if (recordsQuery.isError) return <span title="目标记录读取失败">⚠ 无法读取关联记录</span>
  const records = new Map((recordsQuery.data?.data ?? []).map((record) => [record.id, record]))
  return (
    <>
      {ids
        .map((id) =>
          records.has(id) ? recordLabel(records.get(id)!, targetTable) : '目标记录不可用'
        )
        .join('、')}
    </>
  )
}

export function RelationPicker({
  field,
  targetTable,
  value,
  onChange,
  disabled = false,
  onComplete,
}: {
  field: DataField
  targetTable: DataTable
  value: unknown
  onChange: (value: string | string[]) => void
  disabled?: boolean
  onComplete?: () => void
}) {
  const config = readRelationConfig(field)
  const [query, setQuery] = useState('')
  const recordsQuery = useBaseRecords(config?.targetTableId ?? null, { page: 1, pageSize: 500 })
  const selected = useMemo(
    () => selectedIds(value, config?.multiple === true),
    [config?.multiple, value]
  )

  if (!config) {
    return <span className="relation-picker__legacy">请先在字段管理中补全目标数据表</span>
  }

  const toggle = (recordId: string) => {
    if (config.multiple) {
      const next = selected.includes(recordId)
        ? selected.filter((id) => id !== recordId)
        : [...selected, recordId]
      onChange(next)
      return
    }
    onChange(selected[0] === recordId ? '' : recordId)
  }
  const knownRecords = new Map((recordsQuery.data?.data ?? []).map((record) => [record.id, record]))
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const resultRecords = (recordsQuery.data?.data ?? []).filter(
    (record) =>
      !selected.includes(record.id) &&
      (!normalizedQuery ||
        recordLabel(record, targetTable).toLocaleLowerCase().includes(normalizedQuery))
  )

  return (
    <div className="relation-picker" aria-label={`${field.name}关联选择器`}>
      {selected.length ? (
        <div className="relation-picker__selected" aria-label="已选记录">
          {selected.map((recordId) => (
            <span key={recordId}>
              {knownRecords.has(recordId)
                ? recordLabel(knownRecords.get(recordId)!, targetTable)
                : '目标记录不可用'}
              <button
                type="button"
                aria-label={`移除${knownRecords.has(recordId) ? recordLabel(knownRecords.get(recordId)!, targetTable) : recordId}`}
                disabled={disabled}
                onClick={() => toggle(recordId)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <input
        type="search"
        aria-label={`搜索${targetTable.name}记录`}
        placeholder={`搜索${targetTable.name}`}
        value={query}
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="relation-picker__results" role="group" aria-label={`${targetTable.name}记录`}>
        {recordsQuery.isPending ? <Spin size="small" tip="加载记录" /> : null}
        {recordsQuery.isError ? (
          <button type="button" onClick={() => void recordsQuery.refetch()}>
            加载失败，点击重试
          </button>
        ) : null}
        {recordsQuery.isSuccess && resultRecords.length === 0 ? (
          <Empty title="没有匹配记录" description="换个关键词试试" />
        ) : null}
        {resultRecords.map((record) => {
          const label = recordLabel(record, targetTable)
          return (
            <label key={record.id}>
              <input
                type="checkbox"
                aria-label={`选择${label}`}
                checked={false}
                disabled={disabled}
                onChange={() => toggle(record.id)}
              />
              <span>{label}</span>
            </label>
          )
        })}
      </div>
      {config.multiple && onComplete ? (
        <button type="button" className="relation-picker__complete" onClick={onComplete}>
          完成选择
        </button>
      ) : null}
    </div>
  )
}
