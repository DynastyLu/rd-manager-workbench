import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import LibraryHomePage from '@/pages/LibraryHomePage'
import { ViewManager } from '../components/ViewManager'
import { ViewSettingsDrawer } from '../components/ViewSettingsDrawer'
import type { DataField, DataView } from '../types'
import { operatorsForField } from '../viewSettings'

const api = vi.hoisted(() => ({
  createBaseField: vi.fn(),
  createBaseRecord: vi.fn(),
  createBaseTable: vi.fn(),
  createBaseView: vi.fn(),
  deleteBaseField: vi.fn(),
  deleteBaseView: vi.fn(),
  listBaseRecords: vi.fn(),
  listBaseWorkspaces: vi.fn(),
  updateBaseField: vi.fn(),
  updateBaseRecord: vi.fn(),
  updateBaseView: vi.fn(),
}))

vi.mock('../api', () => api)

const fields: DataField[] = [
  {
    id: 'field-title',
    tableId: 'table-1',
    key: 'title',
    name: '事项',
    type: 'TEXT',
    config: {},
    isPrimary: true,
    isRequired: true,
    sequence: 0,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'field-status',
    tableId: 'table-1',
    key: 'status',
    name: '状态',
    type: 'SINGLE_SELECT',
    config: {
      options: [
        { label: '待办', value: 'TODO' },
        { label: '完成', value: 'DONE' },
      ],
    },
    isPrimary: false,
    isRequired: false,
    sequence: 1,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'field-score',
    tableId: 'table-1',
    key: 'score',
    name: '评分',
    type: 'NUMBER',
    config: {},
    isPrimary: false,
    isRequired: false,
    sequence: 2,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'field-due',
    tableId: 'table-1',
    key: 'dueAt',
    name: '截止日期',
    type: 'DATETIME',
    config: {},
    isPrimary: false,
    isRequired: false,
    sequence: 3,
    createdAt: '',
    updatedAt: '',
  },
]

const views: DataView[] = [
  {
    id: 'view-a',
    tableId: 'table-1',
    name: '待办视图',
    type: 'GRID',
    config: {
      query: '研发',
      filters: [{ fieldKey: 'status', operator: 'EQ', value: 'TODO' }],
      sorts: [{ fieldKey: 'dueAt', direction: 'asc' }],
      groupField: 'status',
      hiddenFieldIds: ['field-score'],
      fieldOrder: ['field-title', 'field-status', 'field-due', 'field-score'],
    },
    isDefault: true,
    sequence: 0,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'view-b',
    tableId: 'table-1',
    name: '高分视图',
    type: 'GRID',
    config: {
      filters: [{ fieldKey: 'score', operator: 'GTE', value: 80 }],
      sorts: [{ fieldKey: 'score', direction: 'desc' }],
    },
    isDefault: false,
    sequence: 1,
    createdAt: '',
    updatedAt: '',
  },
]

function fieldOfType(type: DataField['type']): DataField {
  return { ...fields[0], id: `field-${type}`, key: type.toLowerCase(), type }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('saved view filter support', () => {
  it('exposes the supported operators for each field category', () => {
    const textOperators = ['EQ', 'NE', 'CONTAINS', 'NOT_CONTAINS', 'EMPTY', 'NOT_EMPTY', 'IN']
    const numberOperators = ['EQ', 'NE', 'GT', 'GTE', 'LT', 'LTE', 'EMPTY', 'NOT_EMPTY', 'IN']
    const dateOperators = ['EQ', 'NE', 'BEFORE', 'AFTER', 'EMPTY', 'NOT_EMPTY', 'IN']
    const collectionOperators = ['CONTAINS', 'NOT_CONTAINS', 'EMPTY', 'NOT_EMPTY', 'IN']
    const booleanOperators = ['EQ', 'NE', 'EMPTY', 'NOT_EMPTY']

    for (const type of ['TEXT', 'LONG_TEXT', 'SINGLE_SELECT', 'LINK'] as const) {
      expect(operatorsForField(fieldOfType(type))).toEqual(textOperators)
    }
    expect(operatorsForField(fieldOfType('NUMBER'))).toEqual(numberOperators)
    for (const type of ['DATETIME', 'CREATED_AT', 'UPDATED_AT'] as const) {
      expect(operatorsForField(fieldOfType(type))).toEqual(dateOperators)
    }
    for (const type of ['MULTI_SELECT', 'ATTACHMENT', 'RELATION'] as const) {
      expect(operatorsForField(fieldOfType(type))).toEqual(collectionOperators)
    }
    expect(operatorsForField(fieldOfType('CHECKBOX'))).toEqual(booleanOperators)
    for (const type of ['LOOKUP', 'ROLLUP', 'FORMULA'] as const) {
      expect(operatorsForField(fieldOfType(type))).toEqual([])
    }
  })
})

describe('ViewSettingsDrawer', () => {
  it('adds and saves two filters and two sorts with field-aware editors', async () => {
    const onConfigChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ViewSettingsDrawer
        visible
        view={views[0]}
        fields={fields}
        onClose={vi.fn()}
        onConfigChange={onConfigChange}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onSetDefault={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: '添加筛选条件' }))
    await user.selectOptions(screen.getByLabelText('筛选字段 2'), 'score')
    await user.selectOptions(screen.getByLabelText('筛选运算符 2'), 'GTE')
    await user.type(screen.getByLabelText('筛选值 2'), '80')
    await user.click(screen.getByRole('button', { name: '添加排序条件' }))
    await user.selectOptions(screen.getByLabelText('排序字段 2'), 'score')
    await user.selectOptions(screen.getByLabelText('排序方向 2'), 'desc')

    expect(onConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: [
          { fieldKey: 'status', operator: 'EQ', value: 'TODO' },
          { fieldKey: 'score', operator: 'GTE', value: 80 },
        ],
        sorts: [
          { fieldKey: 'dueAt', direction: 'asc' },
          { fieldKey: 'score', direction: 'desc' },
        ],
      })
    )
  })

  it('does not save an incomplete condition and identifies an archived field', async () => {
    const onConfigChange = vi.fn()
    const staleView: DataView = {
      ...views[0],
      config: { filters: [{ fieldKey: 'archived_owner', operator: 'EQ', value: '张三' }] },
    }
    const user = userEvent.setup()
    render(
      <ViewSettingsDrawer
        visible
        view={staleView}
        fields={fields}
        onClose={vi.fn()}
        onConfigChange={onConfigChange}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onSetDefault={vi.fn()}
      />
    )

    expect(screen.getByText('字段已失效：archived_owner')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '添加筛选条件' }))
    await user.selectOptions(screen.getByLabelText('筛选字段 2'), 'score')

    expect(onConfigChange).not.toHaveBeenCalled()
    expect(screen.getByText('请补全筛选条件后再保存')).toBeInTheDocument()
  })

  it('enforces the 20-filter and 5-sort limits', () => {
    render(
      <ViewSettingsDrawer
        visible
        view={{
          ...views[0],
          config: {
            filters: Array.from({ length: 20 }, () => ({
              fieldKey: 'title',
              operator: 'CONTAINS' as const,
              value: '研发',
            })),
            sorts: Array.from({ length: 5 }, () => ({
              fieldKey: 'dueAt',
              direction: 'asc' as const,
            })),
          },
        }}
        fields={fields}
        onClose={vi.fn()}
        onConfigChange={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onSetDefault={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: '添加筛选条件' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '添加排序条件' })).toBeDisabled()
  })

  it('edits ISO dates as local datetime values and restores them when switching views', async () => {
    const onConfigChange = vi.fn()
    const firstIso = '2026-07-20T01:30:00.000Z'
    const secondIso = '2026-07-23T04:15:00.000Z'
    const dateView = (id: string, value: string): DataView => ({
      ...views[0],
      id,
      config: { filters: [{ fieldKey: 'dueAt', operator: 'AFTER', value }] },
    })
    const localValue = (value: string) => {
      const date = new Date(value)
      const part = (number: number) => String(number).padStart(2, '0')
      return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`
    }
    const { rerender } = render(
      <ViewSettingsDrawer
        visible
        view={dateView('date-a', firstIso)}
        fields={fields}
        onClose={vi.fn()}
        onConfigChange={onConfigChange}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onSetDefault={vi.fn()}
      />
    )

    expect(screen.getByLabelText('筛选值 1')).toHaveValue(localValue(firstIso))
    fireEvent.change(screen.getByLabelText('筛选值 1'), {
      target: { value: '2026-07-21T10:45' },
    })
    expect(onConfigChange).toHaveBeenLastCalledWith({
      filters: [
        {
          fieldKey: 'dueAt',
          operator: 'AFTER',
          value: new Date('2026-07-21T10:45').toISOString(),
        },
      ],
      sorts: [],
    })

    rerender(
      <ViewSettingsDrawer
        visible
        view={dateView('date-b', secondIso)}
        fields={fields}
        onClose={vi.fn()}
        onConfigChange={onConfigChange}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onSetDefault={vi.fn()}
      />
    )
    await waitFor(() =>
      expect(screen.getByLabelText('筛选值 1')).toHaveValue(localValue(secondIso))
    )
  })
})

describe('ViewManager', () => {
  function StatefulViewManager({ onCreate = vi.fn(), onConfigChange = vi.fn() }) {
    const [activeViewId, setActiveViewId] = useState('view-a')
    return (
      <ViewManager
        views={views}
        fields={fields}
        activeViewId={activeViewId}
        onSelect={setActiveViewId}
        onCreate={onCreate}
        onRename={vi.fn()}
        onConfigChange={onConfigChange}
        onDelete={vi.fn()}
        onSetDefault={vi.fn()}
      />
    )
  }

  it('restores independent configuration when switching views', async () => {
    const user = userEvent.setup()
    render(<StatefulViewManager />)

    await user.click(screen.getByRole('button', { name: '视图设置' }))
    expect(screen.getByLabelText('筛选字段 1')).toHaveValue('status')
    await user.click(screen.getByRole('tab', { name: /高分视图/ }))
    expect(screen.getByLabelText('筛选字段 1')).toHaveValue('score')
    expect(screen.getByLabelText('排序字段 1')).toHaveValue('score')
  })

  it('creates Gantt and Gallery views by inheriting only shared configuration', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<StatefulViewManager onCreate={onCreate} />)

    await user.click(screen.getByRole('button', { name: '新增视图' }))
    expect(screen.getByText('甘特')).toBeInTheDocument()
    expect(screen.getByText('画册')).toBeInTheDocument()
    await user.type(screen.getByLabelText('视图名称'), '项目画册')
    await user.selectOptions(screen.getByLabelText('视图类型'), 'GALLERY')
    expect(screen.getByText('以卡片浏览封面与关键信息')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认新增' }))

    expect(onCreate).toHaveBeenCalledWith({
      name: '项目画册',
      type: 'GALLERY',
      config: views[0].config,
    })
  })

  it('sets a non-default view as the default from the settings drawer', async () => {
    const onSetDefault = vi.fn()
    const user = userEvent.setup()
    render(
      <ViewManager
        views={views}
        fields={fields}
        activeViewId="view-b"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onConfigChange={vi.fn()}
        onDelete={vi.fn()}
        onSetDefault={onSetDefault}
      />
    )

    await user.click(screen.getByRole('button', { name: '视图设置' }))
    await user.click(screen.getByRole('button', { name: '设为默认视图' }))
    expect(onSetDefault).toHaveBeenCalledWith('view-b')
  })
})

describe('LibraryHomePage saved views', () => {
  const table = {
    id: 'table-1',
    workspaceId: 'workspace-1',
    name: '研发计划',
    description: null,
    source: 'CUSTOM',
    icon: null,
    sequence: 0,
    fields,
    views,
    createdAt: '',
    updatedAt: '',
  }

  function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/base']}>
          <LibraryHomePage />
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  beforeEach(() => {
    for (const mock of Object.values(api)) mock.mockReset()
    api.listBaseWorkspaces.mockResolvedValue([
      { id: 'workspace-1', name: '研发工作台', description: null, sequence: 0, tables: [table] },
    ])
    api.listBaseRecords.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 100, total: 0 } })
    api.updateBaseView.mockResolvedValue(views[0])
  })

  it('queries records by view id while table search remains a temporary override', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('heading', { name: '研发工作台' })
    await waitFor(() =>
      expect(api.listBaseRecords).toHaveBeenCalledWith('table-1', {
        viewId: 'view-a',
        page: 1,
        pageSize: 100,
      })
    )
    await user.type(screen.getByRole('searchbox', { name: '搜索当前表' }), '紧急')
    await waitFor(() =>
      expect(api.listBaseRecords).toHaveBeenLastCalledWith('table-1', {
        viewId: 'view-a',
        query: '紧急',
        page: 1,
        pageSize: 100,
      })
    )
    expect(api.updateBaseView).not.toHaveBeenCalled()
  })

  it('rolls an optimistic config back after a debounced save fails', async () => {
    api.updateBaseView.mockRejectedValueOnce(new Error('offline'))
    renderPage()

    await screen.findByRole('heading', { name: '研发工作台' })
    fireEvent.click(screen.getByRole('button', { name: '视图设置' }))
    fireEvent.click(screen.getByRole('button', { name: '添加排序条件' }))
    fireEvent.change(screen.getByLabelText('排序字段 2'), { target: { value: 'score' } })
    fireEvent.change(screen.getByLabelText('排序方向 2'), { target: { value: 'desc' } })

    expect(screen.getByLabelText('排序字段 2')).toHaveValue('score')
    await waitFor(
      () =>
        expect(api.updateBaseView).toHaveBeenCalledWith(
          'view-a',
          expect.objectContaining({
            config: expect.objectContaining({
              sorts: expect.arrayContaining([{ fieldKey: 'score', direction: 'desc' }]),
            }),
          })
        ),
      { timeout: 1000 }
    )
    await waitFor(() => expect(screen.queryByLabelText('排序字段 2')).not.toBeInTheDocument())
  })

  it('rolls back to the most recently saved config rather than the initial config', async () => {
    api.updateBaseView
      .mockImplementationOnce(async (_id: string, input: { config: DataView['config'] }) => ({
        ...views[0],
        config: input.config,
      }))
      .mockRejectedValueOnce(new Error('offline'))
    renderPage()

    await screen.findByRole('heading', { name: '研发工作台' })
    fireEvent.click(screen.getByRole('button', { name: '视图设置' }))
    fireEvent.click(screen.getByRole('button', { name: '添加排序条件' }))
    fireEvent.change(screen.getByLabelText('排序字段 2'), { target: { value: 'score' } })
    fireEvent.change(screen.getByLabelText('排序方向 2'), { target: { value: 'desc' } })
    await waitFor(() => expect(api.updateBaseView).toHaveBeenCalledTimes(1), { timeout: 1000 })
    expect(screen.getByLabelText('排序方向 2')).toHaveValue('desc')

    fireEvent.change(screen.getByLabelText('排序方向 2'), { target: { value: 'asc' } })
    await waitFor(() => expect(api.updateBaseView).toHaveBeenCalledTimes(2), { timeout: 1000 })
    await waitFor(() => expect(screen.getByLabelText('排序方向 2')).toHaveValue('desc'))
    expect(screen.getByLabelText('排序字段 2')).toHaveValue('score')
  })

  it('refetches current records after a saved filter or sort becomes effective', async () => {
    api.updateBaseView.mockImplementation(
      async (_id: string, input: { config: DataView['config'] }) => ({
        ...views[0],
        config: input.config,
      })
    )
    renderPage()

    await screen.findByRole('heading', { name: '研发工作台' })
    await waitFor(() => expect(api.listBaseRecords).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: '视图设置' }))
    fireEvent.click(screen.getByRole('button', { name: '添加排序条件' }))
    fireEvent.change(screen.getByLabelText('排序字段 2'), { target: { value: 'score' } })
    fireEvent.change(screen.getByLabelText('排序方向 2'), { target: { value: 'desc' } })

    await waitFor(() => expect(api.updateBaseView).toHaveBeenCalledTimes(1), { timeout: 1000 })
    await waitFor(() => expect(api.listBaseRecords).toHaveBeenCalledTimes(2))
    expect(api.listBaseRecords).toHaveBeenLastCalledWith('table-1', {
      viewId: 'view-a',
      page: 1,
      pageSize: 100,
    })
  })

  it('returns a paged gallery to page one when its saved result config changes', async () => {
    const galleryView: DataView = {
      ...views[0],
      id: 'view-gallery',
      name: '项目画册',
      type: 'GALLERY',
      config: {
        titleFieldKey: 'title',
        cardSize: 'STANDARD',
        coverFit: 'COVER',
        visibleFieldIds: ['field-status'],
      },
    }
    api.listBaseWorkspaces.mockResolvedValue([
      {
        id: 'workspace-1',
        name: '研发工作台',
        description: null,
        sequence: 0,
        tables: [{ ...table, views: [galleryView] }],
      },
    ])
    api.listBaseRecords.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 100, total: 101 },
    })
    api.updateBaseView.mockImplementation(
      async (_id: string, input: { config: DataView['config'] }) => ({
        ...galleryView,
        config: input.config,
      })
    )
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('heading', { name: '研发工作台' })
    await user.click(await screen.findByRole('button', { name: '下一页' }))
    await waitFor(() =>
      expect(api.listBaseRecords).toHaveBeenLastCalledWith('table-1', {
        viewId: 'view-gallery',
        page: 2,
        pageSize: 100,
      })
    )

    await user.click(screen.getByRole('button', { name: '视图设置' }))
    await user.click(screen.getByRole('button', { name: '添加排序条件' }))
    await user.selectOptions(screen.getByLabelText('排序字段 1'), 'score')
    await waitFor(() =>
      expect(api.listBaseRecords).toHaveBeenLastCalledWith('table-1', {
        viewId: 'view-gallery',
        page: 1,
        pageSize: 100,
      })
    )
  })

  it('serializes saves and never lets an older response replace a newer draft', async () => {
    const first = deferred<DataView>()
    const second = deferred<DataView>()
    api.updateBaseView
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    renderPage()

    await screen.findByRole('heading', { name: '研发工作台' })
    fireEvent.click(screen.getByRole('button', { name: '视图设置' }))
    fireEvent.click(screen.getByRole('button', { name: '添加排序条件' }))
    fireEvent.change(screen.getByLabelText('排序字段 2'), { target: { value: 'score' } })
    fireEvent.change(screen.getByLabelText('排序方向 2'), { target: { value: 'desc' } })
    await waitFor(() => expect(api.updateBaseView).toHaveBeenCalledTimes(1), { timeout: 1000 })

    fireEvent.change(screen.getByLabelText('排序方向 2'), { target: { value: 'asc' } })
    await new Promise((resolve) => window.setTimeout(resolve, 450))
    expect(api.updateBaseView).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '保存名称' })).toBeDisabled()

    await act(async () => {
      first.resolve({
        ...views[0],
        config: {
          ...views[0].config,
          sorts: [...(views[0].config.sorts ?? []), { fieldKey: 'score', direction: 'desc' }],
        },
      })
      await first.promise
    })
    await waitFor(() => expect(api.updateBaseView).toHaveBeenCalledTimes(2))
    expect(screen.getByLabelText('排序方向 2')).toHaveValue('asc')
    expect(screen.getByRole('button', { name: '保存名称' })).toBeDisabled()

    await act(async () => {
      second.resolve({
        ...views[0],
        config: {
          ...views[0].config,
          sorts: [...(views[0].config.sorts ?? []), { fieldKey: 'score', direction: 'asc' }],
        },
      })
      await second.promise
    })
    await waitFor(() => expect(screen.getByRole('button', { name: '保存名称' })).toBeEnabled())
    expect(screen.getByLabelText('排序方向 2')).toHaveValue('asc')
  })

  it('does not roll a newer draft back when an older save fails', async () => {
    const first = deferred<DataView>()
    const second = deferred<DataView>()
    api.updateBaseView
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    renderPage()

    await screen.findByRole('heading', { name: '研发工作台' })
    fireEvent.click(screen.getByRole('button', { name: '视图设置' }))
    fireEvent.click(screen.getByRole('button', { name: '添加排序条件' }))
    fireEvent.change(screen.getByLabelText('排序字段 2'), { target: { value: 'score' } })
    fireEvent.change(screen.getByLabelText('排序方向 2'), { target: { value: 'desc' } })
    await waitFor(() => expect(api.updateBaseView).toHaveBeenCalledTimes(1), { timeout: 1000 })
    fireEvent.change(screen.getByLabelText('排序方向 2'), { target: { value: 'asc' } })
    await new Promise((resolve) => window.setTimeout(resolve, 450))

    await act(async () => {
      first.reject(new Error('old request failed'))
      await first.promise.catch(() => undefined)
    })
    await waitFor(() => expect(api.updateBaseView).toHaveBeenCalledTimes(2))
    expect(screen.getByLabelText('排序方向 2')).toHaveValue('asc')

    await act(async () => {
      second.resolve({
        ...views[0],
        config: {
          ...views[0].config,
          sorts: [...(views[0].config.sorts ?? []), { fieldKey: 'score', direction: 'asc' }],
        },
      })
      await second.promise
    })
    await waitFor(() => expect(screen.getByRole('button', { name: '保存名称' })).toBeEnabled())
    expect(screen.getByLabelText('排序方向 2')).toHaveValue('asc')
  })

  it('flushes a pending manual save through the same queue as later edits', async () => {
    const manualSave = deferred<DataView>()
    const laterEdit = deferred<DataView>()
    api.updateBaseView
      .mockImplementationOnce(() => manualSave.promise)
      .mockImplementationOnce(() => laterEdit.promise)
    renderPage()

    await screen.findByRole('heading', { name: '研发工作台' })
    fireEvent.click(screen.getByRole('button', { name: '视图设置' }))
    fireEvent.click(screen.getByRole('button', { name: '添加排序条件' }))
    fireEvent.change(screen.getByLabelText('排序字段 2'), { target: { value: 'score' } })
    fireEvent.click(screen.getByRole('button', { name: '保存当前配置' }))
    await waitFor(() => expect(api.updateBaseView).toHaveBeenCalledTimes(1))

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 450))
    })
    expect(api.updateBaseView).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByLabelText('排序方向 2'), { target: { value: 'desc' } })
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 450))
    })
    expect(api.updateBaseView).toHaveBeenCalledTimes(1)

    await act(async () => {
      manualSave.resolve({
        ...views[0],
        config: {
          ...views[0].config,
          sorts: [...(views[0].config.sorts ?? []), { fieldKey: 'score', direction: 'asc' }],
        },
      })
      await manualSave.promise
    })
    await waitFor(() => expect(api.updateBaseView).toHaveBeenCalledTimes(2))
    expect(api.updateBaseView.mock.calls[1]?.[1].config.sorts?.at(-1)).toEqual({
      fieldKey: 'score',
      direction: 'desc',
    })

    await act(async () => {
      laterEdit.resolve({
        ...views[0],
        config: {
          ...views[0].config,
          sorts: [...(views[0].config.sorts ?? []), { fieldKey: 'score', direction: 'desc' }],
        },
      })
      await laterEdit.promise
    })
    await waitFor(() => expect(screen.getByRole('button', { name: '保存名称' })).toBeEnabled())
  })

  it('cancels a pending debounced PATCH before deleting the view', async () => {
    api.deleteBaseView.mockResolvedValue(undefined)
    renderPage()

    await screen.findByRole('heading', { name: '研发工作台' })
    fireEvent.click(screen.getByRole('button', { name: '视图设置' }))
    fireEvent.click(screen.getByRole('button', { name: '添加排序条件' }))
    fireEvent.change(screen.getByLabelText('排序字段 2'), { target: { value: 'score' } })
    fireEvent.click(screen.getByRole('button', { name: '删除当前视图' }))

    await waitFor(() => expect(api.deleteBaseView).toHaveBeenCalledWith('view-a'))
    await new Promise((resolve) => window.setTimeout(resolve, 450))
    expect(api.updateBaseView).not.toHaveBeenCalled()
  })

  it('refreshes the default marker after setting another view as default', async () => {
    const user = userEvent.setup()
    api.updateBaseView.mockImplementation(async (id: string) => ({
      ...views.find((view) => view.id === id),
      isDefault: true,
    }))
    api.listBaseWorkspaces
      .mockResolvedValueOnce([
        { id: 'workspace-1', name: '研发工作台', description: null, sequence: 0, tables: [table] },
      ])
      .mockResolvedValue([
        {
          id: 'workspace-1',
          name: '研发工作台',
          description: null,
          sequence: 0,
          tables: [
            {
              ...table,
              views: views.map((view) => ({ ...view, isDefault: view.id === 'view-b' })),
            },
          ],
        },
      ])
    renderPage()

    await user.click(await screen.findByRole('tab', { name: /高分视图/ }))
    await user.click(screen.getByRole('button', { name: '视图设置' }))
    await user.click(screen.getByRole('button', { name: '设为默认视图' }))
    await waitFor(() =>
      expect(api.updateBaseView).toHaveBeenCalledWith('view-b', { isDefault: true })
    )
    await waitFor(() =>
      expect(
        within(screen.getByRole('tab', { name: /高分视图/ })).getByText('默认')
      ).toBeInTheDocument()
    )
  })
})
