import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RelationPicker } from '../components/RelationPicker'
import type { BaseRecord, DataField, DataTable, PageResult } from '../types'

const api = vi.hoisted(() => ({ listBaseRecords: vi.fn() }))

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  listBaseRecords: api.listBaseRecords,
}))

const relationField: DataField = {
  id: 'relation-1',
  tableId: 'candidates',
  key: 'position',
  name: '岗位',
  type: 'RELATION',
  config: {
    targetTableId: 'positions',
    multiple: false,
    relationMode: 'ONE_WAY',
  },
  isPrimary: false,
  isRequired: false,
  sequence: 1,
  createdAt: '',
  updatedAt: '',
}

const targetTable: DataTable = {
  id: 'positions',
  workspaceId: 'workspace-1',
  name: '岗位',
  description: null,
  source: 'CUSTOM',
  icon: null,
  sequence: 0,
  fields: [
    {
      ...relationField,
      id: 'position-title',
      tableId: 'positions',
      key: 'title',
      name: '岗位名称',
      type: 'TEXT',
      config: {},
      isPrimary: true,
    },
  ],
  views: [],
  createdAt: '',
  updatedAt: '',
}

const record = (id: string, title: string): BaseRecord => ({
  id,
  values: { title },
  sourceType: null,
  sourceId: null,
  sourcePath: null,
  createdAt: '',
  updatedAt: '',
})

const page = (data: BaseRecord[], pageNumber = 1, total = data.length): PageResult<BaseRecord> => ({
  data,
  meta: { page: pageNumber, pageSize: 100, total },
})

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function picker(value: string | string[] = '', onChange = vi.fn()) {
  return render(
    <Providers>
      <RelationPicker
        field={relationField}
        targetTable={targetTable}
        value={value}
        onChange={onChange}
      />
    </Providers>
  )
}

describe('RelationPicker', () => {
  beforeEach(() => api.listBaseRecords.mockReset())

  it('fetches selected ids exactly even when the search page does not include them', async () => {
    api.listBaseRecords.mockImplementation(
      (_tableId: string, query: { recordIds?: string[] } = {}) =>
        Promise.resolve(
          query.recordIds
            ? page([record('meeting:42', '研发经理')])
            : page([record('position-1', '高级前端工程师')])
        )
    )
    picker('meeting:42')

    expect(await screen.findByText('研发经理')).toBeInTheDocument()
    expect(screen.getByText('高级前端工程师')).toBeInTheDocument()
    expect(api.listBaseRecords).toHaveBeenCalledWith('positions', {
      recordIds: ['meeting:42'],
      page: 1,
      pageSize: 100,
    })
  })

  it('sends the search term to the server and loads the next 100-record page', async () => {
    api.listBaseRecords.mockImplementation(
      (_tableId: string, query: { query?: string; page?: number } = {}) => {
        if (query.page === 2)
          return Promise.resolve(page([record('position-101', '架构师')], 2, 101))
        return Promise.resolve(page([record('position-1', '高级前端工程师')], 1, 101))
      }
    )
    const user = userEvent.setup()
    picker()

    await user.type(screen.getByRole('searchbox', { name: '搜索岗位记录' }), '研发')
    await waitFor(() =>
      expect(api.listBaseRecords).toHaveBeenCalledWith('positions', {
        query: '研发',
        page: 1,
        pageSize: 100,
      })
    )
    await user.click(await screen.findByRole('button', { name: '加载更多' }))
    expect(await screen.findByText('架构师')).toBeInTheDocument()
    expect(api.listBaseRecords).toHaveBeenCalledWith('positions', {
      query: '研发',
      page: 2,
      pageSize: 100,
    })
  })

  it('supports keyboard selection and stores the stable id', async () => {
    api.listBaseRecords.mockResolvedValue(page([record('position-1', '高级前端工程师')]))
    const onChange = vi.fn()
    const user = userEvent.setup()
    picker('', onChange)

    const checkbox = await screen.findByRole('checkbox', { name: '选择高级前端工程师' })
    checkbox.focus()
    await user.keyboard(' ')
    expect(onChange).toHaveBeenCalledWith('position-1')
  })

  it('renders loading, empty, request error and unavailable selected-record states', async () => {
    let resolveLoading: ((value: PageResult<BaseRecord>) => void) | undefined
    api.listBaseRecords.mockImplementationOnce(
      () =>
        new Promise<PageResult<BaseRecord>>((resolve) => {
          resolveLoading = resolve
        })
    )
    const loading = picker()
    expect(screen.getByText('加载记录')).toBeInTheDocument()
    resolveLoading?.(page([]))
    expect(await screen.findByText('没有匹配记录')).toBeInTheDocument()
    loading.unmount()

    api.listBaseRecords.mockRejectedValueOnce(new Error('offline'))
    const failed = picker()
    expect(await screen.findByRole('button', { name: '加载失败，点击重试' })).toBeInTheDocument()
    failed.unmount()

    api.listBaseRecords.mockImplementation(
      (_tableId: string, query: { recordIds?: string[] } = {}) =>
        Promise.resolve(query.recordIds ? page([]) : page([record('position-1', '高级前端工程师')]))
    )
    picker('missing-id')
    expect(await screen.findByText('目标记录不可用')).toBeInTheDocument()
  })
})
