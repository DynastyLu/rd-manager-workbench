import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { Banner, Button, ButtonGroup, Checkbox, Input, Modal, Select, TextArea } from '@douyinfe/semi-ui'
import { IconCalendar, IconPlus } from '@douyinfe/semi-icons'
import { toast } from 'sonner'

import {
  archiveCalendarEvent,
  createCalendarEvent,
  listCalendarEntries,
  updateCalendarEvent,
  type CalendarEntry,
  type CalendarEventType,
  type CreateCalendarEventInput,
} from '@/modules/workbench/api/calendar'
import { listProjects } from '@/modules/workbench/api/projects'
import {
  archiveReminderRule,
  createReminderRule,
  listReminderRules,
} from '@/modules/workbench/api/notifications'
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false)
  const [referenceEntry, setReferenceEntry] = useState<CalendarEntry | null>(null)
  const [title, setTitle] = useState('')
  const [type, setType] = useState<CalendarEventType>('INTERVIEW')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [location, setLocation] = useState('')
  const [link, setLink] = useState('')
  const [notes, setNotes] = useState('')
  const [projectId, setProjectId] = useState<string | undefined>()
  const [allDay, setAllDay] = useState(false)
  const [reminderTimes, setReminderTimes] = useState([''])
  const [reminderRuleIds, setReminderRuleIds] = useState<string[]>([])
  const [isLoadingReminders, setIsLoadingReminders] = useState(false)
  const [validationMessage, setValidationMessage] = useState('')

  const entriesQuery = useQuery({
    queryKey: ['calendar', range],
    queryFn: () => listCalendarEntries(range),
  })
  const projectsQuery = useQuery({
    queryKey: ['projects', 'calendar-picker'],
    queryFn: () => listProjects({ pageSize: 100 }),
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
          entry,
        },
      })),
    [entriesQuery.data]
  )

  const createMutation = useMutation({
    mutationFn: async ({
      input,
      reminders,
    }: {
      input: CreateCalendarEventInput
      reminders: string[]
    }) => {
      const calendarEvent = await createCalendarEvent(input)
      await Promise.all(
        reminders.map((remindAt) =>
          createReminderRule({
            sourceType: 'CALENDAR_EVENT',
            sourceId: calendarEvent.id,
            remindAt,
          }),
        ),
      )
      return calendarEvent
    },
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
      setProjectId(undefined)
      setReminderTimes([''])
      setReminderRuleIds([])
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '保存日程失败'),
  })
  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      input,
      reminders,
      ruleIds,
    }: {
      id: string
      input: CreateCalendarEventInput
      reminders: string[]
      ruleIds: string[]
    }) => {
      const calendarEvent = await updateCalendarEvent(id, input)
      await Promise.all(ruleIds.map((ruleId) => archiveReminderRule(ruleId)))
      await Promise.all(
        reminders.map((remindAt) =>
          createReminderRule({ sourceType: 'CALENDAR_EVENT', sourceId: id, remindAt }),
        ),
      )
      return calendarEvent
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['calendar'] })
      toast.success('日程已更新')
      setIsCreateOpen(false)
      setEditingId(null)
      setIsArchiveConfirmOpen(false)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '更新日程失败'),
  })
  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveCalendarEvent(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['calendar'] })
      toast.success('日程已取消')
      setIsCreateOpen(false)
      setEditingId(null)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '取消日程失败'),
  })
  const rescheduleMutation = useMutation({
    mutationFn: async ({
      end,
      revert: _revert,
      sourceId,
      sourceType,
      start,
    }: {
      end: Date | null
      revert: () => void
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
        queryClient.invalidateQueries({ queryKey: ['my-work'] }),
      ])
      toast.success('时间已更新')
    },
    onError: (error, variables) => {
      variables.revert()
      toast.error(error instanceof Error ? error.message : '调整时间失败')
    },
  })

  function submitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedTitle = title.trim()
    const start = new Date(startAt)
    const end = new Date(endAt)
    const normalizedReminders = reminderTimes
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => new Date(value))
    if (!trimmedTitle || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setValidationMessage('请填写主题、开始时间和结束时间。')
      return
    }
    if (end <= start) {
      setValidationMessage('结束时间必须晚于开始时间。')
      return
    }
    if (normalizedReminders.some((value) => Number.isNaN(value.getTime()))) {
      setValidationMessage('提醒时间格式不正确。')
      return
    }
    if (normalizedReminders.some((value) => value > start)) {
      setValidationMessage('提醒时间不能晚于日程开始时间。')
      return
    }
    setValidationMessage('')
    const input: CreateCalendarEventInput = {
      title: trimmedTitle,
      type,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      allDay,
      ...(projectId ? { projectId } : {}),
      ...(location.trim() ? { location: location.trim() } : {}),
      ...(link.trim() ? { link: link.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    }
    const reminders = normalizedReminders.map((value) => value.toISOString())
    if (editingId) {
      updateMutation.mutate({ id: editingId, input, reminders, ruleIds: reminderRuleIds })
    } else createMutation.mutate({ input, reminders })
  }

  function resetForm() {
    setEditingId(null)
    setTitle('')
    setType('INTERVIEW')
    setStartAt('')
    setEndAt('')
    setLocation('')
    setLink('')
    setNotes('')
    setProjectId(undefined)
    setAllDay(false)
    setReminderTimes([''])
    setReminderRuleIds([])
    setValidationMessage('')
  }

  function openCreate(start?: Date, clickedAllDay = false) {
    resetForm()
    if (start) {
      const normalizedStart = new Date(start)
      if (clickedAllDay) normalizedStart.setHours(9, 0, 0, 0)
      setStartAt(toLocalDateTime(normalizedStart))
      setEndAt(toLocalDateTime(new Date(normalizedStart.getTime() + 60 * 60 * 1000)))
      setAllDay(clickedAllDay)
    }
    setIsCreateOpen(true)
  }

  function openEntry(entry: CalendarEntry) {
    if (entry.sourceType !== 'CALENDAR_EVENT') {
      setReferenceEntry(entry)
      return
    }
    setEditingId(entry.sourceId)
    setTitle(entry.title)
    setType(entry.type as CalendarEventType)
    setStartAt(toLocalDateTime(new Date(entry.startAt)))
    setEndAt(toLocalDateTime(new Date(entry.endAt ?? new Date(entry.startAt).getTime() + 3_600_000)))
    setLocation(entry.location ?? '')
    setLink(entry.link ?? '')
    setNotes(entry.notes ?? '')
    setProjectId(entry.projectId ?? undefined)
    setAllDay(entry.allDay)
    setIsLoadingReminders(true)
    void listReminderRules('CALENDAR_EVENT', entry.sourceId)
      .then((rules) => {
        setReminderRuleIds(rules.map((rule) => rule.id))
        setReminderTimes(
          rules.length ? rules.map((rule) => toLocalDateTime(new Date(rule.remindAt))) : [''],
        )
      })
      .catch(() => toast.error('无法读取日程提醒，请重试。'))
      .finally(() => setIsLoadingReminders(false))
    setValidationMessage('')
    setIsCreateOpen(true)
  }

  function confirmArchive() {
    if (!editingId) return
    setIsArchiveConfirmOpen(true)
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
                aria-pressed={view === option.value}
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
            onClick={() => openCreate()}
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
              revert,
            })
          }}
          eventClick={({ event }) => {
            const sourceType = String(event.extendedProps.sourceType ?? '')
            const sourceId = String(event.extendedProps.sourceId ?? '')
            const entry = entriesQuery.data?.find(
              (item) => item.sourceType === sourceType && item.sourceId === sourceId
            )
            if (entry) openEntry(entry)
          }}
          dateClick={({ date, allDay: clickedAllDay }) => {
            openCreate(date, clickedAllDay)
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
        title={editingId ? '编辑日程' : '新建日程'}
        visible={isCreateOpen}
        onCancel={() => {
          setIsCreateOpen(false)
          resetForm()
        }}
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
          <label htmlFor="calendar-project">
            <span>关联项目（可选）</span>
            <select
              id="calendar-project"
              name="projectId"
              value={projectId ?? ''}
              disabled={projectsQuery.isLoading}
              onChange={(event) => setProjectId(event.target.value || undefined)}
              className="calendar-page__native-select"
            >
              <option value="">不关联项目</option>
              {(projectsQuery.data?.data ?? []).map((project) => (
                <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
              ))}
            </select>
          </label>
          <Checkbox checked={allDay} onChange={(event) => setAllDay(Boolean(event.target.checked))}>
            全天日程
          </Checkbox>
          <fieldset className="calendar-page__reminders" disabled={isLoadingReminders}>
            <legend>提醒时间（可添加多个）</legend>
            {reminderTimes.map((value, index) => (
              <div key={index} className="calendar-page__reminder-row">
                <Input
                  type="datetime-local"
                  aria-label={`提醒时间 ${index + 1}`}
                  value={value}
                  onChange={(nextValue) =>
                    setReminderTimes((current) =>
                      current.map((item, itemIndex) => itemIndex === index ? nextValue : item)
                    )
                  }
                />
                {reminderTimes.length > 1 ? (
                  <Button
                    type="tertiary"
                    aria-label={`删除提醒时间 ${index + 1}`}
                    onClick={() =>
                      setReminderTimes((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                  >
                    删除
                  </Button>
                ) : null}
              </div>
            ))}
            <Button
              type="tertiary"
              onClick={() => setReminderTimes((current) => [...current, ''])}
            >
              添加提醒
            </Button>
          </fieldset>
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
            <label htmlFor="calendar-location"><span>地点（可选）</span><Input id="calendar-location" name="location" value={location} onChange={setLocation} /></label>
            <label htmlFor="calendar-link"><span>链接（可选）</span><Input id="calendar-link" name="link" type="url" value={link} onChange={setLink} /></label>
          </div>
          <label htmlFor="calendar-notes"><span>备注（可选）</span><TextArea id="calendar-notes" value={notes} onChange={setNotes} rows={3} /></label>
          {validationMessage ? <p role="alert" className="calendar-page__error">{validationMessage}</p> : null}
          <div className="calendar-page__form-actions">
            {editingId ? (
              <Button type="danger" onClick={confirmArchive} loading={archiveMutation.isPending}>
                取消日程
              </Button>
            ) : null}
            <Button
              htmlType="submit"
              theme="solid"
              type="primary"
              loading={createMutation.isPending || updateMutation.isPending}
            >
              {editingId ? '保存修改' : '保存日程'}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        title="确认取消日程"
        visible={isArchiveConfirmOpen}
        okText="确认取消日程"
        cancelText="返回"
        okButtonProps={{ type: 'danger' }}
        confirmLoading={archiveMutation.isPending}
        onCancel={() => setIsArchiveConfirmOpen(false)}
        onOk={() => {
          if (editingId) archiveMutation.mutate(editingId)
        }}
      >
        <p>取消后该日程将从日历隐藏，但历史数据仍会保留。</p>
      </Modal>
      <Modal
        title={referenceEntry?.title ?? '关联事项'}
        visible={Boolean(referenceEntry)}
        footer={<Button theme="solid" type="primary" onClick={() => setReferenceEntry(null)}>知道了</Button>}
        onCancel={() => setReferenceEntry(null)}
      >
        {referenceEntry ? (
          <div className="calendar-page__reference-detail">
            <p><strong>来源</strong>{referenceEntry.sourceType === 'MEETING' ? '会议' : '任务'}</p>
            <p><strong>时间</strong>{new Date(referenceEntry.startAt).toLocaleString('zh-CN')}</p>
            {referenceEntry.location ? <p><strong>地点</strong>{referenceEntry.location}</p> : null}
            {referenceEntry.notes ? <p><strong>备注</strong>{referenceEntry.notes}</p> : null}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
