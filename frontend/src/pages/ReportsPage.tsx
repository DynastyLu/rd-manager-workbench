import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Banner, Button, DatePicker, Empty, Select, Skeleton, TabPane, Tabs, Tag } from '@douyinfe/semi-ui'
import { IconDownload, IconRefresh } from '@douyinfe/semi-icons'
import {
  getIntelligenceReport, getPortfolioReport, getResourceLoadReport, getRiskTrendReport, getTaskTrendReport,
  reportExportUrl, type ReportKind, type ReportsQuery,
} from '@/modules/workbench/api/reports'
import './ReportsPage.less'

function initialRange(): ReportsQuery {
  const to = new Date(); const from = new Date(to.getTime() - 84 * 86_400_000)
  const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return { from: localDate(from), to: localDate(to), bucket: 'WEEK' }
}
const REPORT_KIND_BY_TAB: Record<string, ReportKind> = { portfolio: 'PORTFOLIO', tasks: 'TASKS', risks: 'RISKS', resources: 'RESOURCES', intelligence: 'INTELLIGENCE' }
const percent = (value: number | null) => value === null ? '不可计算' : `${value}%`

function DataTable({ label, headers, rows }: { label: string; headers: string[]; rows: Array<Array<string | number>> }) {
  if (!rows.length) return <Empty title="当前范围没有数据" />
  return <div className="reports-table-wrap"><table aria-label={label}><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={`${row[0]}-${rowIndex}`}>{row.map((cell, index) => index === 0 ? <th key={index}>{cell}</th> : <td key={index}>{cell}</td>)}</tr>)}</tbody></table></div>
}

export default function ReportsPage() {
  const [draft, setDraft] = useState(initialRange)
  const [query, setQuery] = useState(initialRange)
  const [activeTab, setActiveTab] = useState('portfolio')
  const portfolio = useQuery({ queryKey: ['reports', 'portfolio', query], queryFn: () => getPortfolioReport(query) })
  const tasks = useQuery({ queryKey: ['reports', 'tasks', query], queryFn: () => getTaskTrendReport(query) })
  const risks = useQuery({ queryKey: ['reports', 'risks', query], queryFn: () => getRiskTrendReport(query) })
  const resources = useQuery({ queryKey: ['reports', 'resources', query], queryFn: () => getResourceLoadReport(query) })
  const intelligence = useQuery({ queryKey: ['reports', 'intelligence', query], queryFn: () => getIntelligenceReport(query) })
  const reports = [portfolio, tasks, risks, resources, intelligence]
  const currentKind = REPORT_KIND_BY_TAB[activeTab] ?? 'PORTFOLIO'
  const refresh = () => { reports.forEach((report) => { void report.refetch() }) }

  return <div className="reports-page">
    <header className="reports-page__header">
      <div><p>INSIGHTS</p><h1>统计报表</h1><span>项目组合、任务、风险、资源与情报均由本地真实数据聚合。</span></div>
      <div><Button icon={<IconRefresh />} onClick={refresh}>刷新</Button><Button icon={<IconDownload />}><a href={reportExportUrl(currentKind, 'CSV', query)} download>导出 CSV</a></Button><Button icon={<IconDownload />}><a href={reportExportUrl(currentKind, 'XLSX', query)} download>导出 Excel</a></Button></div>
    </header>
    <section className="reports-filter" aria-label="报表筛选">
      <DatePicker aria-label="开始日期" type="date" value={draft.from} onChange={(_, text) => setDraft((current) => ({ ...current, from: String(text) }))} /><span>至</span>
      <DatePicker aria-label="结束日期" type="date" value={draft.to} onChange={(_, text) => setDraft((current) => ({ ...current, to: String(text) }))} />
      <Select aria-label="聚合周期" value={draft.bucket} optionList={[{ value: 'WEEK', label: '按周' }, { value: 'MONTH', label: '按月' }]} onChange={(value) => setDraft((current) => ({ ...current, bucket: value as ReportsQuery['bucket'] }))} />
      <Button theme="solid" type="primary" onClick={() => setQuery(draft)}>应用</Button>
    </section>
    {reports.some(({ isError }) => isError) ? <Banner type="danger" fullMode={false} title="部分报表读取失败" description="请检查日期范围或本地服务状态后重试。" closeIcon={null} /> : null}
    {reports.some(({ isLoading }) => isLoading) ? <Skeleton.Paragraph rows={6} /> : null}
    <Tabs activeKey={activeTab} onChange={setActiveTab} type="line" className="reports-tabs">
      <TabPane tab="项目组合" itemKey="portfolio">
        {portfolio.data ? <section aria-label="项目组合报表"><div className="reports-cards"><article><h2>项目总数</h2><strong>{portfolio.data.total}</strong></article><article><h2>里程碑达成</h2><strong>{portfolio.data.milestones.achieved}/{portfolio.data.milestones.total}</strong></article><article><h2>逾期任务</h2><strong>{portfolio.data.overdueTasks}</strong></article><article><h2>高/严重风险</h2><strong>{portfolio.data.highOrCriticalRisks}</strong></article></div><p role="status">健康度：{Object.entries(portfolio.data.byHealth).map(([key, value]) => `${key} ${value}`).join('，') || '暂无'}</p><DataTable label="项目组合明细" headers={['项目', '名称', '状态', '阶段', '健康度', '里程碑', '逾期任务', '高风险']} rows={portfolio.data.rows.map((row) => [row.code, row.name, row.status, row.phase, row.health, `${row.milestonePercent}%`, row.overdueTasks, row.highOrCriticalRisks])} /></section> : null}
      </TabPane>
      <TabPane tab="任务趋势" itemKey="tasks">
        {tasks.data ? <section><p role="status">新建 {tasks.data.totalCreated}，完成 {tasks.data.totalCompleted}</p><DataTable label="任务趋势数据" headers={['周期', '新建任务', '完成任务']} rows={tasks.data.buckets.map((row) => [row.bucket, row.created, row.completed])} /></section> : null}
      </TabPane>
      <TabPane tab="风险趋势" itemKey="risks">
        {risks.data ? <section><p role="status">新增 {risks.data.totalCreated}，关闭 {risks.data.totalClosed}，当前高/严重 {risks.data.highOrCritical}</p><DataTable label="风险趋势数据" headers={['周期', '新增风险', '关闭风险']} rows={risks.data.buckets.map((row) => [row.bucket, row.created, row.closed])} /></section> : null}
      </TabPane>
      <TabPane tab="资源负荷" itemKey="resources">
        {resources.data ? <section><p role="status">总体利用率 {percent(resources.data.utilizationPercent)}，{resources.data.overloadedResources} 个资源超载</p><DataTable label="资源负荷数据" headers={['周期', '计划工时', '容量工时', '利用率', '状态']} rows={resources.data.weeks.map((row) => [row.weekStartAt, row.plannedHours, row.capacityHours, percent(row.utilizationPercent), row.overloaded ? '超载' : '正常'])} /></section> : null}
      </TabPane>
      <TabPane tab="行业情报" itemKey="intelligence">
        {intelligence.data ? <section><p role="status">共 {intelligence.data.total} 张情报卡</p><div>{Object.entries(intelligence.data.byTopic).map(([name, value]) => <Tag key={name}>{name} {value}</Tag>)}</div><DataTable label="行业情报数据" headers={['情报', '状态', '优先级', '主题', '来源', '转换']} rows={intelligence.data.rows.map((row) => [row.title, row.status, row.priority, row.topics.join(' / '), row.sources.join(' / '), row.conversions.join(' / ')])} /></section> : null}
      </TabPane>
    </Tabs>
  </div>
}
