import { request } from '@/lib/http'

export type CalendarEventType = 'INTERVIEW' | 'REVIEW' | 'FOCUS' | 'OTHER'
export type CalendarEntrySource = 'CALENDAR_EVENT' | 'MEETING' | 'TASK'

export interface CalendarEntry {
  id: string
  sourceType: CalendarEntrySource
  sourceId: string
  title: string
  startAt: string
  endAt: string | null
  allDay: boolean
  type: CalendarEventType | 'MEETING' | 'TASK'
  projectId?: string | null
  location?: string | null
  link?: string | null
  notes?: string | null
}

export interface CalendarEventRecord {
  id: string
  title: string
  type: CalendarEventType
  startAt: string
  endAt: string
  allDay: boolean
  projectId: string | null
  location: string | null
  link: string | null
  notes: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ListCalendarEntriesParams {
  from: string
  to: string
}

export interface CreateCalendarEventInput {
  title: string
  type: CalendarEventType
  startAt: string
  endAt: string
  allDay: boolean
  projectId?: string
  location?: string
  link?: string
  notes?: string
}

export type UpdateCalendarEventInput = Partial<CreateCalendarEventInput>

export function listCalendarEntries(params: ListCalendarEntriesParams): Promise<CalendarEntry[]> {
  const query = new URLSearchParams({ from: params.from, to: params.to })
  return request<CalendarEntry[]>(`/calendar/entries?${query.toString()}`)
}

export function createCalendarEvent(
  input: CreateCalendarEventInput
): Promise<CalendarEventRecord> {
  return request<CalendarEventRecord>('/calendar/events', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateCalendarEvent(
  id: string,
  input: UpdateCalendarEventInput
): Promise<CalendarEventRecord> {
  return request<CalendarEventRecord>(`/calendar/events/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function archiveCalendarEvent(id: string): Promise<void> {
  return request<void>(`/calendar/events/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
