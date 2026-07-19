import { useEffect, useMemo, useRef, useState } from 'react'

import type { BaseRecord } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

export type GanttScale = 'DAY' | 'WEEK' | 'MONTH'
export type GanttResizeEdge = 'start' | 'end'

export interface GanttDateRange {
  start: string
  end: string
}

export interface GanttTimelineRow extends GanttDateRange {
  record: BaseRecord
  title: string
  readOnly: boolean
  error?: string
}

interface TimelineUnit {
  key: string
  label: string
  start: Date
  end: Date
  width: number
}

interface DragState {
  pointerId: number
  startX: number
  mode: 'move' | GanttResizeEdge
  row: GanttTimelineRow
  original: GanttDateRange
  preview: GanttDateRange
  moved: boolean
}

const SCALE_WIDTH: Record<GanttScale, number> = {
  DAY: 40,
  WEEK: 112,
  MONTH: 132,
}

function validDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS)
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function startOfUtcWeek(date: Date) {
  const day = startOfUtcDay(date)
  const weekday = day.getUTCDay() || 7
  return addUtcDays(day, 1 - weekday)
}

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function nextUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
}

function dateLabel(date: Date, scale: GanttScale) {
  const month = date.getUTCMonth() + 1
  if (scale === 'MONTH') return `${date.getUTCFullYear()}年${month}月`
  if (scale === 'WEEK') return `${month}/${date.getUTCDate()} 周`
  return `${month}月${date.getUTCDate()}日`
}

// Pure date helpers are exported beside the timeline so drag math has one tested source of truth.
// eslint-disable-next-line react-refresh/only-export-components
export function shiftRange(start: string, end: string, days: number): GanttDateRange | null {
  const startDate = validDate(start)
  const endDate = validDate(end)
  if (!startDate || !endDate) return null
  return {
    start: addUtcDays(startDate, days).toISOString(),
    end: addUtcDays(endDate, days).toISOString(),
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function resizeRange(
  start: string,
  end: string,
  edge: GanttResizeEdge,
  days: number
): GanttDateRange | null {
  const startDate = validDate(start)
  const endDate = validDate(end)
  if (!startDate || !endDate) return null
  const nextStart = edge === 'start' ? addUtcDays(startDate, days) : startDate
  const nextEnd = edge === 'end' ? addUtcDays(endDate, days) : endDate
  if (nextEnd.getTime() < nextStart.getTime()) return null
  return { start: nextStart.toISOString(), end: nextEnd.toISOString() }
}

function buildUnits(rows: GanttTimelineRow[], scale: GanttScale, today: Date): TimelineUnit[] {
  const rowDates = rows.flatMap((row) => [validDate(row.start), validDate(row.end)]).filter(Boolean) as Date[]
  const timestamps = [...rowDates, today].map((date) => date.getTime())
  const earliest = new Date(Math.min(...timestamps))
  const latest = new Date(Math.max(...timestamps))
  const rangeStart = addUtcDays(earliest, scale === 'MONTH' ? -35 : scale === 'WEEK' ? -14 : -7)
  const rangeEnd = addUtcDays(latest, scale === 'MONTH' ? 70 : scale === 'WEEK' ? 42 : 21)
  const units: TimelineUnit[] = []

  if (scale === 'MONTH') {
    let cursor = startOfUtcMonth(rangeStart)
    while (cursor <= rangeEnd && units.length < 48) {
      const next = nextUtcMonth(cursor)
      units.push({ key: cursor.toISOString(), label: dateLabel(cursor, scale), start: cursor, end: next, width: SCALE_WIDTH[scale] })
      cursor = next
    }
    return units
  }

  const stepDays = scale === 'WEEK' ? 7 : 1
  let cursor = scale === 'WEEK' ? startOfUtcWeek(rangeStart) : startOfUtcDay(rangeStart)
  while (cursor <= rangeEnd && units.length < 180) {
    const next = addUtcDays(cursor, stepDays)
    units.push({ key: cursor.toISOString(), label: dateLabel(cursor, scale), start: cursor, end: next, width: SCALE_WIDTH[scale] })
    cursor = next
  }
  return units
}

function positionForDate(date: Date, units: TimelineUnit[]) {
  let left = 0
  for (const unit of units) {
    if (date < unit.end) {
      const duration = unit.end.getTime() - unit.start.getTime()
      const progress = Math.max(0, Math.min(1, (date.getTime() - unit.start.getTime()) / duration))
      return left + progress * unit.width
    }
    left += unit.width
  }
  return left
}

function dragDays(deltaX: number, scale: GanttScale) {
  const daysPerUnit = scale === 'WEEK' ? 7 : scale === 'MONTH' ? 30 : 1
  return Math.round((deltaX * daysPerUnit) / SCALE_WIDTH[scale])
}

function formatRange(range: GanttDateRange) {
  const date = (value: string) =>
    new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(value))
  return `${date(range.start)} 至 ${date(range.end)}`
}

export function GanttTimeline({
  rows,
  scale,
  rowHeight,
  startFieldKey,
  endFieldKey,
  onRecordChange,
  onOpenRecord,
}: {
  rows: GanttTimelineRow[]
  scale: GanttScale
  rowHeight: 'COMPACT' | 'STANDARD'
  startFieldKey: string
  endFieldKey: string
  onRecordChange: (recordId: string, values: Record<string, unknown>) => Promise<unknown> | void
  onOpenRecord: (record: BaseRecord) => void
}) {
  const [optimisticRanges, setOptimisticRanges] = useState<Record<string, GanttDateRange>>({})
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set())
  const [updateError, setUpdateError] = useState('')
  const dragRef = useRef<DragState | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const recordsRef = useRef<HTMLDivElement | null>(null)
  const suppressClickRef = useRef(false)
  const today = useMemo(() => new Date(), [])
  const units = useMemo(() => buildUnits(rows, scale, today), [rows, scale, today])
  const timelineWidth = units.reduce((total, unit) => total + unit.width, 0)
  const todayLeft = positionForDate(today, units)
  const rowPixels = rowHeight === 'COMPACT' ? 38 : 46

  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    scroller.scrollLeft = Math.max(0, todayLeft - scroller.clientWidth / 2)
  }, [scale, todayLeft])

  function previewDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const days = dragDays(event.clientX - drag.startX, scale)
    const next = drag.mode === 'move'
      ? shiftRange(drag.original.start, drag.original.end, days)
      : resizeRange(drag.original.start, drag.original.end, drag.mode, days)
    if (!next) return
    drag.preview = next
    drag.moved = drag.moved || days !== 0
    suppressClickRef.current = drag.moved
    setOptimisticRanges((current) => ({ ...current, [drag.row.record.id]: next }))
  }

  async function commitDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (typeof event.currentTarget.releasePointerCapture === 'function') {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // The pointer can already be released when the browser ends a gesture.
      }
    }
    if (!drag.moved || (drag.preview.start === drag.original.start && drag.preview.end === drag.original.end)) {
      setOptimisticRanges((current) => {
        const next = { ...current }
        delete next[drag.row.record.id]
        return next
      })
      return
    }

    const values = startFieldKey === endFieldKey
      ? { [startFieldKey]: drag.preview.start }
      : { [startFieldKey]: drag.preview.start, [endFieldKey]: drag.preview.end }
    setUpdateError('')
    setPendingIds((current) => new Set(current).add(drag.row.record.id))
    try {
      await onRecordChange(drag.row.record.id, values)
    } catch {
      setOptimisticRanges((current) => {
        const next = { ...current }
        delete next[drag.row.record.id]
        return next
      })
      setUpdateError('日期更新失败，已恢复原时间。')
    } finally {
      setPendingIds((current) => {
        const next = new Set(current)
        next.delete(drag.row.record.id)
        return next
      })
    }
  }

  function startDrag(
    event: React.PointerEvent<HTMLElement>,
    row: GanttTimelineRow,
    mode: DragState['mode'],
    range: GanttDateRange
  ) {
    if (row.readOnly || pendingIds.has(row.record.id) || event.button !== 0) return
    event.stopPropagation()
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    suppressClickRef.current = false
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      mode,
      row,
      original: range,
      preview: range,
      moved: false,
    }
  }

  return (
    <div className={`gantt-timeline gantt-timeline--${rowHeight.toLowerCase()}`} data-testid="gantt-timeline" style={{ '--gantt-row-height': `${rowPixels}px` } as React.CSSProperties}>
      {updateError ? <p className="gantt-timeline__error" role="alert">{updateError}</p> : null}
      <div className="gantt-timeline__records" ref={recordsRef}>
        <div className="gantt-timeline__records-header">记录</div>
        {rows.map((row) => (
          <div className="gantt-timeline__record" key={row.record.id}>
            <button type="button" aria-label={`打开记录：${row.title}`} onClick={() => onOpenRecord(row.record)}>
              <span>{row.title}</span>
              {row.readOnly ? <small>只读</small> : null}
            </button>
            {row.error ? <p>{row.error}</p> : null}
          </div>
        ))}
      </div>
      <div
        className="gantt-timeline__scroller"
        ref={scrollRef}
        onScroll={(event) => {
          if (recordsRef.current) recordsRef.current.scrollTop = event.currentTarget.scrollTop
        }}
      >
        <div className="gantt-timeline__canvas" style={{ width: timelineWidth }}>
          <div className="gantt-timeline__header" style={{ gridTemplateColumns: units.map((unit) => `${unit.width}px`).join(' ') }}>
            {units.map((unit) => <span key={unit.key}>{unit.label}</span>)}
          </div>
          <div className="gantt-timeline__today" aria-label={`今天 ${today.toISOString().slice(0, 10)}`} style={{ left: todayLeft }}><span>今天</span></div>
          {rows.map((row) => {
            const range = optimisticRanges[row.record.id] ?? { start: row.start, end: row.end }
            const start = validDate(range.start)
            const end = validDate(range.end)
            const left = start ? positionForDate(start, units) : 0
            const right = end ? positionForDate(end, units) : left
            const width = Math.max(6, right - left + (startFieldKey === endFieldKey ? SCALE_WIDTH[scale] / (scale === 'WEEK' ? 7 : scale === 'MONTH' ? 30 : 1) : 0))
            return (
              <div className={`gantt-timeline__row${row.error ? ' gantt-timeline__row--error' : ''}`} key={row.record.id} style={{ width: timelineWidth }}>
                {!row.error && start && end ? (
                  <div
                    className={`gantt-timeline__bar${row.readOnly ? ' gantt-timeline__bar--readonly' : ''}${pendingIds.has(row.record.id) ? ' gantt-timeline__bar--pending' : ''}`}
                    data-testid={`gantt-bar-${row.record.id}`}
                    data-start={range.start}
                    data-end={range.end}
                    role="button"
                    tabIndex={0}
                    aria-disabled={row.readOnly ? 'true' : 'false'}
                    aria-label={`${row.title}，${formatRange(range)}`}
                    style={{ left, width }}
                    onClick={() => {
                      if (suppressClickRef.current) {
                        suppressClickRef.current = false
                        return
                      }
                      onOpenRecord(row.record)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') onOpenRecord(row.record)
                    }}
                    onPointerDown={(event) => startDrag(event, row, 'move', range)}
                    onPointerMove={previewDrag}
                    onPointerUp={(event) => void commitDrag(event)}
                    onPointerCancel={(event) => void commitDrag(event)}
                  >
                    {!row.readOnly && startFieldKey !== endFieldKey ? (
                      <button
                        type="button"
                        className="gantt-timeline__handle gantt-timeline__handle--start"
                        aria-label={`调整“${row.title}”的开始时间`}
                        onPointerDown={(event) => startDrag(event, row, 'start', range)}
                        onPointerMove={previewDrag}
                        onPointerUp={(event) => void commitDrag(event)}
                        onPointerCancel={(event) => void commitDrag(event)}
                        onClick={(event) => event.stopPropagation()}
                      />
                    ) : null}
                    <span>{row.title}</span>
                    {!row.readOnly && startFieldKey !== endFieldKey ? (
                      <button
                        type="button"
                        className="gantt-timeline__handle gantt-timeline__handle--end"
                        aria-label={`调整“${row.title}”的结束时间`}
                        onPointerDown={(event) => startDrag(event, row, 'end', range)}
                        onPointerMove={previewDrag}
                        onPointerUp={(event) => void commitDrag(event)}
                        onPointerCancel={(event) => void commitDrag(event)}
                        onClick={(event) => event.stopPropagation()}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
