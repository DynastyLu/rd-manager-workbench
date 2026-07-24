import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RECENT_SEARCHES_STORAGE_KEY } from '@/modules/workbench/search/recentSearches'
import SearchPage from '../SearchPage'

const { runSearchAction, searchWorkbench } = vi.hoisted(() => ({
  runSearchAction: vi.fn(),
  searchWorkbench: vi.fn(),
}))

vi.mock('@/modules/workbench/api/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/workbench/api/search')>()
  return { ...actual, runSearchAction, searchWorkbench }
})

const taskHit = {
  type: 'TASK' as const,
  id: 'task-1',
  title: '<img>搜索</img> 页面',
  snippet: '实现项目、任务和文档的统一检索。',
  path: '/my-work?taskId=task-1',
  updatedAt: '2026-07-20T08:00:00.000Z',
  score: 210,
  matches: [{ field: 'title' as const, start: 5, end: 7 }],
  actions: ['OPEN', 'COPY_LINK', 'COMPLETE_TASK'] as const,
}

const result = {
  data: [taskHit],
  groups: [{ type: 'TASK' as const, count: 1 }],
  meta: { page: 1, pageSize: 20, total: 1 },
  partialFailures: [],
}

function LocationProbe() {
  return <output aria-label="当前位置">{useLocation().pathname + useLocation().search}</output>
}

function renderSearchPage(initialEntry = '/search') {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SearchPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  )
  return { ...rendered, queryClient }
}

async function submitQuery(query = '搜索') {
  const user = userEvent.setup()
  const input = screen.getByRole('textbox', { name: '搜索全部工作内容' })
  await user.clear(input)
  await user.type(input, query)
  await user.keyboard('{Enter}')
  return user
}

describe('SearchPage', () => {
  beforeEach(() => {
    vi.useRealTimers()
    localStorage.clear()
    searchWorkbench.mockReset()
    runSearchAction.mockReset()
  })

  it('shows recent searches for an empty query and submits one explicitly', async () => {
    localStorage.setItem(
      RECENT_SEARCHES_STORAGE_KEY,
      JSON.stringify([
        {
          query: '项目进度',
          types: ['PROJECT'],
          lastUsedAt: '2026-07-20T08:00:00.000Z',
          useCount: 2,
        },
      ])
    )
    searchWorkbench.mockResolvedValue({
      ...result,
      data: [],
      groups: [],
      meta: { ...result.meta, total: 0 },
    })
    const user = userEvent.setup()

    renderSearchPage()

    expect(screen.getByRole('heading', { name: '全局搜索' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '最近搜索' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '再次搜索：项目进度' }))

    expect(searchWorkbench).toHaveBeenCalledWith({
      query: '项目进度',
      types: ['PROJECT'],
      page: 1,
      pageSize: 20,
    })
  })

  it('shows loading, renders safe Unicode highlights, and opens a real route', async () => {
    let resolveSearch: ((value: typeof result) => void) | undefined
    searchWorkbench.mockReturnValue(
      new Promise<typeof result>((resolve) => {
        resolveSearch = resolve
      })
    )
    renderSearchPage()

    const user = await submitQuery()
    expect(screen.getByRole('status', { name: '搜索状态' })).toHaveTextContent('正在搜索')
    resolveSearch?.(result)

    const resultItem = await screen.findByRole('article', { name: '任务：<img>搜索</img> 页面' })
    expect(within(resultItem).getByText('搜索', { selector: 'mark' })).toBeInTheDocument()
    expect(resultItem.querySelector('img')).toBeNull()

    await user.click(within(resultItem).getByRole('link', { name: '打开：<img>搜索</img> 页面' }))
    expect(screen.getByRole('status', { name: '当前位置' })).toHaveTextContent(
      '/my-work?taskId=task-1'
    )
  })

  it('debounces typing for 250ms without writing recent history', async () => {
    vi.useFakeTimers()
    searchWorkbench.mockResolvedValue(result)
    renderSearchPage()

    fireEvent.change(screen.getByRole('textbox', { name: '搜索全部工作内容' }), {
      target: { value: '搜索' },
    })
    expect(searchWorkbench).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(249)
    expect(searchWorkbench).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(searchWorkbench).toHaveBeenCalledWith(
      expect.objectContaining({ query: '搜索', page: 1 })
    )
    expect(localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY)).toBeNull()
    vi.useRealTimers()
  })

  it('applies a category chip immediately to the current query', async () => {
    searchWorkbench.mockResolvedValue(result)
    const user = userEvent.setup()
    renderSearchPage()

    await submitQuery('任务')
    await waitFor(() => expect(searchWorkbench).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: '仅搜索任务' }))

    expect(searchWorkbench).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: '任务', types: ['TASK'] })
    )
  })

  it('makes results beyond the first twenty reachable and writes the page to the URL', async () => {
    searchWorkbench.mockImplementation(({ page }: { page?: number }) =>
      Promise.resolve({
        ...result,
        data: [{ ...taskHit, id: `task-${page ?? 1}`, title: `第 ${page ?? 1} 页任务` }],
        meta: { page: page ?? 1, pageSize: 20, total: 21 },
      })
    )
    const user = await submitQueryWithPage('任务')

    expect(await screen.findByText('第 1 页任务')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '下一页搜索结果' }))

    expect(await screen.findByText('第 2 页任务')).toBeInTheDocument()
    expect(searchWorkbench).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
    expect(screen.getByRole('status', { name: '当前位置' })).toHaveTextContent('page=2')
  })

  it('restores query, filters, and page from the URL', async () => {
    searchWorkbench.mockResolvedValue({ ...result, meta: { ...result.meta, page: 2, total: 21 } })

    renderSearchPage('/search?q=项目进度&types=PROJECT%2CTASK&page=2')

    expect(screen.getByRole('textbox', { name: '搜索全部工作内容' })).toHaveValue('项目进度')
    expect(screen.getByRole('button', { name: '仅搜索项目' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await waitFor(() =>
      expect(searchWorkbench).toHaveBeenCalledWith({
        query: '项目进度',
        types: ['PROJECT', 'TASK'],
        page: 2,
        pageSize: 20,
      })
    )
  })

  it('clears stale results and URL state when the query is deleted with the keyboard', async () => {
    localStorage.setItem(
      RECENT_SEARCHES_STORAGE_KEY,
      JSON.stringify([
        {
          query: '项目进度',
          types: [],
          lastUsedAt: '2026-07-20T08:00:00.000Z',
          useCount: 1,
        },
      ])
    )
    searchWorkbench.mockResolvedValue(result)
    const user = userEvent.setup()
    renderSearchPage('/search?q=搜索')

    expect(
      await screen.findByRole('article', { name: '任务：<img>搜索</img> 页面' })
    ).toBeInTheDocument()
    await user.clear(screen.getByRole('textbox', { name: '搜索全部工作内容' }))

    expect(screen.getByRole('status', { name: '当前位置' })).toHaveTextContent('/search')
    expect(screen.getByRole('heading', { name: '最近搜索' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: '任务：<img>搜索</img> 页面' })).toBeNull()
  })

  it('distinguishes an empty result from a partial adapter failure', async () => {
    searchWorkbench
      .mockResolvedValueOnce({
        ...result,
        data: [],
        groups: [],
        meta: { ...result.meta, total: 0 },
      })
      .mockResolvedValueOnce({
        ...result,
        partialFailures: [
          {
            types: ['DOCUMENT'],
            code: 'SEARCH_PARTIAL_FAILURE',
            message: '文档索引暂时不可用',
          },
        ],
      })
    renderSearchPage()

    await submitQuery('不存在')
    expect(await screen.findByText('没有找到相关内容')).toBeInTheDocument()

    await submitQuery('搜索')
    expect(await screen.findByText('部分结果暂时不可用')).toBeInTheDocument()
    expect(screen.getByText('文档索引暂时不可用')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: '重试未完成的类型' }))
    expect(searchWorkbench).toHaveBeenCalledTimes(3)
  })

  it('shows a full error and retries the last request', async () => {
    searchWorkbench.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(result)
    const user = await submitQueryWithPage('离线')

    expect(await screen.findByText('无法完成搜索')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试搜索' }))

    expect(
      await screen.findByRole('article', { name: '任务：<img>搜索</img> 页面' })
    ).toBeInTheDocument()
    expect(searchWorkbench).toHaveBeenCalledTimes(2)
  })

  it('requires confirmation before closing a risk', async () => {
    const riskHit = {
      ...taskHit,
      type: 'RISK' as const,
      id: 'risk-1',
      title: '交付延期风险',
      path: '/library/governance/risks?recordId=risk-1',
      matches: [],
      actions: ['OPEN', 'COPY_LINK', 'CLOSE_RISK'] as const,
    }
    searchWorkbench.mockResolvedValue({
      ...result,
      data: [riskHit],
      groups: [{ type: 'RISK', count: 1 }],
    })
    runSearchAction.mockResolvedValue({ ...riskHit, actions: ['OPEN', 'COPY_LINK'] })
    const { queryClient } = renderSearchPage()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const user = await submitQuery('风险')

    await user.click(await screen.findByRole('button', { name: '关闭风险：交付延期风险' }))
    expect(runSearchAction).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '确认关闭风险' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '确认关闭' }))
    await waitFor(() =>
      expect(runSearchAction).toHaveBeenCalledWith('RISK', 'risk-1', {
        action: 'CLOSE_RISK',
        confirm: true,
      })
    )
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['risks'] })
    )
  })

  it('focuses the main search field with Cmd/Ctrl+K', () => {
    renderSearchPage()
    const input = screen.getByRole('textbox', { name: '搜索全部工作内容' })
    input.blur()

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    expect(input).toHaveFocus()
  })

  it('offers employee and employee-work category chips', async () => {
    searchWorkbench.mockResolvedValue(result)
    renderSearchPage()

    await submitQuery('搜索')

    expect(screen.getByRole('button', { name: '仅搜索员工' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '仅搜索员工工作' })).toBeInTheDocument()
  })

  it('labels employee work results and opens the employee period path', async () => {
    const employeeWorkHit = {
      type: 'EMPLOYEE_WORK' as const,
      id: 'work-1',
      title: '权限模型联调',
      snippet: '张明 · 研发一组',
      path: '/employees/employee-1?periodType=WEEK&periodStart=2026-07-20&workItemId=work-1',
      updatedAt: '2026-07-22T08:00:00.000Z',
      score: 120,
      matches: [],
      actions: ['OPEN', 'COPY_LINK'] as const,
    }
    searchWorkbench.mockResolvedValue({
      ...result,
      data: [employeeWorkHit],
      groups: [{ type: 'EMPLOYEE_WORK' as const, count: 1 }],
    })
    renderSearchPage()

    const user = await submitQuery('权限')
    const item = await screen.findByRole('article', { name: '员工工作：权限模型联调' })
    await user.click(within(item).getByRole('link', { name: '打开：权限模型联调' }))

    expect(screen.getByRole('status', { name: '当前位置' })).toHaveTextContent(
      '/employees/employee-1?periodType=WEEK&periodStart=2026-07-20&workItemId=work-1'
    )
  })
})

async function submitQueryWithPage(query: string) {
  renderSearchPage()
  return submitQuery(query)
}
