import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createApplicationCase,
  createWorkflowTemplate,
  getApplicationCase,
  listApplicationCases,
  listWorkflowTemplates,
} from '../applications'

describe('application case API client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the case and workflow template collection routes with typed inputs', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { data: [], meta: {} } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { data: [], meta: {} } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { id: 'template-1' } }), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { id: 'case-1' } }), { status: 201 }),
      )

    await listWorkflowTemplates({ search: '市级' })
    await listApplicationCases({ status: 'IN_PROGRESS', page: 2 })
    await createWorkflowTemplate({
      name: '认定流程',
      nodes: [{ code: 'PREPARE', title: '材料准备', sequence: 1, isRequired: true }],
    })
    await createApplicationCase({ code: 'APP-001', title: '市级认定', workflowTemplateId: 'template-1' })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:4311/api/workflow-templates?search=%E5%B8%82%E7%BA%A7',
      expect.anything(),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:4311/api/application-cases?status=IN_PROGRESS&page=2',
      expect.anything(),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:4311/api/workflow-templates',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://127.0.0.1:4311/api/application-cases',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('requests a case detail by encoded identifier', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { id: 'case 1' } }), { status: 200 }),
    )

    await getApplicationCase('case 1')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:4311/api/application-cases/case%201',
      expect.anything(),
    )
  })
})
