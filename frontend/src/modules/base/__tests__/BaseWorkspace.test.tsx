import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import LibraryHomePage from '@/pages/LibraryHomePage'

const api = vi.hoisted(() => ({
  createBaseField: vi.fn(),
  createBaseRecord: vi.fn(),
  deleteBaseField: vi.fn(),
  createBaseTable: vi.fn(),
  listBaseRecords: vi.fn(),
  listBaseWorkspaces: vi.fn(),
  updateBaseRecord: vi.fn(),
  updateBaseField: vi.fn(),
  updateBaseView: vi.fn(),
}))

vi.mock('../api', () => api)

const projectTable = {
  id: 'table-projects',
  workspaceId: 'workspace-1',
  name: '项目台账',
  description: '真实项目数据',
  source: 'PROJECTS',
  icon: 'project',
  sequence: 0,
  fields: [
    { id: 'field-name', tableId: 'table-projects', key: 'name', name: '项目名称', type: 'TEXT', config: {}, isPrimary: true, isRequired: true, sequence: 0 },
    { id: 'field-status', tableId: 'table-projects', key: 'status', name: '状态', type: 'SINGLE_SELECT', config: { options: [{ label: '进行中', value: 'ACTIVE' }] }, isPrimary: false, isRequired: false, sequence: 1 },
  ],
  views: [{ id: 'view-projects', tableId: 'table-projects', name: '表格', type: 'GRID', config: {}, isDefault: true, sequence: 0 }],
}

const taskTable = {
  ...projectTable,
  id: 'table-tasks',
  name: '任务清单',
  source: 'WORK_TASKS',
  sequence: 1,
  fields: [{ ...projectTable.fields[0], id: 'field-title', tableId: 'table-tasks', key: 'title', name: '任务标题' }],
  views: [{ ...projectTable.views[0], id: 'view-tasks', tableId: 'table-tasks' }],
}

const customTable = {
  ...projectTable,
  id: 'table-custom',
  name: '自定义清单',
  source: 'CUSTOM',
  sequence: 2,
  fields: [{ ...projectTable.fields[0], id: 'field-custom-name', tableId: 'table-custom', key: 'name', name: '名称' }],
  views: [{ ...projectTable.views[0], id: 'view-custom', tableId: 'table-custom' }],
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/base']}>
        <LibraryHomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('multidimensional base workspace', () => {
  beforeEach(() => {
    for (const mock of Object.values(api)) mock.mockReset()
    api.listBaseWorkspaces.mockResolvedValue([
      { id: 'workspace-1', name: '研发工作台', description: '本地数据空间', sequence: 0, tables: [projectTable, taskTable, customTable] },
    ])
    api.listBaseRecords.mockResolvedValue({
      data: [{ id: 'project-1', values: { name: '北斗项目', status: 'ACTIVE' }, sourceType: 'PROJECT', sourceId: 'project-1', sourcePath: '/spaces/projects/project-1', createdAt: '2026-07-19T00:00:00.000Z', updatedAt: '2026-07-19T00:00:00.000Z' }],
      meta: { page: 1, pageSize: 100, total: 1 },
    })
  })

  it('loads the default workspace and switches between real data tables', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(screen.getByText('正在加载多维表格…')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '研发工作台' })).toBeInTheDocument()
    expect(await screen.findByText('北斗项目')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '任务清单' }))
    await waitFor(() => expect(api.listBaseRecords).toHaveBeenLastCalledWith('table-tasks', expect.any(Object)))
  })

  it('shows a retry action when the local base service fails', async () => {
    api.listBaseWorkspaces.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([
      { id: 'workspace-1', name: '研发工作台', sequence: 0, tables: [projectTable] },
    ])
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('无法读取多维表格')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByRole('heading', { name: '研发工作台' })).toBeInTheDocument()
    expect(api.listBaseWorkspaces).toHaveBeenCalledTimes(2)
  })

  it('creates a custom table inside the current workspace', async () => {
    api.createBaseTable.mockResolvedValue({ id: 'table-custom', workspaceId: 'workspace-1', name: '面试候选人', source: 'CUSTOM', sequence: 2 })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: '新建数据表' }))
    await user.type(screen.getByLabelText('数据表名称'), '面试候选人')
    await user.click(screen.getByRole('button', { name: '保存数据表' }))

    expect(api.createBaseTable).toHaveBeenCalledWith('workspace-1', { name: '面试候选人' })
  })

  it('opens the full form instead of creating an incomplete record from the toolbar', async () => {
    const requiredCustomTable = {
      ...customTable,
      fields: [
        customTable.fields[0],
        { ...projectTable.fields[1], id: 'field-required-status', tableId: 'table-custom', isRequired: true },
      ],
      views: [
        ...customTable.views,
        { id: 'view-custom-form', tableId: 'table-custom', name: '表单', type: 'FORM', config: {}, isDefault: false, sequence: 1 },
      ],
    }
    api.listBaseWorkspaces.mockResolvedValue([
      { id: 'workspace-1', name: '研发工作台', description: '本地数据空间', sequence: 0, tables: [projectTable, requiredCustomTable] },
    ])
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: '自定义清单' }))
    await user.click(screen.getByRole('button', { name: /新增记录/ }))

    expect(await screen.findByRole('heading', { name: '新增记录' })).toBeInTheDocument()
    expect(api.createBaseRecord).not.toHaveBeenCalled()
  })

  it('adds a field with a stable key to the selected table', async () => {
    api.createBaseField.mockResolvedValue({ id: 'field-owner', tableId: 'table-projects', key: 'owner', name: '负责人', type: 'TEXT', config: {}, isPrimary: false, isRequired: false, sequence: 2 })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: '自定义清单' }))
    await user.click(await screen.findByRole('button', { name: '字段管理' }))
    await user.click(screen.getByRole('button', { name: '新增字段' }))
    await user.type(screen.getByLabelText('字段名称'), '负责人')
    fireEvent.change(screen.getByLabelText('字段类型'), { target: { value: 'TEXT' } })
    await user.click(screen.getByRole('button', { name: '保存字段' }))

    expect(api.createBaseField).toHaveBeenCalledWith('table-custom', {
      name: '负责人',
      key: 'owner',
      type: 'TEXT',
    })
  })

  it('stores configured options when adding a selectable field', async () => {
    api.createBaseField.mockResolvedValue({ id: 'field-priority', tableId: 'table-custom', key: 'priority', name: 'priority', type: 'SINGLE_SELECT', config: {}, isPrimary: false, isRequired: false, sequence: 2 })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: '自定义清单' }))
    await user.click(screen.getByRole('button', { name: '字段管理' }))
    await user.click(screen.getByRole('button', { name: '新增字段' }))
    await user.type(screen.getByLabelText('字段名称'), 'priority')
    await user.selectOptions(screen.getByLabelText('字段类型'), 'SINGLE_SELECT')
    await user.type(screen.getByLabelText('选项'), '高, 中, 低')
    await user.click(screen.getByRole('button', { name: '保存字段' }))

    expect(api.createBaseField).toHaveBeenCalledWith('table-custom', {
      name: 'priority',
      key: 'priority',
      type: 'SINGLE_SELECT',
      config: { options: [{ label: '高', value: '高' }, { label: '中', value: '中' }, { label: '低', value: '低' }] },
    })
  })

  it('can add automatic created-time and updated-time fields to custom tables', async () => {
    api.createBaseField.mockResolvedValue({ id: 'field-created', tableId: 'table-custom', key: 'created_at', name: 'created_at', type: 'CREATED_AT', config: {}, isPrimary: false, isRequired: false, sequence: 2 })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: '自定义清单' }))
    await user.click(screen.getByRole('button', { name: '字段管理' }))
    await user.click(screen.getByRole('button', { name: '新增字段' }))
    await user.type(screen.getByLabelText('字段名称'), 'created_at')
    await user.selectOptions(screen.getByLabelText('字段类型'), 'CREATED_AT')
    await user.click(screen.getByRole('button', { name: '保存字段' }))

    expect(api.createBaseField).toHaveBeenCalledWith('table-custom', {
      name: 'created_at', key: 'created_at', type: 'CREATED_AT',
    })
  })

  it('supports renaming, requiring, reordering and deleting fields only on custom tables', async () => {
    const editableTable = {
      ...customTable,
      fields: [
        customTable.fields[0],
        { ...projectTable.fields[1], id: 'field-custom-status', tableId: 'table-custom', name: '进度', key: 'progress', sequence: 1 },
      ],
    }
    api.listBaseWorkspaces.mockResolvedValue([
      { id: 'workspace-1', name: '研发工作台', description: '本地数据空间', sequence: 0, tables: [projectTable, editableTable] },
    ])
    api.updateBaseField.mockResolvedValue({})
    api.deleteBaseField.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: '自定义清单' }))
    await user.click(screen.getByRole('button', { name: '字段管理' }))
    await user.click(screen.getByRole('button', { name: '编辑字段：进度' }))
    await user.clear(screen.getByLabelText('编辑字段名称'))
    await user.type(screen.getByLabelText('编辑字段名称'), '阶段')
    await user.click(screen.getByLabelText('字段必填'))
    await user.click(screen.getByRole('button', { name: '保存字段修改' }))

    expect(api.updateBaseField).toHaveBeenCalledWith('field-custom-status', expect.objectContaining({ name: '阶段', isRequired: true }))

    await user.click(screen.getByRole('button', { name: '删除字段：进度' }))
    expect(api.deleteBaseField).toHaveBeenCalledWith('field-custom-status')
  })
})
