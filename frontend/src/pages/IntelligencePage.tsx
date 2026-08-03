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
import {
  IconArticle,
  IconExternalOpen,
  IconPlus,
  IconSearch,
  IconTreeTriangleDown,
} from '@douyinfe/semi-icons'
import { Link } from 'react-router-dom'
import {
  archiveIntelligencePlan,
  archiveIntelligenceSource,
  archiveIntelligenceTopic,
  archiveIntelligenceItem,
  convertIntelligenceItem,
  createIntelligenceItem,
  createIntelligencePlan,
  createIntelligenceSource,
  createIntelligenceTopic,
  getIntelligenceItem,
  listIntelligenceItems,
  listIntelligencePlans,
  listIntelligenceRuns,
  listIntelligenceSources,
  listIntelligenceTopics,
  recordIntelligenceRun,
  updateIntelligenceItem,
  updateIntelligencePlan,
  updateIntelligenceSource,
  updateIntelligenceTopic,
  type IntelligenceItem,
  type IntelligencePriority,
  type IntelligenceSourceKind,
} from '@/modules/workbench/api/intelligence'
import { ROUTES } from '@/constants/routes'
import './IntelligencePage.less'

type WorkspaceTab = 'items' | 'topics' | 'sources' | 'plans'
type ConversionKind = 'task' | 'risk' | 'meeting-agenda' | 'knowledge-page'
type EditTarget = { kind: WorkspaceTab; id: string; name: string; description?: string }
const priorityLabel: Record<IntelligencePriority, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  CRITICAL: '紧急',
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="intel-field">
      <span>{label}</span>
      {children}
    </label>
  )
}
function value(form: FormData, name: string) {
  const item = form.get(name)
  return typeof item === 'string' ? item.trim() : ''
}

export default function IntelligencePage() {
  const client = useQueryClient()
  const [tab, setTab] = useState<WorkspaceTab>('items')
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const [runPlanId, setRunPlanId] = useState<string | null>(null)
  const [runItemsJson, setRunItemsJson] = useState('[]')
  const [runInputError, setRunInputError] = useState('')
  const [conversion, setConversion] = useState<
    'task' | 'risk' | 'meeting-agenda' | 'knowledge-page' | null
  >(null)
  const params = query.trim() ? { q: query.trim(), pageSize: 100 } : { pageSize: 100 }
  const items = useQuery({
    queryKey: ['intelligence-items', params],
    queryFn: () => listIntelligenceItems(params),
  })
  const topics = useQuery({
    queryKey: ['intelligence-topics', params],
    queryFn: () => listIntelligenceTopics(params),
  })
  const sources = useQuery({
    queryKey: ['intelligence-sources', params],
    queryFn: () => listIntelligenceSources(params),
  })
  const plans = useQuery({
    queryKey: ['intelligence-plans', params],
    queryFn: () => listIntelligencePlans(params),
  })
  const runs = useQuery({
    queryKey: ['intelligence-runs'],
    queryFn: () => listIntelligenceRuns({ pageSize: 20 }),
  })
  const detail = useQuery({
    queryKey: ['intelligence-item', selectedId],
    queryFn: () => getIntelligenceItem(selectedId!),
    enabled: Boolean(selectedId),
    initialData: items.data?.data.find(({ id }) => id === selectedId),
  })
  const refresh = (...keys: string[]) =>
    Promise.all(keys.map((key) => client.invalidateQueries({ queryKey: [key] })))
  const createItem = useMutation({
    mutationFn: createIntelligenceItem,
    onSuccess: (result) => {
      Toast.success(result.merged ? '已合并到已有情报卡' : '情报卡已创建')
      setCreateOpen(false)
      void refresh('intelligence-items')
    },
  })
  const archive = useMutation({
    mutationFn: archiveIntelligenceItem,
    onSuccess: () => {
      setSelectedId(null)
      void refresh('intelligence-items')
    },
  })
  const convert = useMutation({
    mutationFn: ({
      kind,
      input,
    }: {
      kind: 'task' | 'risk' | 'meeting-agenda' | 'knowledge-page'
      input: Record<string, unknown>
    }) => convertIntelligenceItem(selectedId!, kind, input),
    onSuccess: (result) => {
      Toast.success(result.alreadyExists ? '已存在转换结果' : '转换成功')
      setConversion(null)
      void refresh('intelligence-items', 'intelligence-item')
    },
  })
  const createTopic = useMutation({
    mutationFn: createIntelligenceTopic,
    onSuccess: () => {
      setCreateOpen(false)
      void refresh('intelligence-topics')
    },
  })
  const createSource = useMutation({
    mutationFn: createIntelligenceSource,
    onSuccess: () => {
      setCreateOpen(false)
      void refresh('intelligence-sources')
    },
  })
  const createPlan = useMutation({
    mutationFn: createIntelligencePlan,
    onSuccess: () => {
      setCreateOpen(false)
      void refresh('intelligence-plans')
    },
  })
  const edit = useMutation<
    unknown,
    Error,
    { target: EditTarget; name: string; description?: string }
  >({
    mutationFn: ({
      target,
      name,
      description,
    }: {
      target: EditTarget
      name: string
      description?: string
    }) => {
      if (target.kind === 'items')
        return updateIntelligenceItem(target.id, { title: name, summary: description ?? null })
      if (target.kind === 'topics')
        return updateIntelligenceTopic(target.id, { name, description: description ?? null })
      if (target.kind === 'sources') return updateIntelligenceSource(target.id, { name })
      return updateIntelligencePlan(target.id, { name })
    },
    onSuccess: () => {
      const kind = editing?.kind
      setEditing(null)
      if (kind) void refresh(`intelligence-${kind}`, 'intelligence-item')
    },
  })
  const archiveCatalog = useMutation({
    mutationFn: ({ kind, id }: Pick<EditTarget, 'kind' | 'id'>) => {
      if (kind === 'topics') return archiveIntelligenceTopic(id)
      if (kind === 'sources') return archiveIntelligenceSource(id)
      if (kind === 'plans') return archiveIntelligencePlan(id)
      return archiveIntelligenceItem(id)
    },
    onSuccess: (_result, target) => void refresh(`intelligence-${target.kind}`),
  })
  const runPlan = useMutation({
    mutationFn: ({ planId, items }: { planId: string; items: Array<{ title: string } & Record<string, unknown>> }) =>
      recordIntelligenceRun(planId, {
        status: 'SUCCEEDED',
        inputSummary: '人工采集完成',
        items,
      }),
    onSuccess: () => {
      setRunPlanId(null)
      setRunItemsJson('[]')
      void refresh('intelligence-runs', 'intelligence-plans', 'intelligence-items')
    },
  })
  const active =
    tab === 'items' ? items : tab === 'topics' ? topics : tab === 'sources' ? sources : plans

  function submitCreate(form: HTMLFormElement) {
    const data = new FormData(form)
    if (tab === 'items')
      createItem.mutate({
        title: value(data, 'title'),
        summary: value(data, 'summary') || undefined,
        canonicalUrl: value(data, 'canonicalUrl') || undefined,
        sourceId: value(data, 'sourceId'),
        priority: value(data, 'priority') || 'MEDIUM',
      })
    else if (tab === 'topics')
      createTopic.mutate({
        name: value(data, 'name'),
        description: value(data, 'description') || undefined,
        keywords: value(data, 'keywords')
          .split(/[，,]/)
          .map((item) => item.trim())
          .filter(Boolean),
      })
    else if (tab === 'sources')
      createSource.mutate({
        name: value(data, 'name'),
        kind: value(data, 'kind') as IntelligenceSourceKind,
        url: value(data, 'url') || undefined,
      })
    else {
      const frequency = value(data, 'frequency') as 'MANUAL' | 'DAILY' | 'WEEKLY'
      createPlan.mutate({
        sourceId: value(data, 'sourceId'),
        name: value(data, 'name'),
        frequency,
        runAtLocalTime: frequency === 'MANUAL' ? undefined : value(data, 'runAtLocalTime'),
        weekday: frequency === 'WEEKLY' ? Number(value(data, 'weekday')) : undefined,
      })
    }
  }

  return (
    <div className="intel-page">
      <div className="workspace-module-toolbar">
        <div className="intel-hero__actions workspace-module-toolbar__actions">
          <Link to={ROUTES.INTELLIGENCE_BRIEFS}>
            <Button icon={<IconArticle />}>日报与周报</Button>
          </Link>
          <Button
            theme="solid"
            type="primary"
            icon={<IconPlus />}
            onClick={() => setCreateOpen(true)}
          >
            新建
            {tab === 'items'
              ? '情报卡'
              : tab === 'topics'
                ? '主题'
                : tab === 'sources'
                  ? '来源'
                  : '计划'}
          </Button>
        </div>
      </div>
      <section className="intel-board">
        <Tabs activeKey={tab} onChange={(key) => setTab(key as WorkspaceTab)}>
          <TabPane tab="情报卡" itemKey="items" />
          <TabPane tab="主题" itemKey="topics" />
          <TabPane tab="来源" itemKey="sources" />
          <TabPane tab="采集计划" itemKey="plans" />
        </Tabs>
        <div className="intel-toolbar">
          <Input
            aria-label="搜索行业情报"
            prefix={<IconSearch />}
            value={query}
            onChange={setQuery}
            placeholder="搜索标题、摘要、主题或来源"
            showClear
          />
          <span>{active.data?.meta.total ?? 0} 条</span>
        </div>
        {active.isPending ? (
          <Skeleton placeholder={<Skeleton.Paragraph rows={6} />} loading />
        ) : active.isError ? (
          <Banner
            type="danger"
            fullMode={false}
            title="无法读取行业情报"
            description="请确认本地服务已启动。"
            closeIcon={null}
          >
            <Button onClick={() => void active.refetch()}>重试</Button>
          </Banner>
        ) : tab === 'items' ? (
          <ItemGrid items={items.data?.data ?? []} onOpen={setSelectedId} />
        ) : tab === 'topics' ? (
          <div className="intel-simple-grid">
            {topics.data?.data.map((topic) => (
              <article key={topic.id}>
                <IconTreeTriangleDown />
                <h3>{topic.name}</h3>
                <p>{topic.description || '暂无说明'}</p>
                <div>
                  {topic.keywords.map((key) => (
                    <Tag key={key}>{key}</Tag>
                  ))}
                </div>
                <div className="intel-card-actions">
                  <Button
                    size="small"
                    onClick={() =>
                      setEditing({
                        kind: 'topics',
                        id: topic.id,
                        name: topic.name,
                        description: topic.description ?? undefined,
                      })
                    }
                  >
                    编辑
                  </Button>
                  <Button
                    size="small"
                    type="danger"
                    onClick={() => archiveCatalog.mutate({ kind: 'topics', id: topic.id })}
                  >
                    归档
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : tab === 'sources' ? (
          <div className="intel-simple-grid">
            {sources.data?.data.map((source) => (
              <article key={source.id}>
                <Tag color="blue">{source.kind}</Tag>
                <h3>{source.name}</h3>
                <p>可信度 {source.credibility}/5</p>
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noreferrer noopener">
                    打开来源 <IconExternalOpen size="small" />
                  </a>
                ) : null}
                <div className="intel-card-actions">
                  <Button
                    size="small"
                    onClick={() =>
                      setEditing({ kind: 'sources', id: source.id, name: source.name })
                    }
                  >
                    编辑
                  </Button>
                  <Button
                    size="small"
                    type="danger"
                    onClick={() => archiveCatalog.mutate({ kind: 'sources', id: source.id })}
                  >
                    归档
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="intel-plan-list">
            {plans.data?.data.map((plan) => (
              <article key={plan.id}>
                <div>
                  <Tag color={plan.enabled ? 'green' : 'grey'}>
                    {plan.enabled ? '启用' : '停用'}
                  </Tag>
                  <h3>{plan.name}</h3>
                  <p>
                    {plan.source.name} · {plan.frequency}
                    {plan.runAtLocalTime ? ` · ${plan.runAtLocalTime}` : ''}
                  </p>
                  {plan.nextRunAt ? <p>下次执行：{new Date(plan.nextRunAt).toLocaleString('zh-CN')}</p> : null}
                </div>
                <div className="intel-card-actions">
                  <Button
                    size="small"
                    onClick={() => setEditing({ kind: 'plans', id: plan.id, name: plan.name })}
                  >
                    编辑
                  </Button>
                  <Button
                    size="small"
                    type="danger"
                    onClick={() => archiveCatalog.mutate({ kind: 'plans', id: plan.id })}
                  >
                    归档
                  </Button>
                  <Button loading={runPlan.isPending} onClick={() => { setRunPlanId(plan.id); setRunInputError('') }}>
                    录入采集结果
                  </Button>
                </div>
              </article>
            ))}
            {runs.data?.data.length ? (
              <aside>
                <strong>最近运行</strong>
                {runs.data.data.slice(0, 3).map((run) => (
                  <span key={run.id}>
                    {run.plan.name} · {run.status}
                  </span>
                ))}
              </aside>
            ) : null}
          </div>
        )}
      </section>
      <Modal
        title={`新建${tab === 'items' ? '情报卡' : tab === 'topics' ? '主题' : tab === 'sources' ? '来源' : '采集计划'}`}
        visible={createOpen}
        footer={null}
        onCancel={() => setCreateOpen(false)}
      >
        <form
          className="intel-form"
          onSubmit={(event) => {
            event.preventDefault()
            submitCreate(event.currentTarget)
          }}
        >
          {tab === 'items' ? (
            <>
              <Field label="标题">
                <Input name="title" required />
              </Field>
              <Field label="摘要">
                <TextArea name="summary" rows={3} />
              </Field>
              <Field label="原文链接">
                <Input name="canonicalUrl" />
              </Field>
              <Field label="来源">
                <WorkspaceFormSelect aria-label="来源" name="sourceId" required>
                  <option value="">请选择来源</option>
                  {(sources.data?.data ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </WorkspaceFormSelect>
              </Field>
              <Field label="优先级">
                <WorkspaceFormSelect aria-label="优先级" name="priority" defaultValue="MEDIUM">
                  {Object.entries(priorityLabel).map(([optionValue, label]) => (
                    <option key={optionValue} value={optionValue}>
                      {label}
                    </option>
                  ))}
                </WorkspaceFormSelect>
              </Field>
            </>
          ) : tab === 'topics' ? (
            <>
              <Field label="主题名称">
                <Input name="name" required />
              </Field>
              <Field label="说明">
                <TextArea name="description" />
              </Field>
              <Field label="关键词">
                <Input name="keywords" placeholder="多个关键词用逗号分隔" />
              </Field>
            </>
          ) : tab === 'sources' ? (
            <>
              <Field label="来源名称">
                <Input name="name" required />
              </Field>
              <Field label="类型">
                <WorkspaceFormSelect aria-label="类型" name="kind" defaultValue="WEBSITE">
                  {['WEBSITE', 'RSS', 'NEWSLETTER', 'DATABASE', 'MANUAL'].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </WorkspaceFormSelect>
              </Field>
              <Field label="地址">
                <Input name="url" />
              </Field>
            </>
          ) : (
            <>
              <Field label="计划名称">
                <Input name="name" required />
              </Field>
              <Field label="来源">
                <WorkspaceFormSelect aria-label="来源" name="sourceId" required>
                  <option value="">请选择来源</option>
                  {(sources.data?.data ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </WorkspaceFormSelect>
              </Field>
              <Field label="频率">
                <WorkspaceFormSelect aria-label="频率" name="frequency" defaultValue="MANUAL">
                  {['MANUAL', 'DAILY', 'WEEKLY'].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </WorkspaceFormSelect>
              </Field>
              <Field label="执行时间">
                <Input name="runAtLocalTime" placeholder="09:30" />
              </Field>
              <Field label="星期">
                <Input name="weekday" placeholder="1-7" />
              </Field>
            </>
          )}
          <Button htmlType="submit" theme="solid" type="primary">
            保存
          </Button>
        </form>
      </Modal>
      <SideSheet
        title="情报卡详情"
        visible={Boolean(selectedId)}
        onCancel={() => setSelectedId(null)}
        width={560}
      >
        {detail.data ? (
          <ItemDetail
            item={detail.data}
            onConvert={setConversion}
            onEdit={() =>
              setEditing({
                kind: 'items',
                id: detail.data.id,
                name: detail.data.title,
                description: detail.data.summary ?? undefined,
              })
            }
            onArchive={() => archive.mutate(detail.data.id)}
          />
        ) : (
          <Skeleton placeholder={<Skeleton.Paragraph rows={8} />} loading />
        )}
      </SideSheet>
      <Modal
        title="录入结构化采集结果"
        visible={Boolean(runPlanId)}
        footer={null}
        onCancel={() => setRunPlanId(null)}
      >
        <form
          className="intel-form"
          onSubmit={(event) => {
            event.preventDefault()
            try {
              const parsed = JSON.parse(runItemsJson) as unknown
              if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item !== 'object' || typeof (item as { title?: unknown }).title !== 'string')) {
                throw new Error('请输入对象数组，每条至少包含 title')
              }
              setRunInputError('')
              runPlan.mutate({ planId: runPlanId!, items: parsed as Array<{ title: string } & Record<string, unknown>> })
            } catch (error) {
              setRunInputError(error instanceof Error ? error.message : 'JSON 格式错误')
            }
          }}
        >
          <Field label="采集条目（JSON 数组）">
            <TextArea
              aria-label="采集条目 JSON"
              rows={10}
              value={runItemsJson}
              onChange={setRunItemsJson}
              placeholder={'[{"title":"政策更新","canonicalUrl":"https://...","summary":"摘要"}]'}
            />
          </Field>
          {runInputError ? <Banner type="danger" fullMode={false} title={runInputError} closeIcon={null} /> : null}
          <Button htmlType="submit" theme="solid" type="primary" loading={runPlan.isPending}>保存并入库</Button>
        </form>
      </Modal>
      <ConversionModal
        kind={conversion}
        item={detail.data}
        onCancel={() => setConversion(null)}
        onSubmit={(kind, input) => convert.mutate({ kind, input })}
      />
      <Modal
        title="编辑行业情报"
        visible={Boolean(editing)}
        footer={null}
        onCancel={() => setEditing(null)}
      >
        {editing ? (
          <form
            className="intel-form"
            onSubmit={(event) => {
              event.preventDefault()
              const form = new FormData(event.currentTarget)
              edit.mutate({
                target: editing,
                name: value(form, 'name'),
                description: value(form, 'description') || undefined,
              })
            }}
          >
            <Field label="名称">
              <Input name="name" defaultValue={editing.name} required />
            </Field>
            {editing.kind === 'items' || editing.kind === 'topics' ? (
              <Field label="说明">
                <TextArea name="description" defaultValue={editing.description} rows={4} />
              </Field>
            ) : null}
            <Button htmlType="submit" theme="solid" type="primary" loading={edit.isPending}>
              保存修改
            </Button>
          </form>
        ) : null}
      </Modal>
    </div>
  )
}

function ItemGrid({ items, onOpen }: { items: IntelligenceItem[]; onOpen: (id: string) => void }) {
  if (!items.length)
    return <Empty title="还没有情报卡" description="先配置来源，再录入第一条可追溯情报。" />
  return (
    <div className="intel-card-grid">
      {items.map((item) => (
        <button
          type="button"
          aria-label={`打开：${item.title}`}
          className="intel-card"
          key={item.id}
          onClick={() => onOpen(item.id)}
        >
          <div>
            <Tag
              color={
                item.priority === 'CRITICAL' ? 'red' : item.priority === 'HIGH' ? 'orange' : 'blue'
              }
            >
              {priorityLabel[item.priority]}
            </Tag>
            <span>{item.status}</span>
          </div>
          <h3>{item.title}</h3>
          <p>{item.summary || '暂无摘要'}</p>
          <footer>
            {item.occurrences
              .slice(0, 2)
              .map(({ source }) => source.name)
              .join(' · ') || '未记录来源'}
            <span>{item.conversions.length ? `${item.conversions.length} 个行动` : '待研判'}</span>
          </footer>
        </button>
      ))}
    </div>
  )
}
function ItemDetail({
  item,
  onConvert,
  onEdit,
  onArchive,
}: {
  item: IntelligenceItem
  onConvert: (kind: 'task' | 'risk' | 'meeting-agenda' | 'knowledge-page') => void
  onEdit: () => void
  onArchive: () => void
}) {
  return (
    <div className="intel-detail">
      <div>
        <Tag>{priorityLabel[item.priority]}</Tag>
        <Tag>{item.status}</Tag>
      </div>
      <h2>{item.title}</h2>
      <p>{item.summary || '暂无摘要'}</p>
      {item.canonicalUrl ? (
        <a href={item.canonicalUrl} target="_blank" rel="noreferrer noopener">
          查看原文 <IconExternalOpen />
        </a>
      ) : null}
      <section>
        <h3>来源链</h3>
        {item.occurrences.map((occurrence) => (
          <div key={occurrence.id}>
            {occurrence.source.name}
            {occurrence.sourceUrl ? (
              <a href={occurrence.sourceUrl} target="_blank" rel="noreferrer noopener">
                打开
              </a>
            ) : null}
          </div>
        ))}
      </section>
      <section>
        <h3>转为行动</h3>
        <div className="intel-detail__actions">
          {(
            [
              ['task', '转为任务'],
              ['risk', '转为风险'],
              ['meeting-agenda', '转为会议议题'],
              ['knowledge-page', '转为知识页'],
            ] as const
          ).map(([kind, label]) => (
            <Button key={kind} onClick={() => onConvert(kind)}>
              {label}
            </Button>
          ))}
        </div>
      </section>
      <Button onClick={onEdit}>编辑情报卡</Button>
      <Button type="danger" onClick={onArchive}>
        归档情报卡
      </Button>
    </div>
  )
}
function ConversionModal({
  kind,
  item,
  onCancel,
  onSubmit,
}: {
  kind: ConversionKind | null
  item?: IntelligenceItem
  onCancel: () => void
  onSubmit: (kind: ConversionKind, input: Record<string, unknown>) => void
}) {
  return (
    <Modal title="转换情报卡" visible={Boolean(kind)} footer={null} onCancel={onCancel}>
      <form
        className="intel-form"
        onSubmit={(event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          const input: Record<string, unknown> = { title: value(form, 'title') }
          if (kind === 'risk')
            Object.assign(input, {
              likelihood: value(form, 'likelihood') || 'MEDIUM',
              impact: value(form, 'impact') || 'MEDIUM',
              level: value(form, 'level') || 'MEDIUM',
            })
          if (kind === 'meeting-agenda') input.meetingId = value(form, 'meetingId')
          if (kind) onSubmit(kind, input)
        }}
      >
        <Field label="标题">
          <Input name="title" defaultValue={item?.title} required />
        </Field>
        {kind === 'risk' ? (
          <>
            <Field label="可能性">
              <Input name="likelihood" defaultValue="MEDIUM" />
            </Field>
            <Field label="影响">
              <Input name="impact" defaultValue="MEDIUM" />
            </Field>
            <Field label="等级">
              <Input name="level" defaultValue="MEDIUM" />
            </Field>
          </>
        ) : null}
        {kind === 'meeting-agenda' ? (
          <Field label="会议 ID">
            <Input name="meetingId" required />
          </Field>
        ) : null}
        <Button htmlType="submit" theme="solid" type="primary">
          确认转换
        </Button>
      </form>
    </Modal>
  )
}
