import { WorkspaceFormSelect } from '@/components/workspace/WorkspaceFormSelect'
import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Banner,
  Button,
  Empty,
  Input,
  Modal,
  Pagination,
  Select,
  SideSheet,
  Skeleton,
  TabPane,
  Tabs,
  Tag,
} from '@douyinfe/semi-ui'
import { IconPlus, IconSearch } from '@douyinfe/semi-icons'
import { Link, useSearchParams } from 'react-router-dom'

import {
  archiveNonProjectRd,
  createNonProjectRd,
  createNonProjectTask,
  createOutcome,
  getNonProjectRd,
  listNonProjectRd,
  suggestProject,
  updateNonProjectRd,
  updateOutcome,
  type CreateNonProjectRdInput,
  type NonProjectRdItem,
  type NonProjectRdKind,
  type NonProjectRdStatus,
} from '@/modules/workbench/api/operations'
import { ROUTES } from '@/constants/routes'
import { DateTimePickerField } from '@/components/FormControls/DateTimePickerField'
import { FileAttachments } from '@/modules/content/components/FileAttachments'
import ResourcesPage from './ResourcesPage'

import './OperationsPage.less'

const KINDS: Array<{ value: NonProjectRdKind; label: string }> = [
  { value: 'TECH_EXPLORATION', label: '技术预研' },
  { value: 'NEW_DIRECTION', label: '新方向探索' },
  { value: 'PLATFORM_TOOL', label: '平台与工具' },
  { value: 'TECH_DEBT', label: '技术债治理' },
  { value: 'PATENT', label: '专利' },
  { value: 'STANDARD_METHOD', label: '标准与方法' },
  { value: 'TRAINING', label: '培训与分享' },
  { value: 'TEMPORARY_SUPPORT', label: '临时支持' },
]

const STATUSES: Array<{ value: NonProjectRdStatus; label: string }> = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'PLANNED', label: '已计划' },
  { value: 'IN_PROGRESS', label: '进行中' },
  { value: 'ON_HOLD', label: '暂停' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
]

const statusLabel = (status: NonProjectRdStatus) =>
  STATUSES.find((item) => item.value === status)?.label ?? status
const kindLabel = (kind: NonProjectRdKind) => KINDS.find((item) => item.value === kind)?.label ?? kind
const date = (value: string | null) => value ? new Date(value).toLocaleDateString('zh-CN') : '未设置'

type EditorState = { mode: 'create' | 'edit'; item?: NonProjectRdItem } | null
const formText = (data: FormData, name: string) => {
  const value = data.get(name)
  return typeof value === 'string' ? value : ''
}

export default function OperationsPage() {
  const [params] = useSearchParams()
  return params.get('tab') === 'resources' ? <ResourcesPage /> : <NonProjectRdPage />
}

function NonProjectRdPage() {
  const client = useQueryClient()
  const [params, setParams] = useSearchParams()
  const recordId = params.get('recordId')
  const [queryText, setQueryText] = useState(params.get('q') ?? '')
  const [kind, setKind] = useState<NonProjectRdKind | undefined>((params.get('kind') as NonProjectRdKind) || undefined)
  const [status, setStatus] = useState<NonProjectRdStatus | undefined>((params.get('status') as NonProjectRdStatus) || undefined)
  const [page, setPage] = useState(1)
  const [editor, setEditor] = useState<EditorState>(null)
  const [outcomeTitle, setOutcomeTitle] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [suggestion, setSuggestion] = useState<Record<string, unknown> | null>(null)

  const filters = useMemo(() => ({
    q: params.get('q') || undefined,
    kind: (params.get('kind') as NonProjectRdKind) || undefined,
    status: (params.get('status') as NonProjectRdStatus) || undefined,
    projectId: params.get('projectId') || undefined,
    page,
    pageSize: 20,
  }), [page, params])
  const items = useQuery({
    queryKey: ['non-project-rd', filters],
    queryFn: () => listNonProjectRd(filters),
  })
  const detail = useQuery({
    queryKey: ['non-project-rd', recordId],
    queryFn: () => getNonProjectRd(recordId!),
    enabled: Boolean(recordId),
  })
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['non-project-rd'] })
  }
  const save = useMutation({
    mutationFn: (input: CreateNonProjectRdInput) =>
      editor?.mode === 'edit' && editor.item
        ? updateNonProjectRd(editor.item.id, input)
        : createNonProjectRd(input),
    onSuccess: async (item) => {
      setEditor(null)
      await refresh()
      openItem(item.id)
    },
  })
  const archive = useMutation({
    mutationFn: archiveNonProjectRd,
    onSuccess: async () => {
      closeItem()
      await refresh()
    },
  })
  const outcomeCreate = useMutation({
    mutationFn: ({ itemId, title }: { itemId: string; title: string }) => createOutcome(itemId, { title }),
    onSuccess: async () => {
      setOutcomeTitle('')
      await refresh()
    },
  })
  const outcomeVerify = useMutation({
    mutationFn: ({ itemId, outcomeId }: { itemId: string; outcomeId: string }) =>
      updateOutcome(itemId, outcomeId, { status: 'VERIFIED', verifiedAt: new Date().toISOString() }),
    onSuccess: refresh,
  })
  const taskCreate = useMutation({
    mutationFn: (item: NonProjectRdItem) => createNonProjectTask(item.id, {
      title: `推进${item.title}`,
      description: item.objective || undefined,
      projectId: item.projectId || undefined,
      dueAt: item.plannedEndAt || undefined,
      priority: 'MEDIUM',
    }),
    onSuccess: async ({ alreadyExists }) => {
      setActionMessage(alreadyExists ? '已存在关联任务，已为你打开入口' : '已加入“我的工作”')
      await refresh()
    },
  })
  const suggestionMutation = useMutation({
    mutationFn: suggestProject,
    onSuccess: setSuggestion,
  })

  function openItem(id: string) {
    const next = new URLSearchParams(params)
    next.set('tab', 'non-project-rd')
    next.set('recordId', id)
    setParams(next)
    setActionMessage('')
    setSuggestion(null)
  }
  function closeItem() {
    const next = new URLSearchParams(params)
    next.delete('recordId')
    setParams(next)
  }
  function submitFilters() {
    const next = new URLSearchParams(params)
    const values = { q: queryText.trim(), kind: kind ?? '', status: status ?? '' }
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key))
    next.set('tab', 'non-project-rd')
    next.delete('recordId')
    setPage(1)
    setParams(next)
  }

  const selected = detail.data
  return (
    <div className="operations-page">
      <header className="operations-page__header">
        <div>
          <p>R&amp;D OPERATIONS</p>
          <h1>非项目研发</h1>
          <span>把预研、技术债、专利、培训和临时支持纳入可追踪的工作闭环。</span>
        </div>
        <div className="operations-page__header-actions">
          <Link className="operations-page__switch" to={`${ROUTES.OPERATIONS}?tab=resources`}>资源负荷</Link>
          <Link className="operations-page__switch" to={ROUTES.REPORTS}>统计报表</Link>
          <Button aria-label="新建事项" theme="solid" type="primary" icon={<IconPlus />} onClick={() => setEditor({ mode: 'create' })}>新建事项</Button>
        </div>
      </header>

      <section className="operations-page__surface" aria-label="非项目研发目录">
        <div className="operations-page__filters">
          <Input prefix={<IconSearch />} aria-label="搜索非项目研发" placeholder="搜索编号、标题、目标或预期成果" value={queryText} onChange={setQueryText} onEnterPress={submitFilters} />
          <Select aria-label="事项类型" placeholder="全部类型" showClear value={kind} optionList={KINDS} onChange={(value) => setKind(value as NonProjectRdKind | undefined)} />
          <Select aria-label="事项状态" placeholder="全部状态" showClear value={status} optionList={STATUSES} onChange={(value) => setStatus(value as NonProjectRdStatus | undefined)} />
          <Button onClick={submitFilters}>筛选</Button>
        </div>
        {items.isError ? <Banner type="danger" fullMode={false} title="无法读取非项目研发" closeIcon={null}><Button onClick={() => { void items.refetch() }}>重试</Button></Banner> : null}
        <div className="operations-list" aria-busy={items.isLoading}>
          {items.isLoading ? <Skeleton.Paragraph rows={6} /> : null}
          {!items.isLoading && !items.data?.data.length ? <Empty title="还没有非项目研发事项" description="从预研、技术债或培训计划开始记录。" /> : null}
          {items.data?.data.map((item) => (
            <article className="operations-card" key={item.id}>
              <button type="button" aria-label={`打开：${item.title}`} onClick={() => openItem(item.id)}>
                <span className="operations-card__kind">{kindLabel(item.kind)}</span>
                <h2>{item.title}</h2>
                <p>{item.expectedOutcome || item.objective || '尚未填写预期成果'}</p>
                <footer>
                  <span>{item.code}</span>
                  <Tag color={item.status === 'COMPLETED' ? 'green' : item.status === 'ON_HOLD' ? 'amber' : 'blue'}>{statusLabel(item.status)}</Tag>
                  <span>{date(item.plannedEndAt)}</span>
                  <span>{item.plannedPersonHours}h</span>
                </footer>
              </button>
            </article>
          ))}
        </div>
        {(items.data?.meta.total ?? 0) > 20 ? <Pagination currentPage={page} pageSize={20} total={items.data?.meta.total ?? 0} onPageChange={setPage} /> : null}
      </section>

      <SideSheet visible={Boolean(recordId)} width={760} onCancel={closeItem} title={selected?.title ?? '非项目研发详情'}>
        <section role="dialog" aria-label="非项目研发详情" className="operations-detail">
          {detail.isLoading ? <Skeleton.Paragraph rows={8} /> : null}
          {detail.isError ? <Banner type="danger" fullMode={false} title="无法读取事项详情" closeIcon={null} /> : null}
          {selected ? (
            <>
              <div className="operations-detail__toolbar">
                <Button onClick={() => setEditor({ mode: 'edit', item: selected })}>编辑</Button>
                <Button loading={taskCreate.isPending} onClick={() => taskCreate.mutate(selected)}>加入我的工作</Button>
                <Button onClick={() => suggestionMutation.mutate(selected.id)}>项目建议</Button>
                <Button type="danger" theme="borderless" onClick={() => archive.mutate(selected.id)}>归档</Button>
              </div>
              {actionMessage ? <Banner type="success" fullMode={false} title={actionMessage} closeIcon={null} /> : null}
              {suggestion ? <Banner type="info" fullMode={false} title={`建议项目：${String(suggestion.name)}（${String(suggestion.code)}）`} closeIcon={null} /> : null}
              <Tabs type="line">
                <TabPane tab="概览" itemKey="overview">
                  <dl className="operations-detail__facts">
                    <div><dt>类型</dt><dd>{kindLabel(selected.kind)}</dd></div>
                    <div><dt>状态</dt><dd>{statusLabel(selected.status)}</dd></div>
                    <div><dt>负责人</dt><dd>{selected.ownerName || '未指定'}</dd></div>
                    <div><dt>计划投入</dt><dd>{selected.plannedPersonHours} 小时</dd></div>
                    <div><dt>计划周期</dt><dd>{date(selected.plannedStartAt)} — {date(selected.plannedEndAt)}</dd></div>
                    <div><dt>关联项目</dt><dd>{selected.project ? <Link to={ROUTES.projectWorkspace(selected.project.id)}>{selected.project.name}</Link> : '未关联'}</dd></div>
                  </dl>
                  <section className="operations-detail__text"><h3>目标</h3><p>{selected.objective || '未填写'}</p></section>
                  <section className="operations-detail__text"><h3>预期成果</h3><p>{selected.expectedOutcome || '未填写'}</p></section>
                </TabPane>
                <TabPane tab={`阶段成果 ${selected.outcomes.length}`} itemKey="outcomes">
                  <form className="operations-outcome-form" onSubmit={(event) => {
                    event.preventDefault()
                    const title = outcomeTitle.trim()
                    if (title) outcomeCreate.mutate({ itemId: selected.id, title })
                  }}>
                    <Input aria-label="成果标题" value={outcomeTitle} onChange={setOutcomeTitle} placeholder="例如：完成选型评审并形成结论" />
                    <Button htmlType="submit" loading={outcomeCreate.isPending}>添加成果</Button>
                  </form>
                  <div className="operations-outcomes">
                    {selected.outcomes.map((outcome) => (
                      <article key={outcome.id}>
                        <div><strong>{outcome.title}</strong><Tag color={outcome.status === 'VERIFIED' ? 'green' : 'grey'}>{outcome.status === 'VERIFIED' ? '已验证' : '待验证'}</Tag></div>
                        <p>{outcome.summary || '暂无说明'}</p>
                        {outcome.status !== 'VERIFIED' ? <Button size="small" onClick={() => outcomeVerify.mutate({ itemId: selected.id, outcomeId: outcome.id })}>标记已验证</Button> : null}
                      </article>
                    ))}
                  </div>
                </TabPane>
                <TabPane tab="任务" itemKey="task">
                  <section className="operations-detail__text">
                    <h3>我的工作</h3>
                    {selected.task ? (
                      <p>
                        <Link to={`/my-work?taskId=${encodeURIComponent(selected.task.id)}`}>
                          {selected.task.title}
                        </Link>
                        {' · '}{selected.task.status}
                      </p>
                    ) : (
                      <p>尚未加入“我的工作”，可使用上方按钮创建来源可追溯的任务。</p>
                    )}
                  </section>
                </TabPane>
                <TabPane tab="资料" itemKey="materials">
                  <FileAttachments associations={{ nonProjectRdItemId: selected.id }} />
                </TabPane>
              </Tabs>
            </>
          ) : null}
        </section>
      </SideSheet>

      <ItemEditor editor={editor} saving={save.isPending} onCancel={() => setEditor(null)} onSave={(input) => save.mutate(input)} />
    </div>
  )
}

function ItemEditor({ editor, saving, onCancel, onSave }: { editor: EditorState; saving: boolean; onCancel: () => void; onSave: (input: CreateNonProjectRdInput) => void }) {
  if (!editor) return null
  const item = editor.item
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    onSave({
      code: formText(data, 'code').trim(),
      title: formText(data, 'title').trim(),
      kind: (formText(data, 'kind') || 'TECH_EXPLORATION') as NonProjectRdKind,
      objective: formText(data, 'objective').trim() || undefined,
      expectedOutcome: formText(data, 'expectedOutcome').trim() || undefined,
      ownerName: formText(data, 'ownerName').trim() || undefined,
      plannedStartAt: formText(data, 'plannedStartAt') || undefined,
      plannedEndAt: formText(data, 'plannedEndAt') || undefined,
      plannedPersonHours: Number(formText(data, 'plannedPersonHours') || 0),
      status: (formText(data, 'status') || 'DRAFT') as NonProjectRdStatus,
    })
  }
  return (
    <Modal visible title={editor.mode === 'create' ? '新建非项目研发' : '编辑非项目研发'} footer={null} onCancel={onCancel}>
      <form className="operations-editor" onSubmit={submit}>
        <div><label htmlFor="rd-code">编号</label><Input id="rd-code" name="code" defaultValue={item?.code} required /></div>
        <div><label htmlFor="rd-title">事项标题</label><Input id="rd-title" name="title" defaultValue={item?.title} required /></div>
        <div><span id="rd-kind-label">类型</span><WorkspaceFormSelect id="rd-kind" aria-labelledby="rd-kind-label" name="kind" defaultValue={item?.kind ?? 'TECH_EXPLORATION'}>{KINDS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</WorkspaceFormSelect></div>
        <div><span id="rd-status-label">状态</span><WorkspaceFormSelect id="rd-status" aria-labelledby="rd-status-label" name="status" defaultValue={item?.status ?? 'DRAFT'}>{STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</WorkspaceFormSelect></div>
        <div className="operations-editor__wide"><label htmlFor="rd-objective">目标</label><Input id="rd-objective" name="objective" defaultValue={item?.objective ?? ''} /></div>
        <div className="operations-editor__wide"><label htmlFor="rd-expected">预期成果</label><Input id="rd-expected" name="expectedOutcome" defaultValue={item?.expectedOutcome ?? ''} /></div>
        <div><label htmlFor="rd-owner">负责人</label><Input id="rd-owner" name="ownerName" defaultValue={item?.ownerName ?? ''} /></div>
        <div><label htmlFor="rd-hours">计划投入（小时）</label><Input id="rd-hours" type="number" min={0} name="plannedPersonHours" defaultValue={String(item?.plannedPersonHours ?? 0)} /></div>
        <div><label htmlFor="rd-start">计划开始</label><DateTimePickerField id="rd-start" aria-label="计划开始" name="plannedStartAt" defaultValue={item?.plannedStartAt ?? ''} /></div>
        <div><label htmlFor="rd-end">计划结束</label><DateTimePickerField id="rd-end" aria-label="计划结束" name="plannedEndAt" defaultValue={item?.plannedEndAt ?? ''} /></div>
        <footer><Button onClick={onCancel}>取消</Button><Button htmlType="submit" theme="solid" type="primary" loading={saving}>保存</Button></footer>
      </form>
    </Modal>
  )
}
