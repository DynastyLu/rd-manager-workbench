import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Empty,
  Input,
  Modal,
  Select,
  Skeleton,
  Tag,
  TextArea,
  Toast,
} from '@douyinfe/semi-ui'
import { IconArrowLeft, IconPlus } from '@douyinfe/semi-icons'
import { Link } from 'react-router-dom'
import {
  archiveIntelligenceBrief,
  listIntelligenceBriefs,
  listIntelligenceItems,
  saveIntelligenceBrief,
  updateIntelligenceBrief,
  type IntelligenceBrief,
  type IntelligenceBriefKind,
} from '@/modules/workbench/api/intelligence'
import { ROUTES } from '@/constants/routes'
import { DateTimePickerField } from '@/components/FormControls/DateTimePickerField'
import './IntelligenceBriefsPage.less'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="brief-field">
      <span>{label}</span>
      {children}
    </label>
  )
}
function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function IntelligenceBriefsPage() {
  const client = useQueryClient()
  const [kind, setKind] = useState<IntelligenceBriefKind>('DAILY')
  const [editorOpen, setEditorOpen] = useState(false)
  const [selected, setSelected] = useState<IntelligenceBrief | null>(null)
  const [date, setDate] = useState(today())
  const [title, setTitle] = useState('')
  const [introduction, setIntroduction] = useState('')
  const [itemIds, setItemIds] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const briefs = useQuery({
    queryKey: ['intelligence-briefs', kind],
    queryFn: () => listIntelligenceBriefs({ kind, pageSize: 100 }),
  })
  const items = useQuery({
    queryKey: ['intelligence-items', 'brief-candidates'],
    queryFn: () => listIntelligenceItems({ pageSize: 100 }),
  })
  const save = useMutation({
    mutationFn: (input: Parameters<typeof saveIntelligenceBrief>[0]) =>
      editingId ? updateIntelligenceBrief(editingId, input) : saveIntelligenceBrief(input),
    onSuccess: (brief) => {
      Toast.success(
        briefs.data?.data.some(({ id }) => id === brief.id) ? '已更新当日简报' : '简报已保存'
      )
      setEditorOpen(false)
      setEditingId(null)
      setSelected(brief)
      void client.invalidateQueries({ queryKey: ['intelligence-briefs'] })
    },
  })
  const archive = useMutation({
    mutationFn: archiveIntelligenceBrief,
    onSuccess: () => {
      setSelected(null)
      void client.invalidateQueries({ queryKey: ['intelligence-briefs'] })
    },
  })
  function openEditor(brief?: IntelligenceBrief) {
    setEditingId(brief?.id ?? null)
    setKind(brief?.kind ?? kind)
    setDate(brief?.briefDate.slice(0, 10) ?? today())
    setTitle(brief?.title ?? '')
    setIntroduction(brief?.introduction ?? '')
    setItemIds(brief?.items.map(({ itemId }) => itemId) ?? [])
    setEditorOpen(true)
  }
  return (
    <div className="brief-page">
      <header>
        <div>
          <Link to={ROUTES.INTELLIGENCE}>
            <IconArrowLeft /> 返回行业情报
          </Link>
          <h1>日报与周报</h1>
          <p>人工挑选情报卡并保存快照，历史内容不会被后续编辑改写。</p>
        </div>
        <Button aria-label="新建简报" theme="solid" type="primary" icon={<IconPlus />} onClick={() => openEditor()}>
          新建简报
        </Button>
      </header>
      <div className="brief-kind">
        <button className={kind === 'DAILY' ? 'active' : ''} onClick={() => setKind('DAILY')}>
          日报
        </button>
        <button className={kind === 'WEEKLY' ? 'active' : ''} onClick={() => setKind('WEEKLY')}>
          周报
        </button>
      </div>
      <section aria-label="情报简报工作区">
        <aside>
          {briefs.isPending ? (
            <Skeleton placeholder={<Skeleton.Paragraph rows={6} />} loading />
          ) : briefs.data?.data.length ? (
            briefs.data.data.map((brief) => (
              <button
                key={brief.id}
                className={selected?.id === brief.id ? 'active' : ''}
                onClick={() => setSelected(brief)}
              >
                <Tag color={brief.kind === 'DAILY' ? 'blue' : 'violet'}>
                  {brief.kind === 'DAILY' ? '日报' : '周报'}
                </Tag>
                <strong>{brief.title}</strong>
                <span>
                  {brief.briefDate.slice(0, 10)} · {brief.items.length} 条
                </span>
              </button>
            ))
          ) : (
            <Empty title="尚无情报简报" description="从真实情报卡中人工挑选内容。" />
          )}
        </aside>
        <section>
          {selected ? (
            <BriefDetail
              brief={selected}
              onEdit={() => openEditor(selected)}
              onArchive={() => archive.mutate(selected.id)}
            />
          ) : (
            <div className="brief-welcome">
              <span>BRIEF</span>
              <h2>把研判结果整理成一份可复用简报</h2>
              <p>从左侧选择已有简报，或新建一份日报/周报。</p>
            </div>
          )}
        </section>
      </section>
      <Modal
        title="简报编辑器"
        visible={editorOpen}
        footer={null}
        width={640}
        onCancel={() => { setEditorOpen(false); setEditingId(null) }}
      >
        <form
          className="brief-form"
          onSubmit={(event) => {
            event.preventDefault()
            save.mutate({
              kind,
              briefDate: date,
              title: title || undefined,
              introduction: introduction || undefined,
              itemIds,
            })
          }}
        >
          <Field label="简报类型">
            <Select
              aria-label="简报类型"
              value={kind}
              onChange={(value) => setKind(value as IntelligenceBriefKind)}
              optionList={[
                { value: 'DAILY', label: '日报' },
                { value: 'WEEKLY', label: '周报' },
              ]}
              style={{ width: '100%' }}
            />
          </Field>
          <Field label="日期">
            <DateTimePickerField mode="date" aria-label="日报日期" value={date} onChange={setDate} />
          </Field>
          <Field label="标题">
            <Input value={title} onChange={setTitle} placeholder="留空则使用默认标题" />
          </Field>
          <Field label="导语">
            <TextArea rows={3} value={introduction} onChange={setIntroduction} />
          </Field>
          <Field label="情报卡（按选择顺序写入）">
            <Select
              multiple
              value={itemIds}
              onChange={(value) => setItemIds(value as string[])}
              optionList={(items.data?.data ?? []).map((item) => ({
                value: item.id,
                label: `${item.title} · ${item.priority}`,
              }))}
              style={{ width: '100%' }}
              placeholder="选择情报卡"
            />
          </Field>
          <Button
            htmlType="submit"
            theme="solid"
            type="primary"
            loading={save.isPending}
            disabled={!date}
          >
            保存简报
          </Button>
        </form>
      </Modal>
    </div>
  )
}

function BriefDetail({
  brief,
  onEdit,
  onArchive,
}: {
  brief: IntelligenceBrief
  onEdit: () => void
  onArchive: () => void
}) {
  return (
    <article className="brief-detail">
      <div className="brief-detail__meta">
        <Tag>{brief.kind === 'DAILY' ? '日报' : '周报'}</Tag>
        <span>{brief.briefDate.slice(0, 10)}</span>
      </div>
      <h2>{brief.title}</h2>
      {brief.introduction ? <p className="brief-detail__intro">{brief.introduction}</p> : null}
      <div className="brief-detail__actions">
        <Button onClick={onEdit}>编辑与排序</Button>
        <Button type="danger" onClick={onArchive}>
          归档
        </Button>
      </div>
      <ol>
        {brief.items.map(({ id, snapshot }) => (
          <li key={id}>
            <header>
              <Tag
                color={
                  snapshot.priority === 'CRITICAL'
                    ? 'red'
                    : snapshot.priority === 'HIGH'
                      ? 'orange'
                      : 'blue'
                }
              >
                {snapshot.priority}
              </Tag>
              <h3>{snapshot.title}</h3>
            </header>
            <p>{snapshot.summary || '暂无摘要'}</p>
            <footer>
              {snapshot.sourceNames.join(' · ') || '未记录来源'}
              {snapshot.canonicalUrl ? (
                <a href={snapshot.canonicalUrl} target="_blank" rel="noreferrer noopener">
                  原文 ↗
                </a>
              ) : null}
            </footer>
          </li>
        ))}
      </ol>
    </article>
  )
}
