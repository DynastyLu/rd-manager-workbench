import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createBaseField,
  createBaseTable,
  listBaseRecords,
  listBaseWorkspaces,
  previewBaseFormula,
  updateBaseRecord,
  updateBaseView,
} from '../api'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/lib/http', () => ({ request }))

describe('multidimensional base API', () => {
  beforeEach(() => {
    request.mockReset()
    request.mockResolvedValue({})
  })

  it('uses the workspace and encoded record endpoints', async () => {
    await listBaseWorkspaces()
    await listBaseRecords('table / 1', { query: '北斗 项目', sortField: 'dueAt', sortOrder: 'desc', page: 1, pageSize: 100 })
    await updateBaseRecord('table / 1', 'record / 1', { status: 'DONE' })

    expect(request.mock.calls).toEqual([
      ['/base/workspaces'],
      ['/base/tables/table%20%2F%201/records?query=%E5%8C%97%E6%96%97+%E9%A1%B9%E7%9B%AE&sortField=dueAt&sortOrder=desc&page=1&pageSize=100'],
      ['/base/tables/table%20%2F%201/records/record%20%2F%201', { method: 'PATCH', body: JSON.stringify({ values: { status: 'DONE' } }) }],
    ])
  })

  it('creates custom tables and fields and persists view configuration', async () => {
    await createBaseTable('workspace-1', { name: '面试候选人' })
    await createBaseField('table-1', { name: '优先级', key: 'priority', type: 'SINGLE_SELECT', config: { options: [{ label: '高', value: '高' }] } })
    await updateBaseView('view-1', { config: { groupField: 'priority' } })

    expect(request.mock.calls).toEqual([
      ['/base/workspaces/workspace-1/tables', { method: 'POST', body: JSON.stringify({ name: '面试候选人' }) }],
      ['/base/tables/table-1/fields', { method: 'POST', body: JSON.stringify({ name: '优先级', key: 'priority', type: 'SINGLE_SELECT', config: { options: [{ label: '高', value: '高' }] } }) }],
      ['/base/views/view-1', { method: 'PATCH', body: JSON.stringify({ config: { groupField: 'priority' } }) }],
    ])
  })

  it('posts formula previews without persisting a field', async () => {
    await previewBaseFormula('table / 1', { expression: '{score} / 2', recordId: 'record-1' })

    expect(request).toHaveBeenCalledWith('/base/tables/table%20%2F%201/formula-preview', {
      method: 'POST',
      body: JSON.stringify({ expression: '{score} / 2', recordId: 'record-1' }),
    })
  })
})
