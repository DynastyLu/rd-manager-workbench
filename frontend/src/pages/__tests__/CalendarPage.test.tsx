import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { archiveCalendarEvent, archiveReminderRule, createCalendarEvent, createReminderRule, listCalendarEntries, listProjects, listReminderRules, updateCalendarEvent, updateTask } = vi.hoisted(
  () => ({
    archiveCalendarEvent: vi.fn(),
    archiveReminderRule: vi.fn(),
    createCalendarEvent: vi.fn(),
    createReminderRule: vi.fn(),
    listCalendarEntries: vi.fn(),
    listProjects: vi.fn(),
    listReminderRules: vi.fn(),
    updateCalendarEvent: vi.fn(),
    updateTask: vi.fn(),
  })
)

vi.mock('@/modules/workbench/api/calendar', () => ({
  archiveCalendarEvent,
  createCalendarEvent,
  listCalendarEntries,
  updateCalendarEvent,
}))
vi.mock('@/modules/workbench/api/projects', () => ({ listProjects }))
vi.mock('@/modules/workbench/api/tasks', () => ({ updateTask }))
vi.mock('@/modules/workbench/api/notifications', () => ({
  archiveReminderRule,
  createReminderRule,
  listReminderRules,
}))
vi.mock('@fullcalendar/react', () => ({
  default: ({
    events,
    eventDrop,
    eventClick,
    initialView,
  }: {
    events: Array<{ id: string; title: string; extendedProps: { sourceType: string; sourceId: string } }>
    eventDrop: (input: {
      event: {
        id: string
        start: Date
        end: Date
        extendedProps: { sourceType: string; sourceId: string }
      }
      revert: () => void
    }) => void
    eventClick: (input: { event: { extendedProps: { sourceType: string; sourceId: string } } }) => void
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
      <button
        type="button"
        onClick={() =>
          eventClick({
            event: {
              extendedProps: { sourceType: 'CALENDAR_EVENT', sourceId: 'calendar-1' },
            },
          })
        }
      >
        打开普通日程
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
    archiveCalendarEvent.mockReset()
    archiveReminderRule.mockReset()
    createReminderRule.mockReset()
    listReminderRules.mockReset()
    listReminderRules.mockResolvedValue([])
    listProjects.mockReset()
    listProjects.mockResolvedValue({
      data: [{ id: 'project-1', name: '工作台重构', code: 'RD-001' }],
      meta: { page: 1, pageSize: 100, total: 1 },
    })
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
    createReminderRule.mockResolvedValue({ id: 'rule-1' })
    updateCalendarEvent.mockResolvedValue({ id: 'calendar-1' })
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: '新建日程' }))
    await user.type(screen.getByLabelText('日程主题'), '明天面试')
    await user.type(screen.getByLabelText('开始时间'), '2026-07-21T10:00')
    await user.type(screen.getByLabelText('结束时间'), '2026-07-21T11:00')
    await waitFor(() => expect(screen.getByLabelText('关联项目（可选）')).not.toBeDisabled())
    await user.selectOptions(screen.getByLabelText('关联项目（可选）'), 'project-1')
    await user.type(screen.getByLabelText('提醒时间 1'), '2026-07-21T09:30')
    await user.click(screen.getByRole('button', { name: '保存日程' }))

    await waitFor(() => {
      expect(createCalendarEvent).toHaveBeenCalledWith(
        expect.objectContaining({ title: '明天面试', type: 'INTERVIEW', projectId: 'project-1' })
      )
    })
    await waitFor(() => {
      expect(createReminderRule).toHaveBeenCalledWith({
        sourceType: 'CALENDAR_EVENT',
        sourceId: 'calendar-2',
        remindAt: new Date('2026-07-21T09:30').toISOString(),
      })
    })

    await user.click(screen.getByRole('button', { name: '模拟拖动普通日程' }))
    await waitFor(() => {
      expect(updateCalendarEvent).toHaveBeenCalledWith('calendar-1', {
        startAt: '2026-07-22T02:00:00.000Z',
        endAt: '2026-07-22T03:00:00.000Z',
      })
    })
  })

  it('opens, edits and cancels a calendar event', async () => {
    updateCalendarEvent.mockResolvedValue({ id: 'calendar-1' })
    archiveCalendarEvent.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('候选人面试')
    await user.click(screen.getByRole('button', { name: '打开普通日程' }))
    expect(screen.getByRole('dialog', { name: '编辑日程' })).toBeInTheDocument()

    await user.clear(screen.getByLabelText('日程主题'))
    await user.type(screen.getByLabelText('日程主题'), '技术复试')
    await user.click(screen.getByRole('button', { name: '保存修改' }))
    await waitFor(() => {
      expect(updateCalendarEvent).toHaveBeenCalledWith(
        'calendar-1',
        expect.objectContaining({ title: '技术复试' })
      )
    })

    await user.click(screen.getByRole('button', { name: '打开普通日程' }))
    await user.click(screen.getByRole('button', { name: '取消日程' }))
    await user.click(screen.getByRole('button', { name: 'confirm' }))
    await waitFor(() => expect(archiveCalendarEvent).toHaveBeenCalledWith('calendar-1'))
  })
})
