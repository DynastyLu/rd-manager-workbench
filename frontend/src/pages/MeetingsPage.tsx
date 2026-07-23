import { WorkspaceFormSelect } from '@/components/workspace/WorkspaceFormSelect'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Banner,
  Button,
  Empty,
  Input,
  Modal,
  SideSheet,
  Skeleton,
  TabPane,
  Tabs,
  Tag,
  TextArea,
} from '@douyinfe/semi-ui'
import { IconCalendar, IconPlus, IconUserGroup } from '@douyinfe/semi-icons'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { FileAttachments } from '@/modules/content/components/FileAttachments'
import { RichTextEditor } from '@/modules/content/components/RichTextEditor'
import { DateTimePickerField } from '@/components/FormControls/DateTimePickerField'

import {
  createDecision,
  createMeeting,
  createMeetingAction,
  createMeetingActionTask,
  createMeetingAgendaItem,
  createMeetingMinutesDocument,
  getMeeting,
  listMeetings,
  updateMeetingAction,
} from '@/modules/workbench/api/management'
import {
  archiveReminderRule,
  createReminderRule,
  listReminderRules,
} from '@/modules/workbench/api/notifications'
import { updateDocument } from '@/modules/workbench/api/documents'
import { AiBusinessAction } from '@/modules/workbench/components/extensions/AiBusinessAction'
import type { Meeting, MeetingAction, MeetingStatus } from '@/modules/workbench/types'
import './MeetingsPage.less'

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'PLANNED', label: '待召开' },
  { value: 'HELD', label: '已结束' },
  { value: 'CANCELLED', label: '已取消' },
]

const STATUS_LABEL: Record<MeetingStatus, string> = {
  PLANNED: '待召开',
  HELD: '已结束',
  CANCELLED: '已取消',
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '未设置'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '时间无效' : date.toLocaleString('zh-CN')
}

function toLocalDateTimeInput(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function compactTaskInput(action: MeetingAction, meeting: Meeting) {
  return {
    title: action.title,
    ...(action.description ? { description: action.description } : {}),
    ...(meeting.projectId ? { projectId: meeting.projectId } : {}),
    ...(action.ownerName ? { assigneeName: action.ownerName } : {}),
    ...(action.dueAt ? { dueAt: action.dueAt } : {}),
  }
}

function MeetingMinutesEditor({
  document,
}: {
  document: NonNullable<Meeting['minutesDocument']>
}) {
  const pendingSave = useRef<{
    content: Record<string, unknown>
    plainText: string
  } | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)
  const isSaving = useRef(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const content =
    document.content && typeof document.content === 'object' && !Array.isArray(document.content)
      ? document.content
      : {}
  const flushPendingSave = useCallback(async (): Promise<void> => {
    if (isSaving.current || !pendingSave.current) return
    const input = pendingSave.current
    pendingSave.current = null
    isSaving.current = true
    setSaveStatus('saving')
    try {
      await updateDocument(document.id, input)
      if (!pendingSave.current) setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    } finally {
      isSaving.current = false
      if (pendingSave.current) void flushPendingSave()
    }
  }, [document.id])

  useEffect(
    () => () => {
      if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current)
      void flushPendingSave()
    },
    [flushPendingSave],
  )

  return (
    <div className="meeting-detail__minutes-editor">
      <div className="meeting-detail__save-status" aria-live="polite">
        {saveStatus === 'saving' ? '正在自动保存…' : saveStatus === 'error' ? '自动保存失败，请继续编辑后重试' : '已自动保存'}
      </div>
      <RichTextEditor
        value={content}
        placeholder="记录讨论要点、结论和后续行动…"
        onChange={(nextContent, plainText) => {
          pendingSave.current = { content: nextContent, plainText }
          setSaveStatus('saving')
          if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current)
          saveTimer.current = window.setTimeout(() => {
            void flushPendingSave()
          }, 500)
        }}
      />
    </div>
  )
}

function MeetingDetail({
  meetingId,
  focusedFileId,
  onClose,
}: {
  meetingId: string | null
  focusedFileId?: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [agendaTitle, setAgendaTitle] = useState('')
  const [actionTitle, setActionTitle] = useState('')
  const [actionOwner, setActionOwner] = useState('')
  const [actionDueAt, setActionDueAt] = useState('')
  const [editingAction, setEditingAction] = useState<MeetingAction | null>(null)
  const [editActionTitle, setEditActionTitle] = useState('')
  const [editActionOwner, setEditActionOwner] = useState('')
  const [editActionDueAt, setEditActionDueAt] = useState('')
  const [decisionTitle, setDecisionTitle] = useState('')
  const [decisionBackground, setDecisionBackground] = useState('')
  const [decisionConclusion, setDecisionConclusion] = useState('')
  const [remindAt, setRemindAt] = useState('')

  const detailQuery = useQuery({
    queryKey: ['meeting', meetingId],
    queryFn: () => getMeeting(meetingId!),
    enabled: Boolean(meetingId),
  })
  const remindersQuery = useQuery({
    queryKey: ['reminders', 'MEETING', meetingId],
    queryFn: () => listReminderRules('MEETING', meetingId!),
    enabled: Boolean(meetingId),
  })

  async function refreshMeeting() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] }),
      queryClient.invalidateQueries({ queryKey: ['meetings'] }),
    ])
  }

  const agendaMutation = useMutation({
    mutationFn: (input: { title: string; sequence: number }) =>
      createMeetingAgendaItem(meetingId!, input),
    onSuccess: async () => {
      setAgendaTitle('')
      await refreshMeeting()
      toast.success('议题已添加')
    },
    onError: () => toast.error('添加议题失败，请重试。'),
  })
  const actionMutation = useMutation({
    mutationFn: (input: { title: string; ownerName?: string; dueAt?: string }) =>
      createMeetingAction(meetingId!, input),
    onSuccess: async () => {
      setActionTitle('')
      setActionOwner('')
      setActionDueAt('')
      await refreshMeeting()
      toast.success('行动项已添加')
    },
    onError: () => toast.error('添加行动项失败，请重试。'),
  })
  const updateActionMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<MeetingAction> }) =>
      updateMeetingAction(meetingId!, id, input),
    onSuccess: async () => {
      setEditingAction(null)
      await refreshMeeting()
    },
    onError: () => toast.error('更新行动项失败，请重试。'),
  })
  const taskMutation = useMutation({
    mutationFn: ({ action, meeting }: { action: MeetingAction; meeting: Meeting }) =>
      createMeetingActionTask(action.id, compactTaskInput(action, meeting)),
    onSuccess: async (result) => {
      await refreshMeeting()
      toast.success(result.alreadyExists ? '已关联现有任务' : '已转为任务')
    },
    onError: () => toast.error('转为任务失败，请重试。'),
  })
  const decisionMutation = useMutation({
    mutationFn: (meeting: Meeting) =>
      createDecision({
        title: decisionTitle.trim(),
        background: decisionBackground.trim() || null,
        conclusion: decisionConclusion.trim() || null,
        alternatives: [],
        meetingId: meeting.id,
        projectId: meeting.projectId,
        status: 'DECIDED',
        decidedAt: new Date().toISOString(),
      }),
    onSuccess: async () => {
      setDecisionTitle('')
      setDecisionBackground('')
      setDecisionConclusion('')
      await refreshMeeting()
      toast.success('会议决策已保存')
    },
    onError: () => toast.error('保存决策失败，请重试。'),
  })
  const minutesMutation = useMutation({
    mutationFn: () => createMeetingMinutesDocument(meetingId!),
    onSuccess: async () => {
      await refreshMeeting()
      toast.success('会议纪要已创建')
    },
    onError: () => toast.error('创建会议纪要失败，请重试。'),
  })
  const reminderMutation = useMutation({
    mutationFn: () =>
      createReminderRule({
        sourceType: 'MEETING',
        sourceId: meetingId!,
        remindAt: new Date(remindAt).toISOString(),
      }),
    onSuccess: async () => {
      setRemindAt('')
      await queryClient.invalidateQueries({ queryKey: ['reminders', 'MEETING', meetingId] })
      toast.success('会议提醒已添加')
    },
    onError: () => toast.error('添加提醒失败，请重试。'),
  })
  const removeReminderMutation = useMutation({
    mutationFn: archiveReminderRule,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['reminders', 'MEETING', meetingId] }),
  })

  const meeting = detailQuery.data

  return (
    <SideSheet
      visible={Boolean(meetingId)}
      onCancel={onClose}
      width={780}
      title={meeting ? <h2>{meeting.title}</h2> : '会议详情'}
      className="meeting-detail"
    >
      {detailQuery.isPending ? <Skeleton loading placeholder={<Skeleton.Paragraph rows={8} />} /> : null}
      {detailQuery.isError ? (
        <Banner
          type="danger"
          fullMode={false}
          title="无法读取会议详情"
          description="请检查本地服务后重试。"
          closeIcon={null}
        >
          <Button onClick={() => void detailQuery.refetch()}>重试</Button>
        </Banner>
      ) : null}
      {meeting ? (
        <Tabs type="line" keepDOM={false} defaultActiveKey={focusedFileId ? 'attachments' : undefined}>
          <TabPane tab="基本信息" itemKey="overview">
            <section className="meeting-detail__section">
              <dl className="meeting-detail__facts">
                <div><dt>时间</dt><dd>{formatDateTime(meeting.scheduledAt)}</dd></div>
                <div><dt>状态</dt><dd><Tag color="blue">{STATUS_LABEL[meeting.status]}</Tag></dd></div>
                <div><dt>项目</dt><dd>{meeting.projectId ?? '未关联项目'}</dd></div>
                <div><dt>参会人</dt><dd>{meeting.participantNames.length ? meeting.participantNames.join('、') : '未添加'}</dd></div>
              </dl>
              <div className="meeting-detail__subsection">
                <h3>会议提醒</h3>
                <div className="meeting-detail__inline-form">
                  <DateTimePickerField
                    aria-label="会议提醒时间"
                    value={remindAt}
                    onChange={setRemindAt}
                  />
                  <Button
                    theme="solid"
                    type="primary"
                    disabled={!remindAt}
                    loading={reminderMutation.isPending}
                    onClick={() => reminderMutation.mutate()}
                  >
                    添加提醒
                  </Button>
                </div>
                <div className="meeting-detail__chips">
                  {(remindersQuery.data ?? []).map((rule) => (
                    <Tag
                      key={rule.id}
                      closable
                      onClose={() => removeReminderMutation.mutate(rule.id)}
                    >
                      {formatDateTime(rule.remindAt)}
                    </Tag>
                  ))}
                  {remindersQuery.data?.length === 0 ? <span>尚未设置提醒</span> : null}
                </div>
              </div>
            </section>
          </TabPane>
          <TabPane tab="议程" itemKey="agenda">
            <section className="meeting-detail__section">
              <ol className="meeting-detail__list">
                {(meeting.agendaItems ?? []).map((item) => (
                  <li key={item.id}><span>{item.sequence}</span><div><strong>{item.title}</strong>{item.description ? <p>{item.description}</p> : null}</div></li>
                ))}
              </ol>
              <form
                className="meeting-detail__inline-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!agendaTitle.trim()) return
                  agendaMutation.mutate({
                    title: agendaTitle.trim(),
                    sequence: (meeting.agendaItems?.length ?? 0) + 1,
                  })
                }}
              >
                <Input aria-label="议题标题" placeholder="新增议题" value={agendaTitle} onChange={setAgendaTitle} />
                <Button htmlType="submit" theme="solid" type="primary" loading={agendaMutation.isPending}>添加议题</Button>
              </form>
            </section>
          </TabPane>
          <TabPane tab="纪要" itemKey="minutes">
            <section className="meeting-detail__section">
              <div className="meeting-detail__ai-action">
                <AiBusinessAction
                  operation="AI_SUMMARIZE_MEETING"
                  objectId={meeting.id}
                  objectLabel={meeting.title}
                  buttonLabel="AI 生成纪要"
                  adoptLabel="采纳到会议纪要"
                />
              </div>
              {meeting.minutesDocument ? (
                <MeetingMinutesEditor key={meeting.minutesDocument.id} document={meeting.minutesDocument} />
              ) : (
                <div className="meeting-detail__integration">
                  <strong>还没有会议纪要</strong>
                  <p>创建后使用统一富文本编辑器自动保存，并与知识库、版本历史共用同一正文。</p>
                  <Button theme="solid" type="primary" loading={minutesMutation.isPending} onClick={() => minutesMutation.mutate()}>
                    创建会议纪要
                  </Button>
                </div>
              )}
            </section>
          </TabPane>
          <TabPane tab="行动项" itemKey="actions">
            <section className="meeting-detail__section">
              <div className="meeting-detail__list">
                {(meeting.actions ?? []).map((action) => (
                  <article key={action.id} className="meeting-detail__action">
                    <div>
                      <strong>{action.title}</strong>
                      <p>{action.ownerName ?? '未分配'} · {formatDateTime(action.dueAt)}</p>
                    </div>
                    <div className="meeting-detail__row-actions">
                      {action.status !== 'DONE' ? (
                        <Button size="small" onClick={() => updateActionMutation.mutate({ id: action.id, input: { status: 'DONE' } })}>完成</Button>
                      ) : <Tag color="green">已完成</Tag>}
                      <Button
                        size="small"
                        theme="borderless"
                        aria-label={`编辑：${action.title}`}
                        onClick={() => {
                          setEditingAction(action)
                          setEditActionTitle(action.title)
                          setEditActionOwner(action.ownerName ?? '')
                          setEditActionDueAt(toLocalDateTimeInput(action.dueAt))
                        }}
                      >
                        编辑
                      </Button>
                      {action.taskId ? (
                        <Link to={`/my-work?taskId=${encodeURIComponent(action.taskId)}`}>查看任务</Link>
                      ) : (
                        <Button
                          size="small"
                          theme="solid"
                          type="primary"
                          aria-label={`转为任务：${action.title}`}
                          loading={taskMutation.isPending}
                          onClick={() => taskMutation.mutate({ action, meeting })}
                        >
                          转为任务
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              <form
                className="meeting-detail__action-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!actionTitle.trim()) return
                  actionMutation.mutate({
                    title: actionTitle.trim(),
                    ...(actionOwner.trim() ? { ownerName: actionOwner.trim() } : {}),
                    ...(actionDueAt ? { dueAt: new Date(actionDueAt).toISOString() } : {}),
                  })
                }}
              >
                <Input aria-label="行动项标题" placeholder="新增行动项" value={actionTitle} onChange={setActionTitle} />
                <Input aria-label="负责人" placeholder="负责人" value={actionOwner} onChange={setActionOwner} />
                <DateTimePickerField aria-label="截止时间" value={actionDueAt} onChange={setActionDueAt} />
                <Button htmlType="submit" theme="solid" type="primary" loading={actionMutation.isPending}>添加行动项</Button>
              </form>
            </section>
          </TabPane>
          <TabPane tab="决策" itemKey="decisions">
            <section className="meeting-detail__section">
              <div className="meeting-detail__list">
                {(meeting.decisions ?? []).map((decision) => (
                  <article key={decision.id} className="meeting-detail__decision">
                    <strong>{decision.title}</strong>
                    {decision.background ? <p>背景：{decision.background}</p> : null}
                    {decision.conclusion ? <p>结论：{decision.conclusion}</p> : null}
                    <time>{formatDateTime(decision.decidedAt)}</time>
                  </article>
                ))}
              </div>
              <form
                className="meeting-detail__stack-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (decisionTitle.trim()) decisionMutation.mutate(meeting)
                }}
              >
                <Input aria-label="决策标题" placeholder="决策标题" value={decisionTitle} onChange={setDecisionTitle} />
                <TextArea aria-label="决策背景" placeholder="背景" value={decisionBackground} onChange={setDecisionBackground} />
                <TextArea aria-label="决策结论" placeholder="结论与影响" value={decisionConclusion} onChange={setDecisionConclusion} />
                <Button htmlType="submit" theme="solid" type="primary" loading={decisionMutation.isPending}>保存决策</Button>
              </form>
            </section>
          </TabPane>
          <TabPane tab="附件" itemKey="attachments">
            <section className="meeting-detail__section">
              <FileAttachments
                associations={{ meetingId: meeting.id }}
                focusedFileId={focusedFileId}
              />
            </section>
          </TabPane>
        </Tabs>
      ) : null}
      <Modal
        title="编辑行动项"
        visible={Boolean(editingAction)}
        footer={null}
        onCancel={() => setEditingAction(null)}
        width={480}
      >
        <form
          className="meeting-detail__stack-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (!editingAction || !editActionTitle.trim()) return
            updateActionMutation.mutate({
              id: editingAction.id,
              input: {
                title: editActionTitle.trim(),
                ownerName: editActionOwner.trim() || null,
                dueAt: editActionDueAt ? new Date(editActionDueAt).toISOString() : null,
                status: editingAction.status,
              },
            })
          }}
        >
          <Input aria-label="编辑行动项标题" value={editActionTitle} onChange={setEditActionTitle} />
          <Input aria-label="编辑行动项负责人" value={editActionOwner} onChange={setEditActionOwner} />
          <DateTimePickerField aria-label="编辑行动项截止时间" value={editActionDueAt} onChange={setEditActionDueAt} />
          <Button htmlType="submit" theme="solid" type="primary" loading={updateActionMutation.isPending}>保存行动项</Button>
        </form>
      </Modal>
    </SideSheet>
  )
}

export function MeetingsWorkspace({ embedded = false }: { embedded?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const projectId = searchParams.get('projectId')?.trim() || undefined
  const selectedMeetingId = searchParams.get('meetingId')?.trim() || null
  const focusedFileId = searchParams.get('fileId')?.trim() || undefined
  const [status, setStatus] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(1)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [participants, setParticipants] = useState('')
  const queryClient = useQueryClient()
  const filters = {
    page,
    pageSize: 20,
    ...(projectId ? { projectId } : {}),
    ...(status ? { status } : {}),
    ...(startDate ? { startFrom: new Date(`${startDate}T00:00`).toISOString() } : {}),
    ...(endDate ? { startTo: new Date(`${endDate}T23:59:59.999`).toISOString() } : {}),
  }
  const meetingsQuery = useQuery({
    queryKey: ['meetings', filters],
    queryFn: () => listMeetings(filters),
  })
  const createMeetingMutation = useMutation({
    mutationFn: () => {
      const participantNames = participants.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean)
      return createMeeting({
        title: title.trim(),
        scheduledAt: new Date(scheduledAt).toISOString(),
        ...(projectId ? { projectId } : {}),
        ...(participantNames.length ? { participantNames } : {}),
      })
    },
    onSuccess: async (meeting) => {
      await queryClient.invalidateQueries({ queryKey: ['meetings'] })
      setIsCreateOpen(false)
      setTitle('')
      setScheduledAt('')
      setParticipants('')
      const next = new URLSearchParams(searchParams)
      next.set('meetingId', meeting.id)
      setSearchParams(next)
      toast.success('会议已创建')
    },
    onError: () => toast.error('创建会议失败，请重试。'),
  })

  function openMeeting(id: string) {
    const next = new URLSearchParams(searchParams)
    next.set('meetingId', id)
    setSearchParams(next)
  }

  function closeMeeting() {
    const next = new URLSearchParams(searchParams)
    next.delete('meetingId')
    setSearchParams(next)
  }

  function submitMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim() || !scheduledAt) return
    createMeetingMutation.mutate()
  }

  return (
    <div className={embedded ? 'meetings-workspace meetings-workspace--embedded' : 'meetings-workspace'}>
      <header className="meetings-workspace__header">
        <div>
          <span className="meetings-workspace__eyebrow">会议</span>
          <h1>{embedded ? '会议列表' : '会议与行动项'}</h1>
          <p>{projectId ? '当前仅显示本项目会议' : '把议程、纪要、决策和行动项放在同一个工作流里。'}</p>
        </div>
        <Button aria-label="新建会议" theme="solid" type="primary" icon={<IconPlus />} onClick={() => setIsCreateOpen(true)}>新建会议</Button>
      </header>

      <div className="meetings-workspace__toolbar">
        <div className="meetings-workspace__filters">
          <WorkspaceFormSelect aria-label="会议状态" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}>
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </WorkspaceFormSelect>
          <label htmlFor="meeting-start-date"><span>从</span><DateTimePickerField id="meeting-start-date" aria-label="会议开始日期" mode="date" value={startDate} onChange={(value) => { setStartDate(value); setPage(1) }} /></label>
          <label htmlFor="meeting-end-date"><span>至</span><DateTimePickerField id="meeting-end-date" aria-label="会议结束日期" mode="date" value={endDate} onChange={(value) => { setEndDate(value); setPage(1) }} /></label>
        </div>
        <span>{meetingsQuery.data?.meta.total ?? 0} 场会议</span>
      </div>

      {meetingsQuery.isPending ? <Skeleton loading placeholder={<Skeleton.Paragraph rows={5} />} /> : null}
      {meetingsQuery.isError ? (
        <Banner type="danger" fullMode={false} title="无法读取会议" description="请确认本地服务已启动后重试。" closeIcon={null}>
          <Button onClick={() => void meetingsQuery.refetch()}>重试</Button>
        </Banner>
      ) : null}
      {meetingsQuery.data?.data.length === 0 ? <Empty title="还没有会议" description="创建第一场会议开始记录议程和行动项。" /> : null}
      {meetingsQuery.data?.data.length ? (
        <section className="meetings-workspace__list" aria-label="会议列表">
          {meetingsQuery.data.data.map((meeting) => (
            <button key={meeting.id} type="button" className="meetings-workspace__row" onClick={() => openMeeting(meeting.id)}>
              <span className="meetings-workspace__date"><IconCalendar />{formatDateTime(meeting.scheduledAt)}</span>
              <strong>{meeting.title}</strong>
              <span><IconUserGroup />{meeting.participantNames.length ? `${meeting.participantNames.length} 人` : '未添加参会人'}</span>
              <Tag color={meeting.status === 'CANCELLED' ? 'grey' : meeting.status === 'HELD' ? 'green' : 'blue'}>{STATUS_LABEL[meeting.status]}</Tag>
            </button>
          ))}
        </section>
      ) : null}

      {meetingsQuery.data && meetingsQuery.data.meta.total > meetingsQuery.data.meta.pageSize ? (
        <nav className="meetings-workspace__pagination" aria-label="会议分页">
          <Button disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>上一页</Button>
          <span>第 {page} / {Math.ceil(meetingsQuery.data.meta.total / meetingsQuery.data.meta.pageSize)} 页</span>
          <Button
            disabled={page * meetingsQuery.data.meta.pageSize >= meetingsQuery.data.meta.total}
            onClick={() => setPage((current) => current + 1)}
          >
            下一页
          </Button>
        </nav>
      ) : null}

      <Modal title="新建会议" visible={isCreateOpen} footer={null} onCancel={() => setIsCreateOpen(false)} width={520}>
        <form className="meetings-workspace__form" onSubmit={submitMeeting}>
          <label htmlFor="meeting-title"><span>会议标题</span><Input id="meeting-title" aria-label="会议标题" placeholder="会议标题" value={title} onChange={setTitle} /></label>
          <label htmlFor="meeting-scheduled-at"><span>开始时间</span><DateTimePickerField id="meeting-scheduled-at" aria-label="会议开始时间" value={scheduledAt} onChange={setScheduledAt} required /></label>
          <label htmlFor="meeting-participants"><span>参会人</span><Input id="meeting-participants" aria-label="参会人" placeholder="使用逗号分隔" value={participants} onChange={setParticipants} /></label>
          <Button htmlType="submit" theme="solid" type="primary" disabled={!title.trim() || !scheduledAt} loading={createMeetingMutation.isPending}>保存会议</Button>
        </form>
      </Modal>
      <MeetingDetail
        meetingId={selectedMeetingId}
        focusedFileId={focusedFileId}
        onClose={closeMeeting}
      />
    </div>
  )
}

export default MeetingsWorkspace
