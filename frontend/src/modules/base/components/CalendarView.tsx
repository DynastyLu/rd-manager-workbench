import zhCnLocale from '@fullcalendar/core/locales/zh-cn'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'

import type { DataField, DataRecord } from '../types'

interface CalendarViewProps {
  fields: DataField[]
  records: DataRecord[]
  dateFieldKey?: string
  initialDate?: string
  onDateFieldChange?: (fieldKey: string) => void
  onOpenRecord?: (record: DataRecord) => void
}

function getRecordTitle(record: DataRecord, fields: DataField[]) {
  const primaryField = fields.find((field) => field.isPrimary) ?? fields[0]
  if (!primaryField) return '未命名记录'
  const value = record.values[primaryField.key]
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '未命名记录'
}

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime())
}

export function CalendarView({
  fields,
  records,
  dateFieldKey,
  initialDate,
  onDateFieldChange,
  onOpenRecord,
}: CalendarViewProps) {
  const dateFields = fields.filter((field) => field.type === 'DATETIME')
  const dateField = dateFields.find((field) => field.key === dateFieldKey) ?? dateFields[0]
  const recordByEventId = new Map(records.map((record) => [`base-record:${record.id}`, record]))
  const events = dateField
    ? records.flatMap((record) => {
        const start = record.values[dateField.key]
        if (!isValidDate(start)) return []
        return [
          {
            id: `base-record:${record.id}`,
            title: getRecordTitle(record, fields),
            start,
            backgroundColor: '#3370ff',
            borderColor: '#3370ff',
          },
        ]
      })
    : []

  if (!dateField) {
    return (
      <div style={{ padding: 32, color: '#646a73', textAlign: 'center' }}>
        请先添加日期字段，再创建日历视图。
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label htmlFor="base-calendar-field" style={{ color: '#646a73', fontSize: 12 }}>
          日期字段
        </label>
        <select
          id="base-calendar-field"
          value={dateField.key}
          onChange={(event) => onDateFieldChange?.(event.target.value)}
          style={{ height: 30, border: '1px solid #dee0e3', borderRadius: 6, background: '#fff' }}
        >
          {dateFields.map((field) => (
            <option key={field.id} value={field.key}>
              {field.name}
            </option>
          ))}
        </select>
      </div>
      <div
        style={{ padding: 14, border: '1px solid #e5e6eb', borderRadius: 10, background: '#fff' }}
      >
        <FullCalendar
          plugins={[dayGridPlugin]}
          locale={zhCnLocale}
          initialView="dayGridMonth"
          initialDate={initialDate}
          events={events}
          height="auto"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
          buttonText={{ today: '今天' }}
          dayMaxEvents={3}
          eventClick={({ event }) => {
            const record = recordByEventId.get(event.id)
            if (record) onOpenRecord?.(record)
          }}
        />
      </div>
    </div>
  )
}
