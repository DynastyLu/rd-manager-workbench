import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createBaseField,
  createBaseTable,
  listBaseRecords,
  listBaseWorkspaces,
  previewBaseFormula,
  updateBaseRecord,
  updateBaseView,
  listBaseTemplates,
  instantiateBaseTemplate,
  uploadBaseImport,
  previewBaseImport,
  commitBaseImport,
  downloadBaseExport,
  inspectBaseImport,
} from '../api'

const { request, download } = vi.hoisted(() => ({ request: vi.fn(), download: vi.fn() }))
vi.mock('@/lib/http', () => ({ request, download }))

describe('multidimensional base API', () => {
  beforeEach(() => {
    request.mockReset()
    request.mockResolvedValue({})
    download.mockReset()
    download.mockResolvedValue({ blob: new Blob(), fileName: 'data.csv' })
  })

  it('uses the template, import preview/commit and export contracts', async () => {
    const file = new File(['标题\n演示'], 'items.csv', { type: 'text/csv' })
    await listBaseTemplates()
    await instantiateBaseTemplate('workspace / 1', 'risk-register', { name: '研发风险' })
    await uploadBaseImport('table / 1', file)
    await inspectBaseImport('session / 1', '第二张')
    await previewBaseImport('session / 1', { selectedSheet: 'CSV', mapping: [{ sourceColumn: '标题', targetFieldId: 'title' }] })
    await commitBaseImport('session / 1')
    await downloadBaseExport('table / 1', { format: 'xlsx', scope: 'view', viewId: 'view / 1' })

    expect(request.mock.calls).toEqual([
      ['/base/templates'],
      ['/base/workspaces/workspace%20%2F%201/templates/risk-register/instantiate', { method: 'POST', body: JSON.stringify({ name: '研发风险' }) }],
      ['/base/tables/table%20%2F%201/imports', expect.objectContaining({ method: 'POST', body: expect.any(FormData) })],
      ['/base/imports/session%20%2F%201/inspect', { method: 'PATCH', body: JSON.stringify({ selectedSheet: '第二张' }) }],
      ['/base/imports/session%20%2F%201/preview', { method: 'PATCH', body: JSON.stringify({ selectedSheet: 'CSV', mapping: [{ sourceColumn: '标题', targetFieldId: 'title' }] }) }],
      ['/base/imports/session%20%2F%201/commit', { method: 'POST' }],
    ])
    expect(download).toHaveBeenCalledWith('/base/tables/table%20%2F%201/export?format=xlsx&scope=view&viewId=view+%2F+1')
  })

  it('uses the workspace and encoded record endpoints', async () => {
    await listBaseWorkspaces()
    await listBaseRecords('table / 1', { query: '北斗 项目', sortField: 'dueAt', sortOrder: 'desc', page: 1, pageSize: 100 })
    await updateBaseRecord('table / 1', 'record / 1', { status: 'DONE' })
    await listBaseRecords('table / 1', { recordIds: ['ACTION:action-1', 'MEETING:meeting-1'], page: 1, pageSize: 100 })

    expect(request.mock.calls).toEqual([
      ['/base/workspaces'],
      ['/base/tables/table%20%2F%201/records?query=%E5%8C%97%E6%96%97+%E9%A1%B9%E7%9B%AE&sortField=dueAt&sortOrder=desc&page=1&pageSize=100'],
      ['/base/tables/table%20%2F%201/records/record%20%2F%201', { method: 'PATCH', body: JSON.stringify({ values: { status: 'DONE' } }) }],
      ['/base/tables/table%20%2F%201/records?recordIds=ACTION%3Aaction-1%2CMEETING%3Ameeting-1&page=1&pageSize=100'],
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
