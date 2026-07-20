import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReportsPage from '../ReportsPage'

const api = vi.hoisted(() => ({
  getPortfolioReport: vi.fn(), getTaskTrendReport: vi.fn(), getRiskTrendReport: vi.fn(),
  getResourceLoadReport: vi.fn(), getIntelligenceReport: vi.fn(), reportExportUrl: vi.fn((kind: string, format: string) => `/report-${kind}.${format}`),
}))
vi.mock('@/modules/workbench/api/reports', () => api)

describe('ReportsPage', () => {
  beforeEach(() => {
    api.getPortfolioReport.mockResolvedValue({ total: 1, byStatus: { ACTIVE: 1 }, byPhase: { EXECUTION: 1 }, byHealth: { RED: 1 }, milestones: { total: 2, achieved: 1 }, overdueTasks: 1, highOrCriticalRisks: 1, rows: [{ id: 'p1', code: 'P-1', name: '平台升级', status: 'ACTIVE', phase: 'EXECUTION', health: 'RED', milestonePercent: 50, overdueTasks: 1, highOrCriticalRisks: 1 }] })
    api.getTaskTrendReport.mockResolvedValue({ totalCreated: 2, totalCompleted: 1, byStatus: { DONE: 1 }, buckets: [{ bucket: '2026-06-29', created: 2, completed: 1 }] })
    api.getRiskTrendReport.mockResolvedValue({ totalCreated: 2, totalClosed: 1, open: 1, highOrCritical: 1, byLevel: { HIGH: 1 }, buckets: [{ bucket: '2026-06-29', created: 2, closed: 1 }] })
    api.getResourceLoadReport.mockResolvedValue({ resourceCount: 1, plannedHours: 50, capacityHours: 40, utilizationPercent: 125, overloadedResources: 1, weeks: [{ weekStartAt: '2026-06-29', plannedHours: 50, capacityHours: 40, utilizationPercent: 125, overloaded: true }], rows: [] })
    api.getIntelligenceReport.mockResolvedValue({ total: 1, byTopic: { AI: 1 }, bySource: { 政策网站: 1 }, byPriority: { HIGH: 1 }, byConversionKind: { TASK: 1 }, buckets: [], rows: [{ id: 'i1', title: 'AI policy', status: 'REVIEWED', priority: 'HIGH', topics: ['AI'], sources: ['政策网站'], conversions: ['TASK'] }] })
  })

  it('renders five real-data report sections and an accessible trend table', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><MemoryRouter><ReportsPage /></MemoryRouter></QueryClientProvider>)
    expect(screen.getByRole('heading', { name: '统计报表' })).toBeInTheDocument()
    expect(await screen.findByRole('tab', { name: '项目组合' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '任务趋势' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '风险趋势' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '资源负荷' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '行业情报' })).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: '项目组合明细' })).toBeInTheDocument()
    expect(screen.getByText('平台升级')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '导出 CSV' })).toHaveAttribute('href', '/report-PORTFOLIO.CSV')
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: '风险趋势' }))
    expect(await screen.findByRole('table', { name: '风险趋势数据' })).toBeInTheDocument()
    expect(screen.getByText('关闭风险')).toBeInTheDocument()
  })
})
