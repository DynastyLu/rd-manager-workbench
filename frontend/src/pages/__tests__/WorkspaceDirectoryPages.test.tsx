import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { ROUTES } from '@/constants/routes'
import AutomationDataPage from '../AutomationDataPage'
import KnowledgeHomePage from '../KnowledgeHomePage'
import LibraryHomePage from '../LibraryHomePage'
import MeetingsAndMaterialsPage from '../MeetingsAndMaterialsPage'

function renderPage(page: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('workspace directory pages', () => {
  it('links the library to available modules and labels unavailable ones as planned', () => {
    renderPage(<LibraryHomePage />)

    expect(screen.getByRole('heading', { name: '业务库' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '申报认定' })).toHaveAttribute(
      'href',
      ROUTES.APPLICATIONS
    )
    expect(screen.getByRole('link', { name: '风险' })).toHaveAttribute(
      'href',
      ROUTES.governance('risks')
    )
    expect(screen.getByRole('link', { name: '问题' })).toHaveAttribute(
      'href',
      ROUTES.governance('issues')
    )
    expect(screen.getByRole('link', { name: '决策' })).toHaveAttribute(
      'href',
      ROUTES.governance('decisions')
    )
    expect(screen.getByRole('link', { name: '合作方' })).toHaveAttribute(
      'href',
      ROUTES.governance('partners')
    )
    expect(screen.getByText('行业情报')).toBeInTheDocument()
    expect(screen.getByText('非项目研发')).toBeInTheDocument()
    expect(screen.getAllByText('该能力正在规划中')).toHaveLength(2)
  })

  it('keeps the knowledge directory local and does not request an API', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    renderPage(<KnowledgeHomePage />)

    expect(screen.getByRole('heading', { name: '知识库' })).toBeInTheDocument()
    expect(screen.getByText('知识页、目录与标签')).toBeInTheDocument()
    expect(screen.getByText('项目、会议、情报、任务与附件关联')).toBeInTheDocument()
    expect(screen.getByText('全文搜索')).toBeInTheDocument()
    expect(screen.getByText('暂不包含多人协作、云同步或飞书导入。')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('lists every planned automation and data module without requesting an API', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    renderPage(<AutomationDataPage />)

    for (const module of [
      '提醒',
      '全局搜索',
      'Excel/CSV 导入导出',
      '备份恢复',
      '审计',
      'AI',
      '外部集成',
      'LAN',
    ]) {
      expect(screen.getByText(module)).toBeInTheDocument()
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('makes the meetings route a meetings and materials directory', () => {
    renderPage(<MeetingsAndMaterialsPage />)

    expect(screen.getByRole('heading', { name: '会议与资料' })).toBeInTheDocument()
  })
})
