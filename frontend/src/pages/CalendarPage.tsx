import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { Banner, Button, ButtonGroup, Input, Modal, Select, TextArea } from '@douyinfe/semi-ui'
import { IconCalendar, IconPlus } from '@douyinfe/semi-icons'
import { toast } from 'sonner'

import {
  createCalendarEvent,
  listCalendarEntries,
  updateCalendarEvent,
  type CalendarEntry,
  type CalendarEventType,
  type CreateCalendarEventInput,
} from '@/modules/workbench/api/calendar'
import { updateTask } from '@/modules/workbench/api/tasks'
import './CalendarPage.less'

type CalendarView = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'

const VIEW_OPTIONS: Array<{ value: CalendarView; label: string }> = [
  { value: 'dayGridMonth', label: '月' },
  { value: 'timeGridWeek', label: '周' },
  { value: 'timeGridDay', label: '日' },
]

const EVENT_TYPE_OPTIONS: Array<{ value: CalendarEventType; label: string }> = [
  { value: 'INTERVIEW', label: '面试' },
  { value: 'REVIEW', label: '评审' },
  { value: 'FOCUS', label: '专注工作' },
  { value: 'OTHER', label: '其他日程' },
]

function initialRange() {
  const now = new Date()
  return {
    from: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(),
    to: new Date(now.getFullYear(), now.getMonth() + 2, 1).toISOString(),
  }
}

function eventColor(entry: CalendarEntry) {
  if (entry.sourceType === 'MEETING') return '#7b67ee'
  if (entry.sourceType === 'TASK') return '#d98909'
  if (entry.type === 'INTERVIEW') return '#00a870'
  if (entry.type === 'REVIEW') return '#3370ff'
  return '#5b65d6'
}

function toLocalDateTime(value: Date) {
  const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
  return shifted.toISOString().slice(0, 16)
}

export default function CalendarPage() {
  const queryClient = useQueryClient()
  const [view, setView] = useState<CalendarView>('dayGridMonth')
  const [range, setRange] = useState(initialRange)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [type, setType] = useState<CalendarEventType>('INTERVIEW')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [location, setLocation] = useState('')
  const [link, setLink] = useState('')
  const [notes, setNotes] = useState('')
  const [validationMessage, setValidationMessage] = useState('')

  const entriesQuery = useQuery({
    queryKey: ['calendar', range],
    queryFn: () => listCalendarEntries(range),
  })
  const events = useMemo(
    () =>
      (entriesQuery.data ?? []).map((entry) => ({
        id: `${entry.sourceType}:${entry.sourceId}`,
        title: entry.title,
        start: entry.startAt,
        end: entry.endAt ?? undefined,
        allDay: entry.allDay,
        editable: entry.sourceType !== 'MEETING',
        backgroundColor: eventColor(entry),
        borderColor: eventColor(entry),
        extendedProps: {
          sourceType: entry.sourceType,
          sourceId: entry.sourceId,
          projectId: entry.projectId,
        },
      })),
    [entriesQuery.data]
  )

  const createMutation = useMutation({
    mutationFn: (input: CreateCalendarEventInput) => createCalendarEvent(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['calendar'] })
      toast.success('日程已创建')
      setIsCreateOpen(false)
      setTitle('')
      setStartAt('')
      setEndAt('')
      setLocation('')
      setLink('')
      setNotes('')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '保存日程失败'),
  })
  const rescheduleMutation = useMutation({
    mutationFn: async ({
      end,
      sourceId,
      sourceType,
      start,
    }: {
      end: Date | null
      sourceId: string
      sourceType: string
      start: Date
    }) => {
      if (sourceType === 'CALENDAR_EVENT') {
        return updateCalendarEvent(sourceId, {
          startAt: start.toISOString(),
          ...(end ? { endAt: end.toISOString() } : {}),
        })
      }
      if (sourceType === 'TASK') return updateTask(sourceId, { dueAt: start.toISOString() })
      throw new Error('会议请从会议详情调整时间')
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      ])
      toast.success('时间已更新')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '调整时间失败'),
  })

  function submitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedTitle = title.trim()
    const start = new Date(startAt)
    const end = new Date(endAt)
    if (!trimmedTitle || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setValidationMessage('请填写主题、开始时间和结束时间。')
      return
    }
    if (end <= start) {
      setValidationMessage('结束时间必须晚于开始时间。')
      return
    }
    setValidationMessage('')
    const input: CreateCalendarEventInput = {
      title: trimmedTitle,
      type,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      allDay: false,
      ...(location.trim() ? { location: location.trim() } : {}),
      ...(link.trim() ? { link: link.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    }
    createMutation.mutate(input)
  }

  return (
    <div className="calendar-page">
      <header className="calendar-page__header">
        <div>
          <h1>日历</h1>
          <p>统一查看任务截止、会议、面试、评审和普通日程。</p>
        </div>
        <div className="calendar-page__actions">
          <ButtonGroup aria-label="日历视图">
            {VIEW_OPTIONS.map((option) => (
              <Button
                key={option.value}
                theme={view === option.value ? 'solid' : 'light'}
                type={view === option.value ? 'primary' : 'tertiary'}
                onClick={() => setView(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </ButtonGroup>
          <Button
            theme="solid"
            type="primary"
            icon={<IconPlus />}
            aria-label="新建日程"
            onClick={() => setIsCreateOpen(true)}
          >
            新建日程
          </Button>
        </div>
      </header>

      {entriesQuery.isError ? (
        <Banner
          type="danger"
          fullMode={false}
          title="无法读取日历"
          description="请确认本地服务已启动后重试。"
          closeIcon={null}
        >
          <Button onClick={() => void entriesQuery.refetch()}>重试</Button>
        </Banner>
      ) : null}

      <section className="calendar-page__surface" aria-label="工作日历">
        <FullCalendar
          key={view}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={view}
          headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
          buttonText={{ today: '今天' }}
          firstDay={1}
          height="auto"
          nowIndicator
          editable
          events={events}
          datesSet={({ start, end }) => {
            const next = { from: start.toISOString(), to: end.toISOString() }
            setRange((current) =>
              current.from === next.from && current.to === next.to ? current : next
            )
          }}
          eventDrop={({ event, revert }) => {
            if (!event.start) return revert()
            const sourceType = String(event.extendedProps.sourceType ?? '')
            const sourceId = String(event.extendedProps.sourceId ?? '')
            if (!sourceId || sourceType === 'MEETING') return revert()
            rescheduleMutation.mutate({
              sourceId,
              sourceType,
              start: event.start,
              end: event.end,
            })
          }}
          dateClick={({ date }) => {
            const start = new Date(date)
            start.setHours(9, 0, 0, 0)
            const end = new Date(start.getTime() + 60 * 60 * 1000)
            setStartAt(toLocalDateTime(start))
            setEndAt(toLocalDateTime(end))
            setIsCreateOpen(true)
          }}
          eventContent={(info) => (
            <div className="calendar-page__event">
              <span aria-hidden="true"><IconCalendar size="extra-small" /></span>
              <strong>{info.event.title}</strong>
            </div>
          )}
        />
      </section>

      <Modal
        title="新建日程"
        visible={isCreateOpen}
        onCancel={() => setIsCreateOpen(false)}
        footer={null}
        width={560}
      >
        <form className="calendar-page__form" onSubmit={submitEvent} noValidate>
          <label htmlFor="calendar-title">
            <span>日程主题</span>
            <Input id="calendar-title" aria-label="日程主题" value={title} onChange={setTitle} />
          </label>
          <label htmlFor="calendar-type">
            <span>日程类型</span>
            <Select
              id="calendar-type"
              aria-label="日程类型"
              value={type}
              onChange={(value) => setType(value as CalendarEventType)}
              optionList={EVENT_TYPE_OPTIONS}
            />
          </label>
          <div className="calendar-page__form-grid">
            <label htmlFor="calendar-start">
              <span>开始时间</span>
              <Input id="calendar-start" type="datetime-local" aria-label="开始时间" value={startAt} onChange={setStartAt} />
            </label>
            <label htmlFor="calendar-end">
              <span>结束时间</span>
              <Input id="calendar-end" type="datetime-local" aria-label="结束时间" value={endAt} onChange={setEndAt} />
            </label>
          </div>
          <div className="calendar-page__form-grid">
            <label htmlFor="calendar-location"><span>地点（可选）</span><Input id="calendar-location" value={location} onChange={setLocation} /></label>
            <label htmlFor="calendar-link"><span>链接（可选）</span><Input id="calendar-link" value={link} onChange={setLink} /></label>
          </div>
          <label htmlFor="calendar-notes"><span>备注（可选）</span><TextArea id="calendar-notes" value={notes} onChange={setNotes} rows={3} /></label>
          {validationMessage ? <p role="alert" className="calendar-page__error">{validationMessage}</p> : null}
          <Button htmlType="submit" theme="solid" type="primary" block loading={createMutation.isPending}>
            保存日程
          </Button>
        </form>
      </Modal>
    </div>
  )
}
