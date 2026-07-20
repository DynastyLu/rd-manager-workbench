import { config } from '@/lib/config'
import { request } from '@/lib/http'

export type ReportBucket = 'WEEK' | 'MONTH'
export type ReportKind = 'PORTFOLIO' | 'TASKS' | 'RISKS' | 'RESOURCES' | 'INTELLIGENCE'
export type ReportFormat = 'CSV' | 'XLSX'
export interface ReportsQuery { from: string; to: string; bucket: ReportBucket }
export interface PortfolioReport {
  total: number; byStatus: Record<string, number>; byPhase: Record<string, number>; byHealth: Record<string, number>
  milestones: { total: number; achieved: number }; overdueTasks: number; highOrCriticalRisks: number
  rows: Array<{ id: string; code: string; name: string; status: string; phase: string; health: string; milestonePercent: number; overdueTasks: number; highOrCriticalRisks: number }>
}
export interface TaskTrendReport { totalCreated: number; totalCompleted: number; byStatus: Record<string, number>; buckets: Array<{ bucket: string; created: number; completed: number }> }
export interface RiskTrendReport { totalCreated: number; totalClosed: number; open: number; highOrCritical: number; byLevel: Record<string, number>; buckets: Array<{ bucket: string; created: number; closed: number }> }
export interface ResourceReport { resourceCount: number; plannedHours: number; capacityHours: number; utilizationPercent: number | null; overloadedResources: number; weeks: Array<{ weekStartAt: string; plannedHours: number; capacityHours: number; utilizationPercent: number | null; overloaded: boolean }>; rows: Array<{ id: string; displayName: string; plannedHours: number; capacityHours: number; utilizationPercent: number | null; overloaded: boolean }> }
export interface IntelligenceReport { total: number; byTopic: Record<string, number>; bySource: Record<string, number>; byPriority: Record<string, number>; byConversionKind: Record<string, number>; buckets: Array<{ bucket: string; created: number }>; rows: Array<{ id: string; title: string; status: string; priority: string; topics: string[]; sources: string[]; conversions: string[] }> }

function params(query: ReportsQuery) { return new URLSearchParams({ from: query.from, to: query.to, bucket: query.bucket }).toString() }

export function getPortfolioReport(query: ReportsQuery): Promise<PortfolioReport> { return request(`/reports/portfolio?${params(query)}`) }
export function getTaskTrendReport(query: ReportsQuery): Promise<TaskTrendReport> { return request(`/reports/task-completion-trend?${params(query)}`) }
export function getRiskTrendReport(query: ReportsQuery): Promise<RiskTrendReport> { return request(`/reports/risk-trend?${params(query)}`) }
export function getResourceLoadReport(query: ReportsQuery): Promise<ResourceReport> { return request(`/reports/resource-load?${params(query)}`) }
export function getIntelligenceReport(query: ReportsQuery): Promise<IntelligenceReport> { return request(`/reports/intelligence?${params(query)}`) }
export function reportExportUrl(kind: ReportKind, format: ReportFormat, query: ReportsQuery) {
  const base = (config.apiBaseUrl || 'http://127.0.0.1:4311/api').replace(/\/$/, '')
  return `${base}/reports/export?${new URLSearchParams({ ...query, kind, format })}`
}
