import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GridView } from '../components/GridView'
import { useGridRelationRecords } from '../hooks'
import type { BaseRecord, DataField, DataTable, DataView, RelationRecordLookup } from '../types'

const api = vi.hoisted(() => ({ listBaseRecords: vi.fn() }))
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  listBaseRecords: api.listBaseRecords,
}))

const relation = (id: string, key: string): DataField => ({
  id,
  tableId: 'source-table',
  key,
  name: key,
  type: 'RELATION',
  config: { targetTableId: 'target-table', multiple: true, relationMode: 'ONE_WAY' },
  isPrimary: false,
  isRequired: false,
  sequence: 1,
  createdAt: '',
  updatedAt: '',
})

const relations = [relation('relation-a', 'relationA'), relation('relation-b', 'relationB')]
const targetTable: DataTable = {
  id: 'target-table',
  workspaceId: 'workspace',
  name: '目标表',
  description: null,
  source: 'CUSTOM',
  icon: null,
  sequence: 0,
  fields: [
    {
      ...relations[0]!,
      id: 'title',
      tableId: 'target-table',
      key: 'title',
      name: '名称',
      type: 'TEXT',
      config: {},
      isPrimary: true,
    },
  ],
  views: [],
  createdAt: '',
  updatedAt: '',
}

const targetRecord = (id: string): BaseRecord => ({
  id,
  values: { title: `标签 ${id}` },
  sourceType: null,
  sourceId: null,
  sourcePath: null,
  createdAt: '',
  updatedAt: '',
})

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('grid relation batching', () => {
  beforeEach(() => api.listBaseRecords.mockReset())

  it('merges 100 unique ids across fields with the same target into one request', async () => {
    const ids = Array.from({ length: 100 }, (_, index) => `target-${index + 1}`)
    const records = ids.slice(0, 50).map((id, index) => ({
      id: `source-${index}`,
      values: { relationA: [id], relationB: [ids[index + 50]] },
    })) as BaseRecord[]
    api.listBaseRecords.mockImplementation((_tableId: string, query?: { recordIds?: string[] }) =>
      Promise.resolve({
        data: (query?.recordIds ?? []).map(targetRecord),
        meta: { page: 1, pageSize: 100, total: query?.recordIds?.length ?? 0 },
      })
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useGridRelationRecords(relations, records), { wrapper })

    await waitFor(() => expect(result.current.get('target-table')?.isSuccess).toBe(true))
    const exactCalls = api.listBaseRecords.mock.calls.filter((call) => call[1]?.recordIds)
    expect(exactCalls).toHaveLength(1)
    expect(api.listBaseRecords).toHaveBeenCalledWith('target-table', {
      recordIds: ids,
      page: 1,
      pageSize: 100,
    })
    expect(result.current.get('target-table')?.records).toHaveLength(100)
  })

  it('splits 101 grid ids into two exact requests', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `target-${index + 1}`)
    const records = [{ id: 'source', values: { relationA: ids } }] as BaseRecord[]
    api.listBaseRecords.mockImplementation((_tableId: string, query?: { recordIds?: string[] }) =>
      Promise.resolve({
        data: (query?.recordIds ?? []).map(targetRecord),
        meta: { page: 1, pageSize: 100, total: query?.recordIds?.length ?? 0 },
      })
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useGridRelationRecords([relations[0]!], records), {
      wrapper,
    })

    await waitFor(() => expect(result.current.get('target-table')?.isSuccess).toBe(true))
    expect(api.listBaseRecords.mock.calls.filter((call) => call[1]?.recordIds)).toHaveLength(2)
  })

  it('renders relation labels in value order with readable missing, loading and error states', async () => {
    const nameField: DataField = {
      ...relations[0]!,
      id: 'name',
      key: 'name',
      name: '名称',
      type: 'TEXT',
      config: {},
      isPrimary: true,
    }
    const record: BaseRecord = {
      id: 'source',
      values: { name: '来源', relationA: ['target-2', 'missing', 'target-1'] },
      sourceType: null,
      sourceId: null,
      sourcePath: null,
      createdAt: '',
      updatedAt: '',
    }
    const view: DataView = {
      id: 'view',
      tableId: 'source-table',
      name: '表格',
      type: 'GRID',
      config: {},
      isDefault: true,
      sequence: 0,
      createdAt: '',
      updatedAt: '',
    }
    const lookup = (state: Partial<RelationRecordLookup>): Map<string, RelationRecordLookup> =>
      new Map([
        [
          'target-table',
          {
            records: [targetRecord('target-1'), targetRecord('target-2')],
            isPending: false,
            isError: false,
            isSuccess: true,
            ...state,
          },
        ],
      ])
    const props = {
      fields: [nameField, relations[0]!],
      records: [record],
      view,
      tables: [targetTable],
      onRecordChange: vi.fn(),
      onViewChange: vi.fn(),
    }
    const rendered = render(
      <Providers>
        <MemoryRouter>
          <GridView {...props} relationLookups={lookup({})} />
        </MemoryRouter>
      </Providers>
    )
    expect(screen.getByText('标签 target-2、目标记录不可用、标签 target-1')).toBeInTheDocument()

    await act(async () =>
      rendered.rerender(
        <Providers>
          <MemoryRouter>
            <GridView {...props} relationLookups={lookup({ isPending: true })} />
          </MemoryRouter>
        </Providers>
      )
    )
    expect(screen.getByText('正在读取关联记录…')).toBeInTheDocument()
    await act(async () =>
      rendered.rerender(
        <Providers>
          <MemoryRouter>
            <GridView {...props} relationLookups={lookup({ isError: true })} />
          </MemoryRouter>
        </Providers>
      )
    )
    expect(screen.getByText(/无法读取关联记录/)).toBeInTheDocument()
  })
})
