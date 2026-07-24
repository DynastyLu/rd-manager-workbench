import type { EmployeeProgressPeriod } from './types'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year || 1970, (month || 1) - 1, day || 1)
}

export function weekStartOf(date: Date): Date {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const offset = (day.getDay() + 6) % 7
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - offset)
}

export function monthStartOf(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function snapPeriodStart(periodType: EmployeeProgressPeriod, date: Date): string {
  return formatLocalDate(periodType === 'WEEK' ? weekStartOf(date) : monthStartOf(date))
}

export function defaultPeriodStart(periodType: EmployeeProgressPeriod, today = new Date()): string {
  return snapPeriodStart(periodType, today)
}

export function convertPeriodStart(
  from: EmployeeProgressPeriod,
  to: EmployeeProgressPeriod,
  periodStart: string
): string {
  if (from === to) return periodStart
  return snapPeriodStart(to, parseLocalDate(periodStart))
}

export function shiftPeriodStart(
  periodType: EmployeeProgressPeriod,
  periodStart: string,
  offset: number
): string {
  const date = parseLocalDate(periodStart)
  if (periodType === 'WEEK') {
    return formatLocalDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset * 7))
  }
  return formatLocalDate(new Date(date.getFullYear(), date.getMonth() + offset, 1))
}

export function recentPeriodStarts(
  periodType: EmployeeProgressPeriod,
  periodStart: string,
  count: number
): string[] {
  return Array.from({ length: count }, (_, index) => shiftPeriodStart(periodType, periodStart, -index))
}

export function trendPeriodLabel(periodType: EmployeeProgressPeriod, periodStart: string): string {
  return periodType === 'WEEK' ? periodStart.slice(5) : periodStart.slice(0, 7)
}
