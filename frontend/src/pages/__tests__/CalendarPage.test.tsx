import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createCalendarEvent, listCalendarEntries, updateCalendarEvent, updateTask } = vi.hoisted(
  () => ({
    createCalendarEvent: vi.fn(),
    listCalendarEntries: vi.fn(),
    updateCalendarEvent: vi.fn(),
    updateTask: vi.fn(),
  })
)

vi.mock('@/modules/workbench/api/calendar', () => ({
  createCalendarEvent,
  listCalendarEntries,
  updateCalendarEvent,
}))
vi.mock('@/modules/workbench/api/tasks', () => ({ updateTask }))
vi.mock('@fullcalendar/react', () => ({
  default: ({
    events,
    eventDrop,
    initialView,
  }: {
    events: Array<{ id: string; title: string }>
    eventDrop: (input: {
      event: {
        id: string
        start: Date
        end: Date
        extendedProps: { sourceType: string; sourceId: string }
      }
      revert: () => void
    }) => void
    initialView: string
  }) => (
    <div data-testid="calendar" data-view={initialView}>
      {events.map((event) => <span key={event.id}>{event.title}</span>)}
      <button
        type="button"
        onClick={() =>
          eventDrop({
            event: {
              id: 'calendar-1',
              start: new Date('2026-07-22T02:00:00.000Z'),
              end: new Date('2026-07-22T03:00:00.000Z'),
              extendedProps: { sourceType: 'CALENDAR_EVENT', sourceId: 'calendar-1' },
            },
            revert: vi.fn(),
          })
        }
      >
        模拟拖动普通日程
      </button>
    </div>
  ),
}))

import CalendarPage from '../CalendarPage'

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('CalendarPage', () => {
  beforeEach(() => {
    createCalendarEvent.mockReset()
    listCalendarEntries.mockReset()
    updateCalendarEvent.mockReset()
    updateTask.mockReset()
    listCalendarEntries.mockResolvedValue([
      {
        id: 'CALENDAR_EVENT:calendar-1',
        sourceType: 'CALENDAR_EVENT',
        sourceId: 'calendar-1',
        title: '候选人面试',
        startAt: '2026-07-20T02:00:00.000Z',
        endAt: '2026-07-20T03:00:00.000Z',
        allDay: false,
        type: 'INTERVIEW',
      },
    ])
  })

  it('renders real entries and switches month, week and day views', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('候选人面试')).toBeInTheDocument()
    expect(screen.getByTestId('calendar')).toHaveAttribute('data-view', 'dayGridMonth')
    await user.click(screen.getByRole('button', { name: '周' }))
    expect(screen.getByTestId('calendar')).toHaveAttribute('data-view', 'timeGridWeek')
    await user.click(screen.getByRole('button', { name: '日' }))
    expect(screen.getByTestId('calendar')).toHaveAttribute('data-view', 'timeGridDay')
  })

  it('creates an interview event and persists a drag reschedule', async () => {
    createCalendarEvent.mockResolvedValue({ id: 'calendar-2' })
    updateCalendarEvent.mockResolvedValue({ id: 'calendar-1' })
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: '新建日程' }))
    await user.type(screen.getByLabelText('日程主题'), '明天面试')
    await user.type(screen.getByLabelText('开始时间'), '2026-07-21T10:00')
    await user.type(screen.getByLabelText('结束时间'), '2026-07-21T11:00')
    await user.click(screen.getByRole('button', { name: '保存日程' }))

    await waitFor(() => {
      expect(createCalendarEvent).toHaveBeenCalledWith(
        expect.objectContaining({ title: '明天面试', type: 'INTERVIEW' })
      )
    })

    await user.click(screen.getByRole('button', { name: '模拟拖动普通日程' }))
    await waitFor(() => {
      expect(updateCalendarEvent).toHaveBeenCalledWith('calendar-1', {
        startAt: '2026-07-22T02:00:00.000Z',
        endAt: '2026-07-22T03:00:00.000Z',
      })
    })
  })
})
