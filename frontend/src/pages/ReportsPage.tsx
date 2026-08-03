import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Banner, Button, Checkbox, DatePicker, Empty, Input, Select, Skeleton, TabPane, Tabs, Tag, Toast } from '@douyinfe/semi-ui'
import { IconDownload, IconRefresh } from '@douyinfe/semi-icons'
import { Link } from 'react-router-dom'
import {
  getIntelligenceReport, getPortfolioReport, getResourceLoadReport, getRiskTrendReport, getTaskTrendReport,
  reportExportUrl, type ReportKind, type ReportsQuery,
} from '@/modules/workbench/api/reports'
import { downloadAuthenticated } from '@/lib/http'
import './ReportsPage.less'

function initialRange(): ReportsQuery {
  const to = new Date(); const from = new Date(to.getTime() - 84 * 86_400_000)
  const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return { from: localDate(from), to: localDate(to), bucket: 'WEEK' }
}
const REPORT_KIND_BY_TAB: Record<string, ReportKind> = { portfolio: 'PORTFOLIO', tasks: 'TASKS', risks: 'RISKS', resources: 'RESOURCES', intelligence: 'INTELLIGENCE' }
const percent = (value: number | null) => value === null ? '不可计算' : `${value}%`
const SAVED_VIEWS_KEY = 'rd-workbench.report-views.v1'
const REPORT_SNAPSHOTS_KEY = 'rd-workbench.report-snapshots.v1'

interface SavedReportView {
  id: string
  name: string
  query: ReportsQuery
  tab: string
}

function DataTable({ label, headers, rows }: { label: string; headers: string[]; rows: Array<Array<ReactNode>> }) {
  if (!rows.length) return <Empty title="当前范围没有数据" />
  return <div className="reports-table-wrap"><table aria-label={label}><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => index === 0 ? <th key={index}>{cell}</th> : <td key={index}>{cell}</td>)}</tr>)}</tbody></table></div>
}

function DistributionChart({ label, values }: { label: string; values: Record<string, number> }) {
  const entries = Object.entries(values)
  const maximum = Math.max(1, ...entries.map(([, value]) => value))
  return <div className="reports-chart" role="img" aria-label={label}>
    {entries.length ? entries.map(([name, value]) => <div className="reports-chart__row" key={name}>
      <span>{name}</span><i><b style={{ width: `${Math.max(4, value / maximum * 100)}%` }} /></i><strong>{value}</strong>
    </div>) : <span className="reports-chart__empty">暂无分布数据</span>}
  </div>
}

function previousPeriod(query: ReportsQuery): ReportsQuery {
  const from = new Date(`${query.from}T00:00:00`)
  const to = new Date(`${query.to}T00:00:00`)
  const duration = to.getTime() - from.getTime() + 86_400_000
  const previousTo = new Date(from.getTime() - 86_400_000)
  const previousFrom = new Date(previousTo.getTime() - duration + 86_400_000)
  const format = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return { ...query, from: format(previousFrom), to: format(previousTo) }
}

function presetRange(preset: 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_12_WEEKS'): ReportsQuery {
  const now = new Date()
  const format = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  if (preset === 'THIS_MONTH') {
    return {
      from: format(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: format(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      bucket: 'MONTH',
    }
  }
  const mondayOffset = (now.getDay() + 6) % 7
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset)
  const from = preset === 'THIS_WEEK'
    ? monday
    : new Date(monday.getTime() - 11 * 7 * 86_400_000)
  const to = preset === 'THIS_WEEK'
    ? new Date(monday.getTime() + 6 * 86_400_000)
    : now
  return { from: format(from), to: format(to), bucket: 'WEEK' }
}

export default function ReportsPage() {
  const [draft, setDraft] = useState(initialRange)
  const [query, setQuery] = useState(initialRange)
  const [activeTab, setActiveTab] = useState('portfolio')
  const [viewName, setViewName] = useState('')
  const [compare, setCompare] = useState(false)
  const [savedViews, setSavedViews] = useState<SavedReportView[]>(() => {
    try { return JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY) ?? '[]') as SavedReportView[] } catch { return [] }
  })
  const comparisonQuery = useMemo(() => previousPeriod(query), [query])
  const portfolio = useQuery({ queryKey: ['reports', 'portfolio', query], queryFn: () => getPortfolioReport(query) })
  const tasks = useQuery({ queryKey: ['reports', 'tasks', query], queryFn: () => getTaskTrendReport(query) })
  const risks = useQuery({ queryKey: ['reports', 'risks', query], queryFn: () => getRiskTrendReport(query) })
  const resources = useQuery({ queryKey: ['reports', 'resources', query], queryFn: () => getResourceLoadReport(query) })
  const intelligence = useQuery({ queryKey: ['reports', 'intelligence', query], queryFn: () => getIntelligenceReport(query) })
  const previousPortfolio = useQuery({ queryKey: ['reports', 'portfolio', comparisonQuery], queryFn: () => getPortfolioReport(comparisonQuery), enabled: compare })
  const previousTasks = useQuery({ queryKey: ['reports', 'tasks', comparisonQuery], queryFn: () => getTaskTrendReport(comparisonQuery), enabled: compare })
  const previousRisks = useQuery({ queryKey: ['reports', 'risks', comparisonQuery], queryFn: () => getRiskTrendReport(comparisonQuery), enabled: compare })
  const previousResources = useQuery({ queryKey: ['reports', 'resources', comparisonQuery], queryFn: () => getResourceLoadReport(comparisonQuery), enabled: compare })
  const previousIntelligence = useQuery({ queryKey: ['reports', 'intelligence', comparisonQuery], queryFn: () => getIntelligenceReport(comparisonQuery), enabled: compare })
  const reports = [portfolio, tasks, risks, resources, intelligence]
  const currentKind = REPORT_KIND_BY_TAB[activeTab] ?? 'PORTFOLIO'
  const refresh = () => { reports.forEach((report) => { void report.refetch() }) }
  const saveView = () => {
    const name = viewName.trim()
    if (!name) { Toast.warning('请先填写视图名称'); return }
    const next = [...savedViews.filter((view) => view.name !== name), { id: crypto.randomUUID(), name, query, tab: activeTab }]
    setSavedViews(next)
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next))
    setViewName('')
    Toast.success('报表视图已保存')
  }
  const applySavedView = (id: unknown) => {
    const view = savedViews.find((item) => item.id === id)
    if (!view) return
    setDraft(view.query); setQuery(view.query); setActiveTab(view.tab)
  }
  const saveSnapshot = () => {
    const payload = activeTab === 'portfolio' ? portfolio.data
      : activeTab === 'tasks' ? tasks.data
        : activeTab === 'risks' ? risks.data
          : activeTab === 'resources' ? resources.data
            : intelligence.data
    if (!payload) { Toast.warning('报表数据尚未加载完成'); return }
    let snapshots: unknown[] = []
    try { snapshots = JSON.parse(localStorage.getItem(REPORT_SNAPSHOTS_KEY) ?? '[]') as unknown[] } catch { snapshots = [] }
    snapshots.unshift({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      kind: currentKind,
      query,
      payload,
    })
    localStorage.setItem(REPORT_SNAPSHOTS_KEY, JSON.stringify(snapshots.slice(0, 52)))
    Toast.success(query.bucket === 'WEEK' ? '周报表快照已保存' : '月报表快照已保存')
  }

  return <div className="reports-page">
    <div className="workspace-module-toolbar">
      <div className="workspace-module-toolbar__actions"><Button icon={<IconRefresh />} onClick={refresh}>刷新</Button><Button onClick={saveSnapshot}>保存快照</Button><Button icon={<IconDownload />} aria-label="导出 CSV" onClick={() => { void downloadAuthenticated(reportExportUrl(currentKind, 'CSV', query)) }}>导出 CSV</Button><Button icon={<IconDownload />} aria-label="导出 Excel" onClick={() => { void downloadAuthenticated(reportExportUrl(currentKind, 'XLSX', query)) }}>导出 Excel</Button></div>
    </div>
    <section className="reports-filter" aria-label="报表筛选">
      <div className="reports-filter__range">
        <Select
          className="reports-filter__preset"
          aria-label="快捷周期"
          placeholder="快捷周期"
          optionList={[
            { value: 'THIS_WEEK', label: '本周' },
            { value: 'THIS_MONTH', label: '本月' },
            { value: 'LAST_12_WEEKS', label: '近 12 周' },
          ]}
          onChange={(value) => {
            const range = presetRange(value as 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_12_WEEKS')
            setDraft(range); setQuery(range)
          }}
        />
        <DatePicker aria-label="开始日期" type="date" value={draft.from} onChange={(_, text) => setDraft((current) => ({ ...current, from: String(text) }))} />
        <span className="reports-filter__range-separator">至</span>
        <DatePicker aria-label="结束日期" type="date" value={draft.to} onChange={(_, text) => setDraft((current) => ({ ...current, to: String(text) }))} />
        <Select className="reports-filter__bucket" aria-label="聚合周期" value={draft.bucket} optionList={[{ value: 'WEEK', label: '按周' }, { value: 'MONTH', label: '按月' }]} onChange={(value) => setDraft((current) => ({ ...current, bucket: value as ReportsQuery['bucket'] }))} />
        <Button theme="solid" type="primary" onClick={() => setQuery(draft)}>应用</Button>
        <Checkbox checked={compare} onChange={(event) => setCompare(Boolean(event.target.checked))}>对比上一周期</Checkbox>
      </div>
      <span className="reports-filter__divider" />
      <div className="reports-filter__views">
        <Input aria-label="视图名称" value={viewName} onChange={setViewName} placeholder="视图名称" />
        <Button onClick={saveView}>保存当前视图</Button>
        <Select aria-label="已保存视图" placeholder="已保存视图" optionList={savedViews.map((view) => ({ value: view.id, label: view.name }))} onChange={applySavedView} />
      </div>
    </section>
    {reports.some(({ isError }) => isError) ? <Banner type="danger" fullMode={false} title="部分报表读取失败" description="请检查日期范围或本地服务状态后重试。" closeIcon={null} /> : null}
    {reports.some(({ isLoading }) => isLoading) ? <Skeleton.Paragraph rows={6} /> : null}
    <Tabs activeKey={activeTab} onChange={setActiveTab} type="line" className="reports-tabs">
      <TabPane tab="项目组合" itemKey="portfolio">
        {portfolio.data ? <section aria-label="项目组合报表"><div className="reports-cards"><article><h2>项目总数</h2><strong>{portfolio.data.total}</strong>{compare && previousPortfolio.data ? <p>较上期 {portfolio.data.total - previousPortfolio.data.total >= 0 ? '+' : ''}{portfolio.data.total - previousPortfolio.data.total}</p> : null}</article><article><h2>里程碑达成</h2><strong>{portfolio.data.milestones.achieved}/{portfolio.data.milestones.total}</strong></article><article><h2>逾期任务</h2><strong>{portfolio.data.overdueTasks}</strong></article><article><h2>高/严重风险</h2><strong>{portfolio.data.highOrCriticalRisks}</strong></article></div><DistributionChart label="项目健康度分布图" values={portfolio.data.byHealth} /><DataTable label="项目组合明细" headers={['项目', '名称', '状态', '阶段', '健康度', '里程碑', '逾期任务', '高风险']} rows={portfolio.data.rows.map((row) => [row.code, <Link key={row.id} aria-label={`打开项目 ${row.name}`} to={`/spaces/projects/${row.id}/overview`}>{row.name}</Link>, row.status, row.phase, row.health, `${row.milestonePercent}%`, row.overdueTasks, row.highOrCriticalRisks])} /></section> : null}
      </TabPane>
      <TabPane tab="任务趋势" itemKey="tasks">
        {tasks.data ? <section><p role="status">新建 {tasks.data.totalCreated}，完成 {tasks.data.totalCompleted}{compare && previousTasks.data ? `，较上期完成 ${tasks.data.totalCompleted - previousTasks.data.totalCompleted >= 0 ? '+' : ''}${tasks.data.totalCompleted - previousTasks.data.totalCompleted}` : ''}</p><DistributionChart label="任务状态分布图" values={tasks.data.byStatus} /><DataTable label="任务趋势数据" headers={['周期', '新建任务', '完成任务']} rows={tasks.data.buckets.map((row) => [<Link key={row.bucket} to={`/my-work?from=${row.bucket}`}>{row.bucket}</Link>, row.created, row.completed])} /></section> : null}
      </TabPane>
      <TabPane tab="风险趋势" itemKey="risks">
        {risks.data ? <section><p role="status">新增 {risks.data.totalCreated}，关闭 {risks.data.totalClosed}，当前高/严重 {risks.data.highOrCritical}{compare && previousRisks.data ? `，较上期高风险 ${risks.data.highOrCritical - previousRisks.data.highOrCritical >= 0 ? '+' : ''}${risks.data.highOrCritical - previousRisks.data.highOrCritical}` : ''}</p><DistributionChart label="风险等级分布图" values={risks.data.byLevel} /><DataTable label="风险趋势数据" headers={['周期', '新增风险', '关闭风险']} rows={risks.data.buckets.map((row) => [<Link key={row.bucket} to="/library/governance/risks">{row.bucket}</Link>, row.created, row.closed])} /></section> : null}
      </TabPane>
      <TabPane tab="资源负荷" itemKey="resources">
        {resources.data ? <section><p role="status">总体利用率 {percent(resources.data.utilizationPercent)}，{resources.data.overloadedResources} 个资源超载{compare && previousResources.data ? `，上期 ${percent(previousResources.data.utilizationPercent)}` : ''}</p><DistributionChart label="资源利用率分布图" values={Object.fromEntries(resources.data.weeks.map((row) => [row.weekStartAt, row.utilizationPercent ?? 0]))} /><DataTable label="资源负荷数据" headers={['周期', '计划工时', '容量工时', '利用率', '状态']} rows={resources.data.weeks.map((row) => [row.weekStartAt, row.plannedHours, row.capacityHours, percent(row.utilizationPercent), row.overloaded ? '超载' : '正常'])} /></section> : null}
      </TabPane>
      <TabPane tab="行业情报" itemKey="intelligence">
        {intelligence.data ? <section><p role="status">共 {intelligence.data.total} 张情报卡{compare && previousIntelligence.data ? `，较上期 ${intelligence.data.total - previousIntelligence.data.total >= 0 ? '+' : ''}${intelligence.data.total - previousIntelligence.data.total}` : ''}</p><div>{Object.entries(intelligence.data.byTopic).map(([name, value]) => <Tag key={name}>{name} {value}</Tag>)}</div><DistributionChart label="行业情报主题分布图" values={intelligence.data.byTopic} /><DataTable label="行业情报数据" headers={['情报', '状态', '优先级', '主题', '来源', '转换']} rows={intelligence.data.rows.map((row) => [<Link key={row.id} to="/library/intelligence">{row.title}</Link>, row.status, row.priority, row.topics.join(' / '), row.sources.join(' / '), row.conversions.join(' / ')])} /></section> : null}
      </TabPane>
    </Tabs>
  </div>
}
