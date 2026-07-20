import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  archiveAgreement,
  archiveCommunication,
  archiveContact,
  createCommunicationTask,
  linkPartnerProject,
  listPartners,
  unlinkPartnerProject,
  updateAgreement,
  updateCommunication,
  updateContact,
} from '../management'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('@/lib/http', () => ({ request }))

describe('partner API', () => {
  beforeEach(() => {
    request.mockReset()
    request.mockResolvedValue({})
  })

  it('serializes search, project and follow-up filters', async () => {
    await listPartners({
      q: '星海 研究院',
      projectId: 'project / 1',
      nextFollowUpFrom: '2026-07-20T00:00:00.000Z',
      nextFollowUpBefore: '2026-07-31T23:59:59.999Z',
      page: 2,
      pageSize: 20,
    })

    expect(request).toHaveBeenCalledWith(
      '/partners?q=%E6%98%9F%E6%B5%B7+%E7%A0%94%E7%A9%B6%E9%99%A2&projectId=project+%2F+1&nextFollowUpFrom=2026-07-20T00%3A00%3A00.000Z&nextFollowUpBefore=2026-07-31T23%3A59%3A59.999Z&page=2&pageSize=20'
    )
  })

  it('uses parent-scoped update and archive endpoints for every child object', async () => {
    await updateContact('partner / 1', 'contact / 1', { name: '林工', phone: null })
    await archiveContact('partner / 1', 'contact / 1')
    await updateAgreement('partner / 1', 'agreement / 1', {
      status: 'ACTIVE',
      endAt: null,
    })
    await archiveAgreement('partner / 1', 'agreement / 1')
    await updateCommunication('partner / 1', 'communication / 1', {
      summary: null,
      nextFollowUpAt: null,
    })
    await archiveCommunication('partner / 1', 'communication / 1')

    expect(request.mock.calls).toEqual([
      [
        '/partners/partner%20%2F%201/contacts/contact%20%2F%201',
        { method: 'PATCH', body: JSON.stringify({ name: '林工', phone: null }) },
      ],
      ['/partners/partner%20%2F%201/contacts/contact%20%2F%201', { method: 'DELETE' }],
      [
        '/partners/partner%20%2F%201/agreements/agreement%20%2F%201',
        { method: 'PATCH', body: JSON.stringify({ status: 'ACTIVE', endAt: null }) },
      ],
      ['/partners/partner%20%2F%201/agreements/agreement%20%2F%201', { method: 'DELETE' }],
      [
        '/partners/partner%20%2F%201/communications/communication%20%2F%201',
        { method: 'PATCH', body: JSON.stringify({ summary: null, nextFollowUpAt: null }) },
      ],
      ['/partners/partner%20%2F%201/communications/communication%20%2F%201', { method: 'DELETE' }],
    ])
  })

  it('links and unlinks a project and preserves relation metadata', async () => {
    await linkPartnerProject('partner / 1', 'project / 1', {
      role: '联合研发',
      notes: '负责联合实验',
    })
    await unlinkPartnerProject('partner / 1', 'project / 1')

    expect(request.mock.calls).toEqual([
      [
        '/partners/partner%20%2F%201/projects/project%20%2F%201',
        {
          method: 'POST',
          body: JSON.stringify({ role: '联合研发', notes: '负责联合实验' }),
        },
      ],
      ['/partners/partner%20%2F%201/projects/project%20%2F%201', { method: 'DELETE' }],
    ])
  })

  it('returns the idempotent communication task result contract', async () => {
    request.mockResolvedValue({ task: { id: 'task-1' }, alreadyExists: true })

    const result = await createCommunicationTask('communication / 1', {
      title: '落实年度合作事项',
      projectId: 'project-1',
    })

    expect(result).toEqual({ task: { id: 'task-1' }, alreadyExists: true })
    expect(request).toHaveBeenCalledWith('/communications/communication%20%2F%201/task', {
      method: 'POST',
      body: JSON.stringify({ title: '落实年度合作事项', projectId: 'project-1' }),
    })
  })
})
