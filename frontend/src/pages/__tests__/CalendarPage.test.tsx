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
vi.mock('../MeetingsPage', () => ({
  MeetingsWorkspace: () => <section aria-label="会议工作区">会议工作区</section>,
}))
vi.mock('@/modules/workbench/components/extensions/SyncBusinessAction', () => ({
  SyncBusinessAction: ({ buttonLabel, target }: { buttonLabel: string; target: { type: string } }) => (
    <button type="button" data-target-type={target.type}>{buttonLabel}</button>
  ),
}))
vi.mock('@fullcalendar/react', () => ({
  default: ({
    events,
    eventDrop,
    eventClick,
    dateClick,
    initialView,
    locale,
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
    dateClick: (input: { date: Date; allDay: boolean }) => void
    initialView: string
    locale?: { code?: string }
  }) => (
    <div data-testid="calendar" data-view={initialView} data-locale={locale?.code ?? ''}>
      {events.map((event) => <span key={event.id}>{event.title}</span>)}
      <button
        type="button"
        onClick={() => dateClick({ date: new Date('2026-07-21T10:00:00'), allDay: false })}
      >
        模拟点击日历日期
      </button>
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
      <button
        type="button"
        onClick={() =>
          eventClick({
            event: {
              extendedProps: { sourceType: 'MEETING', sourceId: 'meeting-1' },
            },
          })
        }
      >
        打开会议
      </button>
    </div>
  ),
}))

import CalendarPage from '../CalendarPage'

function renderPage(path = '/calendar') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
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
    expect(screen.getByTestId('calendar')).toHaveAttribute('data-locale', 'zh-cn')
    await user.click(screen.getByRole('button', { name: '周' }))
    expect(screen.getByTestId('calendar')).toHaveAttribute('data-view', 'timeGridWeek')
    await user.click(screen.getByRole('button', { name: '日' }))
    expect(screen.getByTestId('calendar')).toHaveAttribute('data-view', 'timeGridDay')
  })

  it('offers a server-authoritative external calendar preflight', async () => {
    renderPage()

    const sync = await screen.findByRole('button', { name: '外部日历同步' })
    expect(sync).toHaveAttribute('data-target-type', 'CALENDAR')
  })

  it('uses Semi date and select controls throughout the schedule form', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()

    await user.click(screen.getByRole('button', { name: '新建日程' }))
    const dialog = screen.getByRole('dialog', { name: '新建日程' })

    expect(dialog.querySelectorAll('input[type="datetime-local"]')).toHaveLength(0)
    expect(dialog.querySelectorAll('input[type="date"]')).toHaveLength(0)
    expect(dialog.querySelectorAll('select')).toHaveLength(0)
    expect(dialog.querySelectorAll('.semi-datepicker')).toHaveLength(3)
    expect(dialog.querySelectorAll('.semi-select')).toHaveLength(2)
    expect(container.querySelector('.calendar-page__native-select')).not.toBeInTheDocument()
  })

  it('creates an interview event and persists a drag reschedule', async () => {
    createCalendarEvent.mockResolvedValue({ id: 'calendar-2' })
    updateCalendarEvent.mockResolvedValue({ id: 'calendar-1' })
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: '模拟点击日历日期' }))
    await user.type(screen.getByLabelText('日程主题'), '明天面试')
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

  it('opens a meeting workspace from URL and from a calendar meeting entry', async () => {
    const user = userEvent.setup()
    const first = renderPage('/calendar?meetingId=meeting-1')
    expect(screen.getByLabelText('会议工作区')).toBeInTheDocument()
    first.unmount()

    listCalendarEntries.mockResolvedValue([
      {
        id: 'MEETING:meeting-1',
        sourceType: 'MEETING',
        sourceId: 'meeting-1',
        title: '项目周会',
        startAt: '2026-07-20T02:00:00.000Z',
        endAt: null,
        allDay: false,
        type: 'MEETING',
      },
    ])
    renderPage()
    await screen.findByText('项目周会')
    await user.click(screen.getByRole('button', { name: '打开会议' }))
    expect(screen.getByLabelText('会议工作区')).toBeInTheDocument()
  })
})
