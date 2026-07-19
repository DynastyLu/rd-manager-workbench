import { useMemo } from 'react'

import type { BaseRecord, DataField, GanttViewConfig } from '../types'
import { GanttTimeline, type GanttScale, type GanttTimelineRow } from './GanttTimeline'

function dateValue(value: unknown) {
  if (typeof value !== 'string' || !value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function recordTitle(record: BaseRecord, titleField?: DataField) {
  const value = titleField ? record.values[titleField.key] : undefined
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    const text = String(value).trim()
    if (text) return text
  }
  return '未命名记录'
}

function fieldIsReadOnly(field: DataField, record: BaseRecord) {
  if (field.config.readOnly === true) return true
  const readOnlyRecordTypes = Array.isArray(field.config.readOnlyRecordTypes)
    ? field.config.readOnlyRecordTypes.filter((item): item is string => typeof item === 'string')
    : []
  const recordType = typeof record.values.recordType === 'string' ? record.values.recordType : ''
  return Boolean(recordType && readOnlyRecordTypes.includes(recordType))
}

function DateFieldSetup({
  fields,
  config,
  onConfigChange,
}: {
  fields: DataField[]
  config: GanttViewConfig
  onConfigChange: (config: GanttViewConfig) => void
}) {
  const dateFields = fields.filter((field) => field.type === 'DATETIME')
  return (
    <div className="gantt-view__setup" role="status">
      <div>
        <strong>请先配置开始时间和结束时间</strong>
        <p>甘特任务条会直接读写原记录中的日期字段。</p>
      </div>
      <label>
        <span>开始字段</span>
        <select
          aria-label="甘特开始字段"
          value={config.startFieldKey ?? ''}
          onChange={(event) => onConfigChange({ ...config, startFieldKey: event.target.value || undefined })}
        >
          <option value="">请选择</option>
          {dateFields.map((field) => <option key={field.id} value={field.key}>{field.name}</option>)}
        </select>
      </label>
      <label>
        <span>结束字段</span>
        <select
          aria-label="甘特结束字段"
          value={config.endFieldKey ?? ''}
          onChange={(event) => onConfigChange({ ...config, endFieldKey: event.target.value || undefined })}
        >
          <option value="">请选择</option>
          {dateFields.map((field) => <option key={field.id} value={field.key}>{field.name}</option>)}
        </select>
      </label>
    </div>
  )
}

export function GanttView({
  fields,
  records,
  config,
  onConfigChange,
  onRecordChange,
  onOpenRecord,
}: {
  fields: DataField[]
  records: BaseRecord[]
  config: GanttViewConfig
  onConfigChange: (config: GanttViewConfig) => void
  onRecordChange: (recordId: string, values: Record<string, unknown>) => Promise<unknown> | void
  onOpenRecord: (record: BaseRecord) => void
}) {
  const titleField = fields.find((field) => field.key === config.titleFieldKey)
    ?? fields.find((field) => field.isPrimary)
  const startField = fields.find((field) => field.key === config.startFieldKey && field.type === 'DATETIME')
  const endField = fields.find((field) => field.key === config.endFieldKey && field.type === 'DATETIME')
  const scale: GanttScale = config.scale ?? 'WEEK'
  const rowHeight = config.rowHeight ?? 'STANDARD'

  const { scheduledRows, unplannedRows } = useMemo(() => {
    const scheduled: GanttTimelineRow[] = []
    const unplanned: Array<{ record: BaseRecord; title: string }> = []
    if (!startField || !endField) return { scheduledRows: scheduled, unplannedRows: unplanned }

    for (const record of records) {
      const title = recordTitle(record, titleField)
      const start = dateValue(record.values[startField.key])
      const end = dateValue(record.values[endField.key])
      if (!start || !end) {
        unplanned.push({ record, title })
        continue
      }
      scheduled.push({
        record,
        title,
        start,
        end,
        readOnly: fieldIsReadOnly(startField, record) || fieldIsReadOnly(endField, record),
        ...(new Date(end).getTime() < new Date(start).getTime()
          ? { error: '结束时间早于开始时间' }
          : {}),
      })
    }
    return { scheduledRows: scheduled, unplannedRows: unplanned }
  }, [endField, records, startField, titleField])

  if (!startField || !endField) {
    return <DateFieldSetup fields={fields} config={config} onConfigChange={onConfigChange} />
  }

  return (
    <section className="gantt-view">
      <header className="gantt-view__toolbar">
        <div>
          <strong>甘特视图</strong>
          <span>{records.length} 条记录</span>
        </div>
        <div className="gantt-view__scale" role="group" aria-label="甘特缩放">
          {([['DAY', '日'], ['WEEK', '周'], ['MONTH', '月']] as const).map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={scale === value}
              onClick={() => onConfigChange({ ...config, scale: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <GanttTimeline
        rows={scheduledRows}
        scale={scale}
        rowHeight={rowHeight}
        startFieldKey={startField.key}
        endFieldKey={endField.key}
        onRecordChange={onRecordChange}
        onOpenRecord={onOpenRecord}
      />

      {unplannedRows.length ? (
        <section className="gantt-view__unplanned" data-testid="gantt-unplanned">
          <h3>未排期 <span>{unplannedRows.length}</span></h3>
          <div>
            {unplannedRows.map(({ record, title }) => (
              <button type="button" key={record.id} onClick={() => onOpenRecord(record)}>
                <span>{title}</span>
                <small>缺少开始或结束时间</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  )
}
