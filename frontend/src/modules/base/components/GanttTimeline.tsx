import { useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { BaseRecord } from '../types'

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

function addCalendarDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function addCalendarMonths(date: Date, months: number) {
  const next = new Date(date)
  const preferredDay = next.getDate()
  next.setDate(1)
  next.setMonth(next.getMonth() + months)
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  next.setDate(Math.min(preferredDay, lastDay))
  return next
}

function startOfCalendarDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function startOfCalendarWeek(date: Date) {
  const day = startOfCalendarDay(date)
  const weekday = day.getDay() || 7
  return addCalendarDays(day, 1 - weekday)
}

function startOfCalendarMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function nextCalendarMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1)
}

function dateLabel(date: Date, scale: GanttScale) {
  const month = date.getMonth() + 1
  if (scale === 'MONTH') return `${date.getFullYear()}年${month}月`
  if (scale === 'WEEK') return `${month}/${date.getDate()} 周`
  return `${month}月${date.getDate()}日`
}

// Pure date helpers are exported beside the timeline so drag math has one tested source of truth.
// eslint-disable-next-line react-refresh/only-export-components
export function shiftRange(start: string, end: string, days: number): GanttDateRange | null {
  const startDate = validDate(start)
  const endDate = validDate(end)
  if (!startDate || !endDate) return null
  return {
    start: addCalendarDays(startDate, days).toISOString(),
    end: addCalendarDays(endDate, days).toISOString(),
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
  const nextStart = edge === 'start' ? addCalendarDays(startDate, days) : startDate
  const nextEnd = edge === 'end' ? addCalendarDays(endDate, days) : endDate
  if (nextEnd.getTime() < nextStart.getTime()) return null
  return { start: nextStart.toISOString(), end: nextEnd.toISOString() }
}

// eslint-disable-next-line react-refresh/only-export-components
export function shiftRangeForScale(
  start: string,
  end: string,
  steps: number,
  scale: GanttScale
): GanttDateRange | null {
  if (scale === 'MONTH') {
    const startDate = validDate(start)
    const endDate = validDate(end)
    if (!startDate || !endDate) return null
    return {
      start: addCalendarMonths(startDate, steps).toISOString(),
      end: addCalendarMonths(endDate, steps).toISOString(),
    }
  }
  return shiftRange(start, end, steps * (scale === 'WEEK' ? 7 : 1))
}

// eslint-disable-next-line react-refresh/only-export-components
export function resizeRangeForScale(
  start: string,
  end: string,
  edge: GanttResizeEdge,
  steps: number,
  scale: GanttScale
): GanttDateRange | null {
  if (scale !== 'MONTH') {
    return resizeRange(start, end, edge, steps * (scale === 'WEEK' ? 7 : 1))
  }
  const startDate = validDate(start)
  const endDate = validDate(end)
  if (!startDate || !endDate) return null
  const nextStart = edge === 'start' ? addCalendarMonths(startDate, steps) : startDate
  const nextEnd = edge === 'end' ? addCalendarMonths(endDate, steps) : endDate
  if (nextEnd.getTime() < nextStart.getTime()) return null
  return { start: nextStart.toISOString(), end: nextEnd.toISOString() }
}

function buildUnits(rows: GanttTimelineRow[], scale: GanttScale, today: Date): TimelineUnit[] {
  const rowDates = rows
    .flatMap((row) => [validDate(row.start), validDate(row.end)])
    .filter(Boolean) as Date[]
  const timestamps = [...rowDates, today].map((date) => date.getTime())
  const earliest = new Date(Math.min(...timestamps))
  const latest = new Date(Math.max(...timestamps))
  const rangeStart = addCalendarDays(
    earliest,
    scale === 'MONTH' ? -35 : scale === 'WEEK' ? -14 : -7
  )
  const rangeEnd = addCalendarDays(latest, scale === 'MONTH' ? 70 : scale === 'WEEK' ? 42 : 21)
  const units: TimelineUnit[] = []

  if (scale === 'MONTH') {
    let cursor = startOfCalendarMonth(rangeStart)
    while (cursor <= rangeEnd) {
      const next = nextCalendarMonth(cursor)
      units.push({
        key: cursor.toISOString(),
        label: dateLabel(cursor, scale),
        start: cursor,
        end: next,
        width: SCALE_WIDTH[scale],
      })
      cursor = next
    }
    return units
  }

  const stepDays = scale === 'WEEK' ? 7 : 1
  let cursor = scale === 'WEEK' ? startOfCalendarWeek(rangeStart) : startOfCalendarDay(rangeStart)
  while (cursor <= rangeEnd) {
    const next = addCalendarDays(cursor, stepDays)
    units.push({
      key: cursor.toISOString(),
      label: dateLabel(cursor, scale),
      start: cursor,
      end: next,
      width: SCALE_WIDTH[scale],
    })
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

function dragSteps(deltaX: number, scale: GanttScale) {
  return Math.round(deltaX / SCALE_WIDTH[scale])
}

function formatRange(range: GanttDateRange) {
  const date = (value: string) =>
    new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(value))
  return `${date(range.start)} 至 ${date(range.end)}`
}

function calendarDateKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
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
  const centeredScaleRef = useRef<GanttScale | null>(null)
  const suppressClickRef = useRef(false)
  const today = useMemo(() => new Date(), [])
  const units = useMemo(() => buildUnits(rows, scale, today), [rows, scale, today])
  const timelineWidth = units.reduce((total, unit) => total + unit.width, 0)
  const todayLeft = positionForDate(today, units)
  const rowPixels = rowHeight === 'COMPACT' ? 38 : 46

  useLayoutEffect(() => {
    if (centeredScaleRef.current === scale) return
    const scroller = scrollRef.current
    if (!scroller) return
    scroller.scrollLeft = Math.max(0, todayLeft - scroller.clientWidth / 2)
    centeredScaleRef.current = scale
  }, [scale, todayLeft])

  function previewDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const steps = dragSteps(event.clientX - drag.startX, scale)
    const next =
      drag.mode === 'move'
        ? shiftRangeForScale(drag.original.start, drag.original.end, steps, scale)
        : resizeRangeForScale(drag.original.start, drag.original.end, drag.mode, steps, scale)
    if (!next) return
    drag.preview = next
    drag.moved = drag.moved || steps !== 0
    suppressClickRef.current = drag.moved
    setOptimisticRanges((current) => ({ ...current, [drag.row.record.id]: next }))
  }

  function releasePointer(event: React.PointerEvent<HTMLElement>) {
    if (typeof event.currentTarget.releasePointerCapture !== 'function') return
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // The pointer can already be released when the browser ends a gesture.
    }
  }

  function clearOptimisticRange(recordId: string) {
    setOptimisticRanges((current) => {
      const next = { ...current }
      delete next[recordId]
      return next
    })
  }

  async function persistRange(
    row: GanttTimelineRow,
    original: GanttDateRange,
    nextRange: GanttDateRange
  ) {
    const values =
      startFieldKey === endFieldKey
        ? { [startFieldKey]: nextRange.start }
        : { [startFieldKey]: nextRange.start, [endFieldKey]: nextRange.end }
    setUpdateError('')
    setOptimisticRanges((current) => ({ ...current, [row.record.id]: nextRange }))
    setPendingIds((current) => new Set(current).add(row.record.id))
    try {
      await onRecordChange(row.record.id, values)
    } catch {
      setOptimisticRanges((current) => ({ ...current, [row.record.id]: original }))
      setUpdateError('日期更新失败，已恢复原时间。')
    } finally {
      setPendingIds((current) => {
        const next = new Set(current)
        next.delete(row.record.id)
        return next
      })
    }
  }

  async function commitDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    releasePointer(event)
    if (
      !drag.moved ||
      (drag.preview.start === drag.original.start && drag.preview.end === drag.original.end)
    ) {
      clearOptimisticRange(drag.row.record.id)
      return
    }
    await persistRange(drag.row, drag.original, drag.preview)
  }

  function cancelDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    releasePointer(event)
    suppressClickRef.current = false
    clearOptimisticRange(drag.row.record.id)
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

  function keyboardChange(
    event: React.KeyboardEvent<HTMLElement>,
    row: GanttTimelineRow,
    mode: DragState['mode'],
    range: GanttDateRange
  ) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    if (row.readOnly || pendingIds.has(row.record.id)) return
    event.preventDefault()
    event.stopPropagation()
    const steps = event.key === 'ArrowRight' ? 1 : -1
    const next =
      mode === 'move'
        ? shiftRangeForScale(range.start, range.end, steps, scale)
        : resizeRangeForScale(range.start, range.end, mode, steps, scale)
    if (next) void persistRange(row, range, next)
  }

  return (
    <div
      className={`gantt-timeline gantt-timeline--${rowHeight.toLowerCase()}`}
      data-testid="gantt-timeline"
      style={
        {
          '--gantt-row-height': `${rowPixels}px`,
          '--gantt-grid-size': `${SCALE_WIDTH[scale]}px`,
        } as React.CSSProperties
      }
    >
      {updateError ? (
        <p className="gantt-timeline__error" role="alert">
          {updateError}
        </p>
      ) : null}
      <div className="gantt-timeline__records" ref={recordsRef}>
        <div className="gantt-timeline__records-header">记录</div>
        {rows.map((row) => (
          <div className="gantt-timeline__record" key={row.record.id}>
            <button
              type="button"
              aria-label={`打开记录：${row.title}`}
              onClick={() => onOpenRecord(row.record)}
            >
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
          <div
            className="gantt-timeline__header"
            style={{ gridTemplateColumns: units.map((unit) => `${unit.width}px`).join(' ') }}
          >
            {units.map((unit) => (
              <span key={unit.key}>{unit.label}</span>
            ))}
          </div>
          <div
            className="gantt-timeline__today"
            aria-label={`今天 ${calendarDateKey(today)}`}
            style={{ left: todayLeft }}
          >
            <span>今天</span>
          </div>
          {rows.map((row) => {
            const range = optimisticRanges[row.record.id] ?? { start: row.start, end: row.end }
            const start = validDate(range.start)
            const end = validDate(range.end)
            const left = start ? positionForDate(start, units) : 0
            const right = end ? positionForDate(end, units) : left
            const width = Math.max(
              6,
              right -
                left +
                (startFieldKey === endFieldKey
                  ? SCALE_WIDTH[scale] / (scale === 'WEEK' ? 7 : scale === 'MONTH' ? 30 : 1)
                  : 0)
            )
            return (
              <div
                className={`gantt-timeline__row${row.error ? ' gantt-timeline__row--error' : ''}`}
                key={row.record.id}
                style={{ width: timelineWidth }}
              >
                {!row.error && start && end ? (
                  <>
                    <button
                      type="button"
                      className={`gantt-timeline__bar${row.readOnly ? ' gantt-timeline__bar--readonly' : ''}${pendingIds.has(row.record.id) ? ' gantt-timeline__bar--pending' : ''}`}
                      data-testid={`gantt-bar-${row.record.id}`}
                      data-start={range.start}
                      data-end={range.end}
                      aria-disabled={row.readOnly || pendingIds.has(row.record.id)}
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
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onOpenRecord(row.record)
                          return
                        }
                        keyboardChange(event, row, 'move', range)
                      }}
                      onPointerDown={(event) => startDrag(event, row, 'move', range)}
                      onPointerMove={previewDrag}
                      onPointerUp={(event) => void commitDrag(event)}
                      onPointerCancel={cancelDrag}
                    >
                      <span>{row.title}</span>
                    </button>
                    {!row.readOnly && startFieldKey !== endFieldKey ? (
                      <button
                        type="button"
                        className="gantt-timeline__handle gantt-timeline__handle--start"
                        aria-label={`调整“${row.title}”的开始时间`}
                        style={{ left: Math.max(0, left - 1) }}
                        onPointerDown={(event) => startDrag(event, row, 'start', range)}
                        onPointerMove={previewDrag}
                        onPointerUp={(event) => void commitDrag(event)}
                        onPointerCancel={cancelDrag}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => keyboardChange(event, row, 'start', range)}
                      />
                    ) : null}
                    {!row.readOnly && startFieldKey !== endFieldKey ? (
                      <button
                        type="button"
                        className="gantt-timeline__handle gantt-timeline__handle--end"
                        aria-label={`调整“${row.title}”的结束时间`}
                        style={{ left: Math.max(0, left + width - 6) }}
                        onPointerDown={(event) => startDrag(event, row, 'end', range)}
                        onPointerMove={previewDrag}
                        onPointerUp={(event) => void commitDrag(event)}
                        onPointerCancel={cancelDrag}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => keyboardChange(event, row, 'end', range)}
                      />
                    ) : null}
                  </>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
