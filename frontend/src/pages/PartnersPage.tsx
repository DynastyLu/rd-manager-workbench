import { WorkspaceFormSelect } from '@/components/workspace/WorkspaceFormSelect'
import { useState, type ReactNode } from 'react'
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
  Toast,
} from '@douyinfe/semi-ui'
import { IconBriefcase, IconPlus, IconSearch, IconUserGroup } from '@douyinfe/semi-icons'
import { Link, useSearchParams } from 'react-router-dom'
import { DateTimePickerField } from '@/components/FormControls/DateTimePickerField'

import {
  archiveAgreement,
  archiveCommunication,
  archiveContact,
  archivePartner,
  createAgreement,
  createCommunication,
  createCommunicationTask,
  createContact,
  createPartner,
  getPartner,
  linkPartnerProject,
  listPartners,
  unlinkPartnerProject,
  updateAgreement,
  updateCommunication,
  updateContact,
  updatePartner,
  type CreateCommunicationInput,
  type CreatePartnerAgreementInput,
  type CreatePartnerContactInput,
  type CreatePartnerInput,
  type SourceTaskResult,
  type UpdateCommunicationInput,
  type UpdatePartnerAgreementInput,
  type UpdatePartnerContactInput,
  type UpdatePartnerInput,
} from '@/modules/workbench/api/management'
import { listProjects } from '@/modules/workbench/api/projects'
import type {
  AgreementStatus,
  CommunicationRecord,
  CommunicationType,
  Partner,
  PartnerAgreement,
  PartnerContact,
  PartnerProject,
  Project,
} from '@/modules/workbench/types'
import './PartnersPage.less'

const AGREEMENT_STATUS_LABELS: Record<AgreementStatus, string> = {
  DRAFT: '草拟中',
  ACTIVE: '履约中',
  EXPIRED: '已到期',
  TERMINATED: '已终止',
}

const COMMUNICATION_TYPE_LABELS: Record<CommunicationType, string> = {
  EMAIL: '邮件',
  PHONE: '电话',
  MEETING: '会议',
  CHAT: '即时沟通',
  VISIT: '拜访',
  OTHER: '其他',
}

type ArchiveTarget =
  | { kind: 'partner'; item: Partner }
  | { kind: 'contact'; item: PartnerContact }
  | { kind: 'agreement'; item: PartnerAgreement }
  | { kind: 'communication'; item: CommunicationRecord }
  | { kind: 'project'; item: PartnerProject }

function optionalValue(form: FormData, name: string): string | undefined {
  const value = form.get(name)
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized || undefined
}

function nullableValue(form: FormData, name: string): string | null {
  return optionalValue(form, name) ?? null
}

function requiredValue(form: FormData, name: string): string {
  return optionalValue(form, name) ?? ''
}

function compact<T extends Record<string, string | undefined>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '未设置'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '时间无效' : date.toLocaleString('zh-CN', { hour12: false })
}

function toLocalDateTime(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function toIso(value: string | undefined) {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="partner-form__field">
      <span>{label}</span>
      {children}
    </div>
  )
}

function PartnerForm({
  partner,
  pending,
  onSubmit,
}: {
  partner?: Partner
  pending: boolean
  onSubmit: (input: CreatePartnerInput | UpdatePartnerInput) => void
}) {
  return (
    <form
      className="partner-form"
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const shared = {
          name: requiredValue(form, 'name'),
          shortName: partner ? nullableValue(form, 'shortName') : optionalValue(form, 'shortName'),
          category: partner ? nullableValue(form, 'category') : optionalValue(form, 'category'),
          address: partner ? nullableValue(form, 'address') : optionalValue(form, 'address'),
          notes: partner ? nullableValue(form, 'notes') : optionalValue(form, 'notes'),
        }
        onSubmit(shared as CreatePartnerInput | UpdatePartnerInput)
      }}
    >
      <FormField label="合作方名称">
        <Input name="name" aria-label="合作方名称" defaultValue={partner?.name} required />
      </FormField>
      <div className="partner-form__grid">
        <FormField label="简称">
          <Input name="shortName" aria-label="合作方简称" defaultValue={partner?.shortName ?? ''} />
        </FormField>
        <FormField label="分类">
          <Input
            name="category"
            aria-label="合作方分类"
            defaultValue={partner?.category ?? ''}
            placeholder="高校、供应商、研究机构…"
          />
        </FormField>
      </div>
      <FormField label="地址">
        <Input name="address" aria-label="合作方地址" defaultValue={partner?.address ?? ''} />
      </FormField>
      <FormField label="备注">
        <TextArea
          name="notes"
          aria-label="合作方备注"
          defaultValue={partner?.notes ?? ''}
          rows={3}
        />
      </FormField>
      <Button htmlType="submit" theme="solid" type="primary" loading={pending}>
        保存合作方
      </Button>
    </form>
  )
}

function ContactForm({
  contact,
  pending,
  onSubmit,
}: {
  contact?: PartnerContact
  pending: boolean
  onSubmit: (input: CreatePartnerContactInput | UpdatePartnerContactInput) => void
}) {
  return (
    <form
      className="partner-form"
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        onSubmit({
          name: requiredValue(form, 'name'),
          title: contact ? nullableValue(form, 'title') : optionalValue(form, 'title'),
          phone: contact ? nullableValue(form, 'phone') : optionalValue(form, 'phone'),
          email: contact ? nullableValue(form, 'email') : optionalValue(form, 'email'),
          notes: contact ? nullableValue(form, 'notes') : optionalValue(form, 'notes'),
        } as CreatePartnerContactInput | UpdatePartnerContactInput)
      }}
    >
      <div className="partner-form__grid">
        <FormField label="姓名">
          <Input name="name" aria-label="联系人姓名" defaultValue={contact?.name} required />
        </FormField>
        <FormField label="职务">
          <Input name="title" aria-label="联系人职务" defaultValue={contact?.title ?? ''} />
        </FormField>
        <FormField label="手机号">
          <Input name="phone" aria-label="联系人手机号" defaultValue={contact?.phone ?? ''} />
        </FormField>
        <FormField label="邮箱">
          <Input name="email" aria-label="联系人邮箱" defaultValue={contact?.email ?? ''} />
        </FormField>
      </div>
      <FormField label="备注">
        <TextArea
          name="notes"
          aria-label="联系人备注"
          defaultValue={contact?.notes ?? ''}
          rows={3}
        />
      </FormField>
      <Button htmlType="submit" theme="solid" type="primary" loading={pending}>
        保存联系人
      </Button>
    </form>
  )
}

function AgreementForm({
  agreement,
  pending,
  onSubmit,
}: {
  agreement?: PartnerAgreement
  pending: boolean
  onSubmit: (input: CreatePartnerAgreementInput | UpdatePartnerAgreementInput) => void
}) {
  const [status, setStatus] = useState<AgreementStatus>(agreement?.status ?? 'DRAFT')
  return (
    <form
      className="partner-form"
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        onSubmit({
          title: requiredValue(form, 'title'),
          agreementNo: agreement
            ? nullableValue(form, 'agreementNo')
            : optionalValue(form, 'agreementNo'),
          status,
          startAt: agreement ? nullableValue(form, 'startAt') : optionalValue(form, 'startAt'),
          endAt: agreement ? nullableValue(form, 'endAt') : optionalValue(form, 'endAt'),
          notes: agreement ? nullableValue(form, 'notes') : optionalValue(form, 'notes'),
        } as CreatePartnerAgreementInput | UpdatePartnerAgreementInput)
      }}
    >
      <FormField label="协议标题">
        <Input name="title" aria-label="协议标题" defaultValue={agreement?.title} required />
      </FormField>
      <div className="partner-form__grid">
        <FormField label="协议编号">
          <Input
            name="agreementNo"
            aria-label="协议编号"
            defaultValue={agreement?.agreementNo ?? ''}
          />
        </FormField>
        <FormField label="协议状态">
          <WorkspaceFormSelect
            name="status"
            aria-label="协议状态"
            value={status}
            onChange={(event) => setStatus(event.target.value as AgreementStatus)}
          >
            {Object.entries(AGREEMENT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </WorkspaceFormSelect>
        </FormField>
        <FormField label="开始日期">
          <DateTimePickerField
            name="startAt"
            mode="date"
            aria-label="协议开始日期"
            defaultValue={agreement?.startAt?.slice(0, 10) ?? ''}
          />
        </FormField>
        <FormField label="结束日期">
          <DateTimePickerField
            name="endAt"
            mode="date"
            aria-label="协议结束日期"
            defaultValue={agreement?.endAt?.slice(0, 10) ?? ''}
          />
        </FormField>
      </div>
      <FormField label="备注">
        <TextArea
          name="notes"
          aria-label="协议备注"
          defaultValue={agreement?.notes ?? ''}
          rows={3}
        />
      </FormField>
      <Button htmlType="submit" theme="solid" type="primary" loading={pending}>
        保存协议
      </Button>
    </form>
  )
}

function CommunicationForm({
  communication,
  contacts,
  projects,
  pending,
  onSubmit,
}: {
  communication?: CommunicationRecord
  contacts: PartnerContact[]
  projects: PartnerProject[]
  pending: boolean
  onSubmit: (input: CreateCommunicationInput | UpdateCommunicationInput) => void
}) {
  return (
    <form
      className="partner-form"
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const occurredAt = toIso(optionalValue(form, 'occurredAt'))
        const nextFollowUpAt = toIso(optionalValue(form, 'nextFollowUpAt'))
        const common = {
          type: requiredValue(form, 'type') as CommunicationType,
          subject: requiredValue(form, 'subject'),
          ...(occurredAt ? { occurredAt } : {}),
          projectId: communication
            ? nullableValue(form, 'projectId')
            : optionalValue(form, 'projectId'),
          contactId: communication
            ? nullableValue(form, 'contactId')
            : optionalValue(form, 'contactId'),
          summary: communication ? nullableValue(form, 'summary') : optionalValue(form, 'summary'),
          promises: communication
            ? nullableValue(form, 'promises')
            : optionalValue(form, 'promises'),
          ownerName: communication
            ? nullableValue(form, 'ownerName')
            : optionalValue(form, 'ownerName'),
          nextFollowUpAt: communication ? (nextFollowUpAt ?? null) : nextFollowUpAt,
        }
        onSubmit(common as CreateCommunicationInput | UpdateCommunicationInput)
      }}
    >
      <div className="partner-form__grid">
        <FormField label="沟通主题">
          <Input
            name="subject"
            aria-label="沟通主题"
            defaultValue={communication?.subject}
            required
          />
        </FormField>
        <FormField label="沟通类型">
          <WorkspaceFormSelect name="type" aria-label="沟通类型" defaultValue={communication?.type ?? 'MEETING'}>
            {Object.entries(COMMUNICATION_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </WorkspaceFormSelect>
        </FormField>
        <FormField label="沟通时间">
          <DateTimePickerField
            name="occurredAt"
            aria-label="沟通时间"
            defaultValue={toLocalDateTime(communication?.occurredAt)}
            required
          />
        </FormField>
        <FormField label="下次跟进时间">
          <DateTimePickerField
            name="nextFollowUpAt"
            aria-label="下次跟进时间"
            defaultValue={toLocalDateTime(communication?.nextFollowUpAt)}
          />
        </FormField>
        <FormField label="联系人">
          <WorkspaceFormSelect
            name="contactId"
            aria-label="沟通联系人"
            defaultValue={communication?.contactId ?? ''}
          >
            <option value="">未关联</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name}
              </option>
            ))}
          </WorkspaceFormSelect>
        </FormField>
        <FormField label="项目">
          <WorkspaceFormSelect
            name="projectId"
            aria-label="沟通项目"
            defaultValue={communication?.projectId ?? ''}
          >
            <option value="">未关联</option>
            {projects.map((relation) => (
              <option key={relation.projectId} value={relation.projectId}>
                {relation.project?.name ?? relation.projectId}
              </option>
            ))}
          </WorkspaceFormSelect>
        </FormField>
      </div>
      <FormField label="沟通摘要">
        <TextArea
          name="summary"
          aria-label="沟通摘要"
          defaultValue={communication?.summary ?? ''}
          rows={3}
        />
      </FormField>
      <FormField label="承诺事项">
        <Input name="promises" aria-label="承诺事项" defaultValue={communication?.promises ?? ''} />
      </FormField>
      <FormField label="我方负责人">
        <Input
          name="ownerName"
          aria-label="沟通负责人"
          defaultValue={communication?.ownerName ?? ''}
        />
      </FormField>
      <Button htmlType="submit" theme="solid" type="primary" loading={pending}>
        保存沟通
      </Button>
    </form>
  )
}

function RelationForm({
  project,
  pending,
  onSubmit,
}: {
  project: Pick<Project, 'id' | 'name'>
  pending: boolean
  onSubmit: (input: { role?: string; notes?: string }) => void
}) {
  return (
    <form
      className="partner-form"
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        onSubmit(
          compact({ role: optionalValue(form, 'role'), notes: optionalValue(form, 'notes') })
        )
      }}
    >
      <p className="partner-form__hint">将“{project.name}”加入当前合作关系。</p>
      <FormField label="合作角色">
        <Input name="role" aria-label="合作角色" placeholder="联合研发、供应商、评审单位…" />
      </FormField>
      <FormField label="关联说明">
        <TextArea name="notes" aria-label="项目关联说明" rows={3} />
      </FormField>
      <Button htmlType="submit" theme="solid" type="primary" loading={pending}>
        确认关联项目
      </Button>
    </form>
  )
}

export default function PartnersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const projectId = searchParams.get('projectId')?.trim() || undefined
  const recordId = searchParams.get('recordId')?.trim() || null
  const communicationId = searchParams.get('communicationId')?.trim() || null
  const [draftQuery, setDraftQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [followUpWindow, setFollowUpWindow] = useState<
    { from: string; before: string } | undefined
  >()
  const [page, setPage] = useState(1)
  const [activeTab, setActiveTab] = useState('overview')
  const [partnerEditor, setPartnerEditor] = useState<'create' | 'edit' | null>(null)
  const [contactEditor, setContactEditor] = useState<PartnerContact | 'create' | null>(null)
  const [agreementEditor, setAgreementEditor] = useState<PartnerAgreement | 'create' | null>(null)
  const [communicationEditor, setCommunicationEditor] = useState<
    CommunicationRecord | 'create' | null
  >(null)
  const [projectEditor, setProjectEditor] = useState<Pick<Project, 'id' | 'name'> | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget | null>(null)
  const [taskResults, setTaskResults] = useState<Record<string, SourceTaskResult>>({})
  const queryClient = useQueryClient()

  const listFilters = {
    ...(submittedQuery ? { q: submittedQuery } : {}),
    ...(projectId ? { projectId } : {}),
    ...(followUpWindow
      ? {
          nextFollowUpFrom: followUpWindow.from,
          nextFollowUpBefore: followUpWindow.before,
        }
      : {}),
    page,
    pageSize: 20,
  }
  const partnersQuery = useQuery({
    queryKey: ['partners', listFilters],
    queryFn: () => listPartners(listFilters),
  })
  const partnerQuery = useQuery({
    queryKey: ['partner', recordId],
    queryFn: () => getPartner(recordId!),
    enabled: Boolean(recordId),
  })
  const projectsQuery = useQuery({
    queryKey: ['projects', 'partner-picker'],
    queryFn: () => listProjects({ pageSize: 100, status: 'ACTIVE' }),
    enabled: Boolean(recordId),
  })

  const refreshPartner = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['partners'] }),
      queryClient.invalidateQueries({ queryKey: ['partner', recordId] }),
      queryClient.invalidateQueries({ queryKey: ['project'] }),
    ])
  }

  const partnerMutation = useMutation({
    mutationFn: (input: CreatePartnerInput | UpdatePartnerInput) =>
      partnerEditor === 'edit' && recordId
        ? updatePartner(recordId, input as UpdatePartnerInput)
        : createPartner(input as CreatePartnerInput),
    onSuccess: async (partner) => {
      setPartnerEditor(null)
      await refreshPartner()
      if (!recordId) {
        const next = new URLSearchParams(searchParams)
        next.set('recordId', partner.id)
        setSearchParams(next)
      }
      Toast.success('合作方已保存')
    },
    onError: () => Toast.error('保存合作方失败，请检查输入后重试。'),
  })
  const contactMutation = useMutation({
    mutationFn: (input: CreatePartnerContactInput | UpdatePartnerContactInput) =>
      contactEditor !== 'create' && contactEditor
        ? updateContact(recordId!, contactEditor.id, input as UpdatePartnerContactInput)
        : createContact(recordId!, input as CreatePartnerContactInput),
    onSuccess: async () => {
      setContactEditor(null)
      await refreshPartner()
      Toast.success('联系人已保存')
    },
    onError: () => Toast.error('保存联系人失败。'),
  })
  const agreementMutation = useMutation({
    mutationFn: (input: CreatePartnerAgreementInput | UpdatePartnerAgreementInput) =>
      agreementEditor !== 'create' && agreementEditor
        ? updateAgreement(recordId!, agreementEditor.id, input as UpdatePartnerAgreementInput)
        : createAgreement(recordId!, input as CreatePartnerAgreementInput),
    onSuccess: async () => {
      setAgreementEditor(null)
      await refreshPartner()
      Toast.success('协议已保存')
    },
    onError: () => Toast.error('保存协议失败。'),
  })
  const communicationMutation = useMutation({
    mutationFn: (input: CreateCommunicationInput | UpdateCommunicationInput) =>
      communicationEditor !== 'create' && communicationEditor
        ? updateCommunication(recordId!, communicationEditor.id, input as UpdateCommunicationInput)
        : createCommunication(recordId!, input as CreateCommunicationInput),
    onSuccess: async () => {
      setCommunicationEditor(null)
      await refreshPartner()
      Toast.success('沟通记录已保存')
    },
    onError: () => Toast.error('保存沟通记录失败。'),
  })
  const projectMutation = useMutation({
    mutationFn: (input: { role?: string; notes?: string }) =>
      linkPartnerProject(recordId!, projectEditor!.id, input),
    onSuccess: async () => {
      setProjectEditor(null)
      await refreshPartner()
      Toast.success('项目已关联')
    },
    onError: () => Toast.error('关联项目失败。'),
  })
  const taskMutation = useMutation({
    mutationFn: (communication: CommunicationRecord) =>
      createCommunicationTask(communication.id, {
        title: communication.subject,
        ...(communication.summary ? { description: communication.summary } : {}),
        ...(communication.projectId ? { projectId: communication.projectId } : {}),
        ...(communication.ownerName ? { assigneeName: communication.ownerName } : {}),
        ...(communication.nextFollowUpAt ? { dueAt: communication.nextFollowUpAt } : {}),
      }),
    onSuccess: async (result, communication) => {
      setTaskResults((current) => ({ ...current, [communication.id]: result }))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['my-work'] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['partner', recordId] }),
      ])
      Toast.success(result.alreadyExists ? '已关联既有任务' : '任务已创建')
    },
    onError: () => Toast.error('沟通转任务失败。'),
  })
  const archiveMutation = useMutation({
    mutationFn: async (target: ArchiveTarget) => {
      if (target.kind === 'partner') return archivePartner(target.item.id)
      if (target.kind === 'contact') return archiveContact(recordId!, target.item.id)
      if (target.kind === 'agreement') return archiveAgreement(recordId!, target.item.id)
      if (target.kind === 'communication') return archiveCommunication(recordId!, target.item.id)
      return unlinkPartnerProject(recordId!, target.item.projectId)
    },
    onSuccess: async (_, target) => {
      setArchiveTarget(null)
      await refreshPartner()
      if (target.kind === 'partner') {
        const next = new URLSearchParams(searchParams)
        next.delete('recordId')
        next.delete('communicationId')
        setSearchParams(next)
      }
      Toast.success(target.kind === 'project' ? '项目关联已移除' : '记录已归档')
    },
    onError: () => Toast.error('操作未完成。合作方仍有活动子记录时不能归档。'),
  })

  const partner = partnerQuery.data
  const focusedCommunication = partner?.communications?.find((item) => item.id === communicationId)
  const linkedProjects = partner?.projects ?? []
  const linkedIds = new Set(linkedProjects.map((relation) => relation.projectId))
  const availableProjects = (projectsQuery.data?.data ?? []).filter(
    (item) => !linkedIds.has(item.id)
  )
  const selectedTab = communicationId ? 'communications' : activeTab

  const openPartner = (id: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('recordId', id)
    next.delete('communicationId')
    setActiveTab('overview')
    setSearchParams(next)
  }
  const closePartner = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('recordId')
    next.delete('communicationId')
    setSearchParams(next)
  }

  return (
    <div className="partner-workspace workspace-page">
      <div className="partner-workspace__inner workspace-page__inner">
        <div className="workspace-module-toolbar">
          <div className="workspace-module-toolbar__actions">
          <Button
            theme="solid"
            type="primary"
            icon={<IconPlus />}
            onClick={() => setPartnerEditor('create')}
          >
            新建合作方
          </Button>
          </div>
        </div>

        <section className="partner-workspace__toolbar workspace-card" aria-label="合作方筛选">
          <form
            className="partner-workspace__search"
            onSubmit={(event) => {
              event.preventDefault()
              setPage(1)
              setSubmittedQuery(draftQuery.trim())
            }}
          >
            <Input
              prefix={<IconSearch />}
              showClear
              aria-label="搜索合作方"
              placeholder="搜索名称、简称或分类"
              value={draftQuery}
              onChange={setDraftQuery}
            />
            <Button htmlType="submit" theme="solid" type="primary">
              搜索
            </Button>
          </form>
          <Button
            aria-label="仅看未来 7 天需跟进"
            theme={followUpWindow ? 'solid' : 'light'}
            type={followUpWindow ? 'primary' : 'tertiary'}
            onClick={() => {
              setPage(1)
              setFollowUpWindow((current) => {
                if (current) return undefined
                const now = new Date()
                return {
                  from: now.toISOString(),
                  before: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
                }
              })
            }}
          >
            未来 7 天需跟进
          </Button>
          {projectId ? <Tag color="blue">当前项目筛选</Tag> : null}
        </section>

        {partnersQuery.isPending ? <Skeleton.Paragraph rows={6} /> : null}
        {partnersQuery.isError ? (
          <Banner
            type="danger"
            fullMode={false}
            title="无法读取合作方"
            description="请确认本地服务已启动后重试。"
            closeIcon={null}
          >
            <Button onClick={() => void partnersQuery.refetch()}>重试</Button>
          </Banner>
        ) : null}
        {partnersQuery.data?.data.length ? (
          <section className="partner-workspace__list" aria-label="合作方列表">
            {partnersQuery.data.data.map((item) => (
              <button
                key={item.id}
                type="button"
                className="partner-card"
                aria-label={`打开合作方：${item.name}`}
                onClick={() => openPartner(item.id)}
              >
                <span className="partner-card__mark">{item.name.slice(0, 1)}</span>
                <span className="partner-card__body">
                  <span className="partner-card__title">
                    <strong>{item.name}</strong>
                    {item.category ? <Tag size="small">{item.category}</Tag> : null}
                  </span>
                  <span className="partner-card__meta">
                    {item.shortName || '未设置简称'} ·{' '}
                    {item.contactCount ?? item.contacts?.length ?? 0} 位联系人 ·{' '}
                    {item.projectCount ?? item.projects?.length ?? 0} 个项目
                  </span>
                  <span className="partner-card__activity">
                    最近沟通 {formatDateTime(item.lastCommunicationAt)} · 下次跟进{' '}
                    {formatDateTime(item.nextFollowUpAt)}
                  </span>
                </span>
                <span className="partner-card__count">
                  {item.activeAgreementCount ??
                    item.agreements?.filter((agreement) => agreement.status === 'ACTIVE').length ??
                    0}
                  <small>履约协议</small>
                </span>
              </button>
            ))}
          </section>
        ) : partnersQuery.data ? (
          <Empty title="没有符合条件的合作方" description="调整筛选条件，或新建第一条合作关系。" />
        ) : null}

        {partnersQuery.data && partnersQuery.data.meta.total > partnersQuery.data.meta.pageSize ? (
          <nav className="partner-workspace__pagination" aria-label="合作方分页">
            <Button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
              上一页
            </Button>
            <span>第 {page} 页</span>
            <Button
              disabled={page * 20 >= partnersQuery.data.meta.total}
              onClick={() => setPage((value) => value + 1)}
            >
              下一页
            </Button>
          </nav>
        ) : null}
      </div>

      <SideSheet
        visible={Boolean(recordId)}
        onCancel={closePartner}
        width={860}
        className="partner-detail"
        title={
          partner ? (
            <div className="partner-detail__title">
              <span className="partner-card__mark">{partner.name.slice(0, 1)}</span>
              <div>
                <h2>{partner.name}</h2>
                <p>{partner.shortName || partner.category || '合作方详情'}</p>
              </div>
            </div>
          ) : (
            '合作方详情'
          )
        }
      >
        {partnerQuery.isPending ? <Skeleton.Paragraph rows={9} /> : null}
        {partnerQuery.isError ? (
          <Banner type="danger" fullMode={false} title="无法读取合作方详情" closeIcon={null}>
            <Button onClick={() => void partnerQuery.refetch()}>重试</Button>
          </Banner>
        ) : null}
        {partner ? (
          <section aria-label="当前定位合作方" className="partner-detail__workspace">
            <span className="sr-only">{partner.name}</span>
            <div className="partner-detail__actions">
              <Button aria-label="编辑合作方" onClick={() => setPartnerEditor('edit')}>
                编辑
              </Button>
              <Button
                aria-label="归档合作方"
                type="danger"
                theme="borderless"
                onClick={() => setArchiveTarget({ kind: 'partner', item: partner })}
              >
                归档
              </Button>
            </div>
            <Tabs
              type="line"
              keepDOM={false}
              activeKey={selectedTab}
              onChange={(key) => {
                setActiveTab(key)
                if (communicationId && key !== 'communications') {
                  const next = new URLSearchParams(searchParams)
                  next.delete('communicationId')
                  setSearchParams(next)
                }
              }}
            >
              <TabPane tab="概览" itemKey="overview">
                <div className="partner-detail__overview">
                  <section className="partner-detail__metrics" aria-label="合作关系摘要">
                    <div>
                      <strong>{partner.contacts?.length ?? 0}</strong>
                      <span>联系人</span>
                    </div>
                    <div>
                      <strong>
                        {partner.agreements?.filter((item) => item.status === 'ACTIVE').length ?? 0}
                      </strong>
                      <span>履约协议</span>
                    </div>
                    <div>
                      <strong>{linkedProjects.length}</strong>
                      <span>关联项目</span>
                    </div>
                    <div>
                      <strong>{partner.communications?.length ?? 0}</strong>
                      <span>沟通记录</span>
                    </div>
                  </section>
                  <section className="partner-detail__panel">
                    <h3>基本信息</h3>
                    <dl>
                      <div>
                        <dt>分类</dt>
                        <dd>{partner.category || '未分类'}</dd>
                      </div>
                      <div>
                        <dt>地址</dt>
                        <dd>{partner.address || '未设置'}</dd>
                      </div>
                      <div>
                        <dt>备注</dt>
                        <dd>{partner.notes || '暂无备注'}</dd>
                      </div>
                    </dl>
                  </section>
                  <section className="partner-detail__panel">
                    <h3>下一步跟进</h3>
                    <p>
                      {formatDateTime(
                        partner.nextFollowUpAt ??
                          partner.communications?.find((item) => item.nextFollowUpAt)
                            ?.nextFollowUpAt
                      )}
                    </p>
                    <small>来自最近沟通记录的待办时间</small>
                  </section>
                </div>
              </TabPane>
              <TabPane tab={`项目 ${linkedProjects.length}`} itemKey="projects">
                <div className="partner-detail__section">
                  <header>
                    <div>
                      <h3>关联项目</h3>
                      <p>同一合作方可以服务多个研发项目。</p>
                    </div>
                  </header>
                  <div className="partner-detail__records">
                    {linkedProjects.map((relation) => (
                      <article key={relation.projectId} className="partner-record">
                        <IconBriefcase />
                        <div>
                          <strong>{relation.project?.name ?? relation.projectId}</strong>
                          <p>
                            {relation.project?.code ?? '项目'} · {relation.role || '未设置合作角色'}
                          </p>
                          {relation.notes ? <small>{relation.notes}</small> : null}
                        </div>
                        <Link
                          to={`/spaces/projects/${encodeURIComponent(relation.projectId)}/overview`}
                        >
                          打开项目
                        </Link>
                        <Button
                          size="small"
                          theme="borderless"
                          type="danger"
                          aria-label={`移除项目关联：${relation.project?.name ?? relation.projectId}`}
                          onClick={() => setArchiveTarget({ kind: 'project', item: relation })}
                        >
                          移除
                        </Button>
                      </article>
                    ))}
                  </div>
                  {availableProjects.length ? (
                    <div className="partner-detail__available">
                      <h4>可关联项目</h4>
                      {availableProjects.map((project) => (
                        <Button
                          key={project.id}
                          aria-label={`关联项目：${project.name}`}
                          onClick={() => setProjectEditor(project)}
                        >
                          {project.name}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="partner-detail__empty">没有更多可关联的进行中项目。</p>
                  )}
                </div>
              </TabPane>
              <TabPane tab={`联系人 ${partner.contacts?.length ?? 0}`} itemKey="contacts">
                <div className="partner-detail__section">
                  <header>
                    <div>
                      <h3>联系人</h3>
                      <p>集中保存角色、电话和邮箱。</p>
                    </div>
                    <Button
                      icon={<IconPlus />}
                      theme="solid"
                      type="primary"
                      aria-label="新增联系人"
                      onClick={() => setContactEditor('create')}
                    >
                      新增联系人
                    </Button>
                  </header>
                  <div className="partner-detail__records">
                    {partner.contacts?.map((contact) => (
                      <article key={contact.id} className="partner-record">
                        <IconUserGroup />
                        <div>
                          <strong>{contact.name}</strong>
                          <p>
                            {contact.title || '未设置职务'} · {contact.phone || '未设置电话'}
                          </p>
                          <small>{contact.email || '未设置邮箱'}</small>
                        </div>
                        <Button
                          size="small"
                          theme="borderless"
                          aria-label={`编辑联系人：${contact.name}`}
                          onClick={() => setContactEditor(contact)}
                        >
                          编辑
                        </Button>
                        <Button
                          size="small"
                          theme="borderless"
                          type="danger"
                          aria-label={`归档联系人：${contact.name}`}
                          onClick={() => setArchiveTarget({ kind: 'contact', item: contact })}
                        >
                          归档
                        </Button>
                      </article>
                    ))}
                  </div>
                </div>
              </TabPane>
              <TabPane tab={`协议 ${partner.agreements?.length ?? 0}`} itemKey="agreements">
                <div className="partner-detail__section">
                  <header>
                    <div>
                      <h3>协议</h3>
                      <p>跟踪编号、状态与有效期。</p>
                    </div>
                    <Button
                      icon={<IconPlus />}
                      theme="solid"
                      type="primary"
                      aria-label="新增协议"
                      onClick={() => setAgreementEditor('create')}
                    >
                      新增协议
                    </Button>
                  </header>
                  <div className="partner-detail__records">
                    {partner.agreements?.map((agreement) => (
                      <article key={agreement.id} className="partner-record">
                        <div className="partner-record__status">
                          <Tag color={agreement.status === 'ACTIVE' ? 'green' : 'grey'}>
                            {AGREEMENT_STATUS_LABELS[agreement.status]}
                          </Tag>
                        </div>
                        <div>
                          <strong>{agreement.title}</strong>
                          <p>
                            {agreement.agreementNo || '未设置编号'} ·{' '}
                            {agreement.startAt?.slice(0, 10) || '未设置开始时间'} —{' '}
                            {agreement.endAt?.slice(0, 10) || '长期'}
                          </p>
                        </div>
                        <Button
                          size="small"
                          theme="borderless"
                          aria-label={`编辑协议：${agreement.title}`}
                          onClick={() => setAgreementEditor(agreement)}
                        >
                          编辑
                        </Button>
                        <Button
                          size="small"
                          theme="borderless"
                          type="danger"
                          aria-label={`归档协议：${agreement.title}`}
                          onClick={() => setArchiveTarget({ kind: 'agreement', item: agreement })}
                        >
                          归档
                        </Button>
                      </article>
                    ))}
                  </div>
                </div>
              </TabPane>
              <TabPane tab={`沟通 ${partner.communications?.length ?? 0}`} itemKey="communications">
                <div className="partner-detail__section">
                  <header>
                    <div>
                      <h3>沟通记录</h3>
                      <p>记录承诺、跟进时间，并直接转成我的工作。</p>
                    </div>
                    <Button
                      icon={<IconPlus />}
                      theme="solid"
                      type="primary"
                      aria-label="新增沟通"
                      onClick={() => setCommunicationEditor('create')}
                    >
                      新增沟通
                    </Button>
                  </header>
                  {focusedCommunication ? (
                    <section aria-label="当前定位沟通记录" className="partner-detail__focus-note">
                      <strong>当前定位：{focusedCommunication.subject}</strong>
                      <span>{focusedCommunication.summary || '暂无摘要'}</span>
                    </section>
                  ) : null}
                  <div className="partner-detail__timeline">
                    {partner.communications?.map((communication) => {
                      const taskResult = taskResults[communication.id]
                      const taskId = taskResult?.task.id ?? communication.taskId
                      return (
                        <article
                          key={communication.id}
                          aria-label={`沟通记录：${communication.subject}`}
                          aria-current={communication.id === communicationId ? 'true' : undefined}
                          className="communication-record"
                        >
                          <span className="communication-record__dot" />
                          <div>
                            <header>
                              <Tag size="small">
                                {COMMUNICATION_TYPE_LABELS[communication.type]}
                              </Tag>
                              <time>{formatDateTime(communication.occurredAt)}</time>
                            </header>
                            <strong>{communication.subject}</strong>
                            {communication.summary ? <p>{communication.summary}</p> : null}
                            {communication.promises ? (
                              <p className="communication-record__promise">
                                承诺：{communication.promises}
                              </p>
                            ) : null}
                            <small>下次跟进：{formatDateTime(communication.nextFollowUpAt)}</small>
                            {taskResult?.alreadyExists ? (
                              <span className="communication-record__task-state">
                                已关联既有任务
                              </span>
                            ) : taskResult ? (
                              <span className="communication-record__task-state">任务已创建</span>
                            ) : null}
                          </div>
                          <div className="communication-record__actions">
                            <Button
                              size="small"
                              theme="borderless"
                              aria-label={`编辑沟通：${communication.subject}`}
                              onClick={() => setCommunicationEditor(communication)}
                            >
                              编辑
                            </Button>
                            {taskId ? (
                              <Link
                                aria-label={`查看任务：${communication.subject}`}
                                to={`/my-work?taskId=${encodeURIComponent(taskId)}`}
                              >
                                查看任务
                              </Link>
                            ) : (
                              <Button
                                size="small"
                                theme="solid"
                                type="primary"
                                loading={
                                  taskMutation.isPending &&
                                  taskMutation.variables?.id === communication.id
                                }
                                onClick={() => taskMutation.mutate(communication)}
                              >
                                转为任务
                              </Button>
                            )}
                            <Button
                              size="small"
                              theme="borderless"
                              type="danger"
                              onClick={() =>
                                setArchiveTarget({ kind: 'communication', item: communication })
                              }
                            >
                              归档沟通
                            </Button>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </div>
              </TabPane>
              <TabPane tab="资料" itemKey="materials">
                <div className="partner-detail__integration">
                  <strong>合作资料统一进入内容中心</strong>
                  <p>协议正文、会议材料和交付附件将通过对象关联保留在同一个合作方上下文中。</p>
                  <Link to={`/docs?partnerId=${encodeURIComponent(partner.id)}`}>打开资料库</Link>
                </div>
              </TabPane>
            </Tabs>
          </section>
        ) : null}
      </SideSheet>

      <Modal
        title={partnerEditor === 'edit' ? '编辑合作方' : '新建合作方'}
        visible={partnerEditor !== null}
        footer={null}
        width={560}
        onCancel={() => setPartnerEditor(null)}
      >
        <PartnerForm
          partner={partnerEditor === 'edit' ? partner : undefined}
          pending={partnerMutation.isPending}
          onSubmit={(input) => partnerMutation.mutate(input)}
        />
      </Modal>
      <Modal
        title={contactEditor === 'create' ? '新增联系人' : '编辑联系人'}
        visible={contactEditor !== null}
        footer={null}
        width={520}
        onCancel={() => setContactEditor(null)}
      >
        <ContactForm
          contact={contactEditor && contactEditor !== 'create' ? contactEditor : undefined}
          pending={contactMutation.isPending}
          onSubmit={(input) => contactMutation.mutate(input)}
        />
      </Modal>
      <Modal
        title={agreementEditor === 'create' ? '新增协议' : '编辑协议'}
        visible={agreementEditor !== null}
        footer={null}
        width={560}
        onCancel={() => setAgreementEditor(null)}
      >
        <AgreementForm
          key={agreementEditor === 'create' ? 'create' : agreementEditor?.id}
          agreement={agreementEditor && agreementEditor !== 'create' ? agreementEditor : undefined}
          pending={agreementMutation.isPending}
          onSubmit={(input) => agreementMutation.mutate(input)}
        />
      </Modal>
      <Modal
        title={communicationEditor === 'create' ? '新增沟通' : '编辑沟通'}
        visible={communicationEditor !== null}
        footer={null}
        width={620}
        onCancel={() => setCommunicationEditor(null)}
      >
        <CommunicationForm
          communication={
            communicationEditor && communicationEditor !== 'create'
              ? communicationEditor
              : undefined
          }
          contacts={partner?.contacts ?? []}
          projects={linkedProjects}
          pending={communicationMutation.isPending}
          onSubmit={(input) => communicationMutation.mutate(input)}
        />
      </Modal>
      <Modal
        title="关联项目"
        visible={projectEditor !== null}
        footer={null}
        width={500}
        onCancel={() => setProjectEditor(null)}
      >
        {projectEditor ? (
          <RelationForm
            project={projectEditor}
            pending={projectMutation.isPending}
            onSubmit={(input) => projectMutation.mutate(input)}
          />
        ) : null}
      </Modal>
      <Modal
        title={archiveTarget?.kind === 'project' ? '移除项目关联' : '确认归档'}
        visible={archiveTarget !== null}
        onCancel={() => setArchiveTarget(null)}
        footer={
          <div className="partner-detail__confirm-actions">
            <Button onClick={() => setArchiveTarget(null)}>取消</Button>
            <Button
              theme="solid"
              type="danger"
              aria-label={
                archiveTarget?.kind === 'contact'
                  ? '确认归档联系人'
                  : archiveTarget?.kind === 'agreement'
                    ? '确认归档协议'
                    : archiveTarget?.kind === 'communication'
                      ? '确认归档沟通'
                      : archiveTarget?.kind === 'project'
                        ? '确认移除项目关联'
                        : '确认归档'
              }
              loading={archiveMutation.isPending}
              onClick={() => archiveTarget && archiveMutation.mutate(archiveTarget)}
            >
              {archiveTarget?.kind === 'project' ? '确认移除' : '确认归档'}
            </Button>
          </div>
        }
      >
        <p>
          {archiveTarget?.kind === 'partner'
            ? '归档前需先移除联系人、协议、沟通和项目关联。'
            : archiveTarget?.kind === 'project'
              ? '移除后，项目空间将不再显示这个合作方。'
              : '归档后默认列表不再显示该记录，但历史数据仍会保留。'}
        </p>
        {archiveTarget?.kind === 'partner' ? (
          <p className="partner-detail__archive-blockers">
            当前仍有：{archiveTarget.item.contacts?.length ?? 0} 位联系人、
            {archiveTarget.item.agreements?.length ?? 0} 份协议、
            {archiveTarget.item.communications?.length ?? 0} 条沟通、
            {archiveTarget.item.projects?.length ?? 0} 个项目关联、
            {archiveTarget.item.fileCount ?? 0} 个活动附件
          </p>
        ) : null}
      </Modal>
    </div>
  )
}
