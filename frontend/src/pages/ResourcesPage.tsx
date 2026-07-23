import { WorkspaceFormSelect } from '@/components/workspace/WorkspaceFormSelect'
import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banner, Button, Empty, Input, Modal, Progress, SideSheet, Skeleton, Tag } from '@douyinfe/semi-ui'
import { IconChevronLeft, IconChevronRight, IconPlus, IconRefresh } from '@douyinfe/semi-icons'
import { Link } from 'react-router-dom'

import {
  createResource,
  createResourceLoad,
  createResourceSkill,
  archiveResource,
  archiveResourceLoad,
  deleteResourceSkill,
  getResourceLoadSummary,
  searchResourceReferences,
  updateResource,
  updateResourceLoad,
  updateResourceSkill,
  type ResourceLoadEntry,
  type ResourceLoadKind,
  type ResourceLoadSummary,
} from '@/modules/workbench/api/operations'
import './ResourcesPage.less'
import { ROUTES } from '@/constants/routes'
import { DateTimePickerField } from '@/components/FormControls/DateTimePickerField'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS
const LOAD_KIND_LABEL: Record<ResourceLoadKind, string> = {
  NON_PROJECT_RD: '非项目研发', PROJECT: '项目', TASK: '任务', OTHER: '其他',
}

function utcMonday(source = new Date()) {
  // Anchor “current week” to the user's local calendar day, then encode the
  // resulting Monday as UTC so the backend's @db.Date contract stays stable.
  const date = new Date(Date.UTC(source.getFullYear(), source.getMonth(), source.getDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() - day + 1)
  return date
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function weekLabel(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`)
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`
}

type LoadEditor = { resource: ResourceLoadSummary; weekStartAt: string; entry?: ResourceLoadEntry } | null
const formText = (data: FormData, name: string) => {
  const value = data.get(name)
  return typeof value === 'string' ? value : ''
}

export default function ResourcesPage() {
  const queryClient = useQueryClient()
  const [anchor, setAnchor] = useState(() => utcMonday())
  const [profileOpen, setProfileOpen] = useState(false)
  const [loadEditor, setLoadEditor] = useState<LoadEditor>(null)
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null)
  const [loadKind, setLoadKind] = useState<ResourceLoadKind>('OTHER')
  const [referenceSearch, setReferenceSearch] = useState('')
  const [referenceId, setReferenceId] = useState('')
  const range = useMemo(() => ({
    fromWeek: isoDate(anchor),
    toWeek: isoDate(new Date(anchor.getTime() + 12 * WEEK_MS)),
  }), [anchor])
  const summary = useQuery({
    queryKey: ['resource-load-summary', range],
    queryFn: () => getResourceLoadSummary(range.fromWeek, range.toWeek),
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['resource-load-summary'] })
  const profileCreate = useMutation({
    mutationFn: (input: Parameters<typeof createResource>[0]) => createResource(input),
    onSuccess: async () => { setProfileOpen(false); await refresh() },
  })
  const loadSave = useMutation({
    mutationFn: ({ resourceId, entryId, input }: { resourceId: string; entryId?: string; input: Parameters<typeof createResourceLoad>[1] }) => entryId ? updateResourceLoad(resourceId, entryId, input) : createResourceLoad(resourceId, input),
    onSuccess: async () => { setLoadEditor(null); await refresh() },
  })
  const profileUpdate = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateResource>[1] }) => updateResource(id, input),
    onSuccess: refresh,
  })
  const skillCreate = useMutation({
    mutationFn: ({ resourceId, name, level }: { resourceId: string; name: string; level: 'AWARE' | 'PRACTICING' | 'PROFICIENT' | 'EXPERT' }) => createResourceSkill(resourceId, { name, level }),
    onSuccess: refresh,
  })
  const skillDelete = useMutation({
    mutationFn: ({ resourceId, skillId }: { resourceId: string; skillId: string }) => deleteResourceSkill(resourceId, skillId),
    onSuccess: refresh,
  })
  const skillUpdate = useMutation({ mutationFn: ({ resourceId, skillId, level }: { resourceId: string; skillId: string; level: 'AWARE' | 'PRACTICING' | 'PROFICIENT' | 'EXPERT' }) => updateResourceSkill(resourceId, skillId, { level }), onSuccess: refresh })
  const resourceArchive = useMutation({ mutationFn: (resourceId: string) => archiveResource(resourceId), onSuccess: async () => { setSelectedResourceId(null); await refresh() } })
  const loadArchive = useMutation({ mutationFn: ({ resourceId, entryId }: { resourceId: string; entryId: string }) => archiveResourceLoad(resourceId, entryId), onSuccess: async () => { setLoadEditor(null); await refresh() } })
  const references = useQuery({
    queryKey: ['resource-reference-search', loadKind, referenceSearch],
    queryFn: () => searchResourceReferences(loadKind as Exclude<ResourceLoadKind, 'OTHER'>, referenceSearch),
    enabled: Boolean(loadEditor && loadKind !== 'OTHER' && referenceSearch.trim()),
  })
  const selectedResource = summary.data?.find((resource) => resource.id === selectedResourceId) ?? null

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    profileCreate.mutate({
      displayName: formText(data, 'displayName').trim(),
      roleTitle: formText(data, 'roleTitle').trim() || undefined,
      weeklyCapacityHours: Number(formText(data, 'weeklyCapacityHours') || 40),
      developmentGoal: formText(data, 'developmentGoal').trim() || undefined,
    })
  }

  function submitLoad(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!loadEditor) return
    const data = new FormData(event.currentTarget)
    const kind = loadKind
    loadSave.mutate({ resourceId: loadEditor.resource.id, entryId: loadEditor.entry?.id, input: {
      weekStartAt: formText(data, 'weekStartAt'),
      kind,
      plannedHours: Number(formText(data, 'plannedHours') || 0),
      note: formText(data, 'note').trim() || undefined,
      ...(kind === 'PROJECT' ? { projectId: referenceId, taskId: null, nonProjectRdItemId: null } : {}),
      ...(kind === 'TASK' ? { taskId: referenceId, projectId: null, nonProjectRdItemId: null } : {}),
      ...(kind === 'NON_PROJECT_RD' ? { nonProjectRdItemId: referenceId, projectId: null, taskId: null } : {}),
      ...(kind === 'OTHER' ? { nonProjectRdItemId: null, projectId: null, taskId: null } : {}),
    } })
  }

  const openLoadEditor = (resource: ResourceLoadSummary, weekStartAt: string, entry?: ResourceLoadEntry) => {
    setLoadEditor({ resource, weekStartAt, entry })
    setLoadKind(entry?.kind ?? 'OTHER')
    setReferenceId(entry?.projectId ?? entry?.taskId ?? entry?.nonProjectRdItemId ?? '')
    setReferenceSearch('')
  }
  const mutationError = [loadSave.error, loadArchive.error, resourceArchive.error, skillUpdate.error].find(Boolean)

  return (
    <div className="resources-page">
      <header className="resources-page__header">
        <div><p>RESOURCE PLANNING</p><h1>资源负荷</h1><span>按 13 周滚动查看容量、投入结构和超载风险。</span></div>
        <div className="resources-page__actions">
          <Link className="resources-page__switch" to={`${ROUTES.OPERATIONS}?tab=non-project-rd`}>非项目研发</Link>
          <Link className="resources-page__switch" to={ROUTES.REPORTS}>统计报表</Link>
          <Button icon={<IconRefresh />} onClick={() => { void summary.refetch() }}>刷新</Button>
          <Button aria-label="新建资源" theme="solid" type="primary" icon={<IconPlus />} onClick={() => setProfileOpen(true)}>新建资源</Button>
        </div>
      </header>

      <section className="resources-page__surface" aria-label="13周资源负荷矩阵">
        <div className="resources-range">
          <Button aria-label="前13周" icon={<IconChevronLeft />} onClick={() => setAnchor(new Date(anchor.getTime() - 13 * WEEK_MS))} />
          <strong>{range.fromWeek} — {range.toWeek}</strong>
          <Button aria-label="后13周" icon={<IconChevronRight />} onClick={() => setAnchor(new Date(anchor.getTime() + 13 * WEEK_MS))} />
          <Button onClick={() => setAnchor(utcMonday())}>回到本周</Button>
          <span>点击周格可登记投入；红色表示超过周容量。</span>
        </div>
        {summary.isError ? <Banner type="danger" fullMode={false} title="无法读取资源负荷" description="请确认本地服务已启动后重试。" closeIcon={null} /> : null}
        {summary.isLoading ? <Skeleton.Paragraph rows={8} /> : null}
        {!summary.isLoading && !summary.data?.length ? <Empty title="还没有资源档案" description="先新建人员或虚拟资源，再登记每周投入。" /> : null}
        {summary.data?.length ? (
          <div className="resources-matrix-wrap">
            <table className="resources-matrix">
              <thead><tr><th>资源</th>{(summary.data[0]?.weeks ?? []).map((week) => <th key={week.weekStartAt}>{weekLabel(week.weekStartAt)}</th>)}</tr></thead>
              <tbody>{summary.data.map((resource) => (
                <tr key={resource.id}>
                  <th>
                    <strong>{resource.displayName}</strong><span>{resource.roleTitle || '未设置岗位'} · {resource.weeklyCapacityHours}h/周</span>
                    <div>{resource.skills.map((skill) => <Tag key={skill.id} size="small">{skill.name}</Tag>)}</div>
                    <Button size="small" theme="borderless" aria-label={`管理${resource.displayName}`} onClick={() => setSelectedResourceId(resource.id)}>管理</Button>
                  </th>
                  {resource.weeks.map((week) => (
                    <td key={week.weekStartAt} className={week.overloaded ? 'is-overloaded' : ''}>
                      <button type="button" aria-label={`${resource.displayName} ${week.weekStartAt} 安排负荷`} onClick={() => openLoadEditor(resource, week.weekStartAt)}>
                        <strong>{week.percent === null ? '不可计算' : `${week.percent}%`}</strong><span>{week.plannedHours}/{week.capacityHours}h</span>
                        <Progress percent={Math.min(week.percent ?? (week.plannedHours > 0 ? 100 : 0), 100)} showInfo={false} stroke={week.overloaded ? '#e5484d' : '#3370ff'} />
                        {week.overloaded ? <em>已超载</em> : <small>{Object.entries(week.byKind).map(([kind, hours]) => `${LOAD_KIND_LABEL[kind as ResourceLoadKind]} ${hours}h`).join(' · ') || '可安排'}</small>}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : null}
      </section>

      <Modal visible={profileOpen} title="新建资源" footer={null} onCancel={() => setProfileOpen(false)}>
        <form className="resources-editor" onSubmit={submitProfile}>
          <label htmlFor="resource-name">姓名</label><Input id="resource-name" name="displayName" required />
          <label htmlFor="resource-role">岗位</label><Input id="resource-role" name="roleTitle" />
          <label htmlFor="resource-capacity">周容量</label><Input id="resource-capacity" name="weeklyCapacityHours" type="number" min={0} max={168} defaultValue="40" required />
          <label htmlFor="resource-goal">发展目标</label><Input id="resource-goal" name="developmentGoal" />
          <footer><Button onClick={() => setProfileOpen(false)}>取消</Button><Button htmlType="submit" theme="solid" type="primary" loading={profileCreate.isPending}>保存资源</Button></footer>
        </form>
      </Modal>

      <Modal visible={Boolean(loadEditor)} title={`安排负荷 · ${loadEditor?.resource.displayName ?? ''}`} footer={null} onCancel={() => setLoadEditor(null)}>
        {mutationError ? <Banner type="danger" fullMode={false} title="操作失败" description={mutationError instanceof Error ? mutationError.message : '请检查填写内容'} closeIcon={null} /> : null}
        {loadEditor?.resource.weeks.find((week) => week.weekStartAt === loadEditor.weekStartAt)?.entries.length ? <section className="resource-load-entries"><h3>本周已登记</h3>{loadEditor.resource.weeks.find((week) => week.weekStartAt === loadEditor.weekStartAt)?.entries.map((entry) => <article key={entry.id}><div><strong>{entry.note || LOAD_KIND_LABEL[entry.kind]}</strong><span>{LOAD_KIND_LABEL[entry.kind]} · {entry.plannedHours}h</span></div><Button aria-label="编辑负荷" size="small" onClick={() => openLoadEditor(loadEditor.resource, loadEditor.weekStartAt, entry)}>编辑</Button><Button aria-label="归档负荷" size="small" type="danger" theme="borderless" onClick={() => loadArchive.mutate({ resourceId: loadEditor.resource.id, entryId: entry.id })}>归档</Button></article>)}</section> : null}
        <form key={loadEditor?.entry?.id ?? `${loadEditor?.resource.id}-${loadEditor?.weekStartAt}`} className="resources-editor" onSubmit={submitLoad}>
          <label htmlFor="load-week">周一</label><DateTimePickerField id="load-week" aria-label="负荷周一日期" name="weekStartAt" mode="date" defaultValue={loadEditor?.weekStartAt} required />
          <span id="load-kind-label">投入类型</span><WorkspaceFormSelect id="load-kind" aria-labelledby="load-kind-label" name="kind" value={loadKind} onChange={(event) => { setLoadKind(event.target.value as ResourceLoadKind); setReferenceId(''); setReferenceSearch('') }}>{Object.entries(LOAD_KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</WorkspaceFormSelect>
          {loadKind !== 'OTHER' ? <><label htmlFor="load-reference-search">搜索关联对象</label><Input id="load-reference-search" value={referenceSearch} onChange={setReferenceSearch} placeholder="输入名称、编号或标题" />{references.data?.length ? <div className="resource-reference-results">{references.data.map((item) => <button type="button" key={item.id} className={referenceId === item.id ? 'is-selected' : ''} onClick={() => setReferenceId(item.id)}>{item.label}</button>)}</div> : null}{referenceId ? <Tag color="blue">已选择关联对象</Tag> : null}</> : null}
          <label htmlFor="load-hours">计划小时</label><Input id="load-hours" name="plannedHours" type="number" step="0.25" min={0} max={9999} defaultValue={String(loadEditor?.entry?.plannedHours ?? 8)} required />
          <label htmlFor="load-note">说明</label><Input id="load-note" name="note" defaultValue={loadEditor?.entry?.note ?? ''} />
          <footer><Button onClick={() => setLoadEditor(null)}>取消</Button><Button htmlType="submit" theme="solid" type="primary" disabled={loadKind !== 'OTHER' && !referenceId} loading={loadSave.isPending}>保存负荷</Button></footer>
        </form>
      </Modal>

      <SideSheet visible={Boolean(selectedResource)} width={560} title={selectedResource ? `${selectedResource.displayName} · 资源档案` : '资源档案'} onCancel={() => setSelectedResourceId(null)}>
        {selectedResource ? <div className="resource-profile">
          <form className="resources-editor" onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            profileUpdate.mutate({ id: selectedResource.id, input: {
              displayName: formText(data, 'displayName').trim(),
              roleTitle: formText(data, 'roleTitle').trim() || null,
              weeklyCapacityHours: Number(formText(data, 'weeklyCapacityHours') || 40),
              developmentGoal: formText(data, 'developmentGoal').trim() || null,
            } })
          }}>
            <label htmlFor="profile-name">姓名</label><Input id="profile-name" name="displayName" defaultValue={selectedResource.displayName} required />
            <label htmlFor="profile-role">岗位</label><Input id="profile-role" name="roleTitle" defaultValue={selectedResource.roleTitle ?? ''} />
            <label htmlFor="profile-capacity">周容量</label><Input id="profile-capacity" name="weeklyCapacityHours" type="number" min={0} max={168} defaultValue={String(selectedResource.weeklyCapacityHours)} />
            <label htmlFor="profile-goal">发展目标</label><Input id="profile-goal" name="developmentGoal" defaultValue={selectedResource.developmentGoal ?? ''} />
            <footer><Button htmlType="submit" theme="solid" type="primary" loading={profileUpdate.isPending}>保存档案</Button></footer>
          </form>
          <section className="resource-profile__skills"><h2>技能档案</h2>
            <div>{selectedResource.skills.map((skill) => <article key={skill.id}><div><strong>{skill.name}</strong><WorkspaceFormSelect aria-label={`编辑${skill.name}等级`} value={skill.level} onChange={(event) => skillUpdate.mutate({ resourceId: selectedResource.id, skillId: skill.id, level: event.target.value as 'AWARE' | 'PRACTICING' | 'PROFICIENT' | 'EXPERT' })}><option value="AWARE">了解</option><option value="PRACTICING">实践中</option><option value="PROFICIENT">熟练</option><option value="EXPERT">专家</option></WorkspaceFormSelect></div><Button size="small" type="danger" theme="borderless" onClick={() => skillDelete.mutate({ resourceId: selectedResource.id, skillId: skill.id })}>删除</Button></article>)}</div>
            <form onSubmit={(event) => {
              event.preventDefault()
              const data = new FormData(event.currentTarget)
              const name = formText(data, 'skillName').trim()
              if (name) skillCreate.mutate({ resourceId: selectedResource.id, name, level: (formText(data, 'skillLevel') || 'PRACTICING') as 'AWARE' | 'PRACTICING' | 'PROFICIENT' | 'EXPERT' })
            }}>
              <Input aria-label="技能名称" name="skillName" placeholder="例如：TypeScript" />
              <WorkspaceFormSelect aria-label="技能等级" name="skillLevel" defaultValue="PRACTICING"><option value="AWARE">了解</option><option value="PRACTICING">实践中</option><option value="PROFICIENT">熟练</option><option value="EXPERT">专家</option></WorkspaceFormSelect>
              <Button htmlType="submit" loading={skillCreate.isPending}>添加技能</Button>
            </form>
          </section><footer className="resource-profile__danger"><Button type="danger" theme="borderless" onClick={() => resourceArchive.mutate(selectedResource.id)} loading={resourceArchive.isPending}>归档资源</Button><span>归档前需先归档全部负荷条目。</span></footer>
        </div> : null}
      </SideSheet>
    </div>
  )
}
