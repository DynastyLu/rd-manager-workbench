import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ResourcesPage from '../ResourcesPage'

const api = vi.hoisted(() => ({
  archiveResource: vi.fn(),
  archiveResourceLoad: vi.fn(),
  createResource: vi.fn(),
  createResourceLoad: vi.fn(),
  createResourceSkill: vi.fn(),
  deleteResourceSkill: vi.fn(),
  getResourceLoadSummary: vi.fn(),
  listResources: vi.fn(),
  updateResource: vi.fn(),
  updateResourceLoad: vi.fn(),
  updateResourceSkill: vi.fn(),
  searchResourceReferences: vi.fn(),
}))

vi.mock('@/modules/workbench/api/operations', () => api)

const summary = [{
  id: 'resource-1',
  displayName: '张三',
  roleTitle: '前端工程师',
  weeklyCapacityHours: 40,
  developmentGoal: '提升架构能力',
  notes: null,
  skills: [{ id: 'skill-1', name: 'React', level: 'EXPERT', evidence: null }],
  weeks: [{
    weekStartAt: '2026-07-20', plannedHours: 45, capacityHours: 40, percent: 112.5,
    overloaded: true, byKind: { PROJECT: 40, OTHER: 5 }, entries: [{ id: 'load-1', kind: 'PROJECT', weekStartAt: '2026-07-20', plannedHours: 45, note: '平台升级', projectId: 'project-1', taskId: null, nonProjectRdItemId: null }],
  }],
}]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ResourcesPage /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ResourcesPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset())
    api.getResourceLoadSummary.mockResolvedValue(summary)
    api.listResources.mockResolvedValue({ data: summary, meta: { page: 1, pageSize: 100, total: 1 } })
    api.searchResourceReferences.mockResolvedValue([{ id: 'project-1', label: 'P-1 · 平台升级' }])
  })

  it('shows the 13-week load matrix with overload and skills', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: '资源负荷' })).toBeInTheDocument()
    expect(await screen.findByText('张三')).toBeInTheDocument()
    expect(screen.getByText('112.5%')).toBeInTheDocument()
    expect(screen.getByText('已超载')).toBeInTheDocument()
    expect(screen.getByText('React')).toBeInTheDocument()
  })

  it('creates a local resource profile from the page', async () => {
    api.createResource.mockResolvedValue({ id: 'resource-2', displayName: '李四' })
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '新建资源' }))
    await user.type(screen.getByLabelText('姓名'), '李四')
    await user.clear(screen.getByLabelText('周容量'))
    await user.type(screen.getByLabelText('周容量'), '36')
    await user.click(screen.getByRole('button', { name: '保存资源' }))
    await waitFor(() => expect(api.createResource).toHaveBeenCalledWith(expect.objectContaining({ displayName: '李四', weeklyCapacityHours: 36 })))
  })

  it('opens a resource profile and adds a skill', async () => {
    api.createResourceSkill.mockResolvedValue({ id: 'skill-2', name: 'TypeScript', level: 'PROFICIENT' })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '管理张三' }))
    await user.type(screen.getByLabelText('技能名称'), 'TypeScript')
    await user.click(screen.getByRole('button', { name: '添加技能' }))
    await waitFor(() => expect(api.createResourceSkill).toHaveBeenCalledWith('resource-1', expect.objectContaining({ name: 'TypeScript', level: 'PRACTICING' })))
  })

  it('shows existing load entries and supports edit/archive actions', async () => {
    api.updateResourceLoad.mockResolvedValue({ id: 'load-1' })
    api.archiveResourceLoad.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '张三 2026-07-20 安排负荷' }))
    expect(screen.getByText('平台升级')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '编辑负荷' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '归档负荷' }))
    await waitFor(() => expect(api.archiveResourceLoad).toHaveBeenCalledWith('resource-1', 'load-1'))
  })

  it('searches association objects instead of requiring a raw id and can archive a resource', async () => {
    api.archiveResource.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '张三 2026-07-20 安排负荷' }))
    await user.selectOptions(screen.getByLabelText('投入类型'), 'PROJECT')
    await user.type(screen.getByLabelText('搜索关联对象'), '平台')
    expect(await screen.findByText('P-1 · 平台升级')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '管理张三' }))
    await user.click(screen.getByRole('button', { name: '归档资源' }))
    await waitFor(() => expect(api.archiveResource).toHaveBeenCalledWith('resource-1'))
  })
})
