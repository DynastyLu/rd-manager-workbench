import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { selectSemiOption } from '@/test-utils/selectSemiOption'

import PartnersPage from '../PartnersPage'

// Partner management dialogs chain five user-event interactions — even a
// single flow (open → fill → submit → confirm → close) exceeds the global
// 30s testTimeout under full parallelism on CPU-constrained machines.
vi.setConfig({ testTimeout: 60_000 })

const management = vi.hoisted(() => ({
  archiveAgreement: vi.fn(),
  archiveCommunication: vi.fn(),
  archiveContact: vi.fn(),
  archivePartner: vi.fn(),
  createAgreement: vi.fn(),
  createCommunication: vi.fn(),
  createCommunicationTask: vi.fn(),
  createContact: vi.fn(),
  createPartner: vi.fn(),
  getPartner: vi.fn(),
  linkPartnerProject: vi.fn(),
  listPartners: vi.fn(),
  unlinkPartnerProject: vi.fn(),
  updateAgreement: vi.fn(),
  updateCommunication: vi.fn(),
  updateContact: vi.fn(),
  updatePartner: vi.fn(),
}))

const { listProjects } = vi.hoisted(() => ({ listProjects: vi.fn() }))

vi.mock('@/modules/workbench/api/management', () => management)
vi.mock('@/modules/workbench/api/projects', () => ({ listProjects }))

const partner = {
  id: 'partner-1',
  name: '星海研究院',
  shortName: '星海',
  category: '高校',
  address: '上海市浦东新区',
  notes: '联合实验室合作方',
  archivedAt: null,
  contactCount: 1,
  activeAgreementCount: 1,
  projectCount: 1,
  lastCommunicationAt: '2026-07-20T02:00:00.000Z',
  nextFollowUpAt: '2026-07-24T02:00:00.000Z',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-20T02:00:00.000Z',
  contacts: [
    {
      id: 'contact-1',
      partnerId: 'partner-1',
      name: '林工',
      title: '研发经理',
      phone: '13800138000',
      email: 'lin@example.com',
      notes: null,
      archivedAt: null,
    },
  ],
  agreements: [
    {
      id: 'agreement-1',
      partnerId: 'partner-1',
      title: '联合研发协议',
      agreementNo: 'XY-2026-01',
      status: 'ACTIVE',
      startAt: '2026-07-01T00:00:00.000Z',
      endAt: null,
      notes: null,
      archivedAt: null,
    },
  ],
  communications: [
    {
      id: 'communication-1',
      partnerId: 'partner-1',
      projectId: 'project-1',
      contactId: 'contact-1',
      taskId: null,
      type: 'MEETING',
      occurredAt: '2026-07-20T02:00:00.000Z',
      subject: '年度合作沟通',
      summary: '确认下一阶段联合研发计划',
      promises: '下周提供材料',
      ownerName: '张工',
      nextFollowUpAt: '2026-07-24T02:00:00.000Z',
      archivedAt: null,
      createdAt: '2026-07-20T02:00:00.000Z',
      updatedAt: '2026-07-20T02:00:00.000Z',
    },
  ],
  projects: [
    {
      partnerId: 'partner-1',
      projectId: 'project-1',
      role: '联合研发',
      notes: '负责材料测试',
      createdAt: '2026-07-01T00:00:00.000Z',
      project: { id: 'project-1', code: 'RD-001', name: '耐盐材料筛选', status: 'ACTIVE' },
    },
  ],
}

const availableProject = {
  id: 'project-2',
  code: 'RD-002',
  name: '高温涂层验证',
  status: 'ACTIVE',
}

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="当前合作方路径">{location.pathname + location.search}</output>
}

function renderPartners(path = '/library/governance/partners') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <PartnersPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('PartnersPage', () => {
  beforeEach(() => {
    for (const mock of Object.values(management)) mock.mockReset()
    listProjects.mockReset()
    management.listPartners.mockResolvedValue({
      data: [partner],
      meta: { page: 1, pageSize: 20, total: 1 },
    })
    management.getPartner.mockResolvedValue(partner)
    listProjects.mockResolvedValue({
      data: [availableProject],
      meta: { page: 1, pageSize: 100, total: 1 },
    })
  })

  it('searches within the project filter and can limit results to upcoming follow-ups', async () => {
    const user = userEvent.setup()
    renderPartners('/library/governance/partners?projectId=project-1')

    await user.type(screen.getByRole('textbox', { name: '搜索合作方' }), '星海')
    await user.click(screen.getByRole('button', { name: '仅看未来 7 天需跟进' }))
    await user.click(screen.getByRole('button', { name: '搜索' }))

    await waitFor(() =>
      expect(management.listPartners).toHaveBeenLastCalledWith({
        q: '星海',
        projectId: 'project-1',
        nextFollowUpFrom: expect.any(String),
        nextFollowUpBefore: expect.any(String),
        page: 1,
        pageSize: 20,
      })
    )
  })

  it('opens a SideSheet from recordId and preserves the exact communication deep link', async () => {
    renderPartners(
      '/library/governance/partners?recordId=partner-1&communicationId=communication-1'
    )

    expect(await screen.findByRole('region', { name: '当前定位合作方' })).toHaveTextContent(
      '星海研究院'
    )
    expect(screen.getByRole('region', { name: '当前定位沟通记录' })).toHaveTextContent(
      '年度合作沟通'
    )
    expect(screen.getByRole('tab', { name: /沟通/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('article', { name: '沟通记录：年度合作沟通' })).toHaveAttribute(
      'aria-current',
      'true'
    )
    expect(management.getPartner).toHaveBeenCalledWith('partner-1')
  })

  it('edits and archives a partner with explicit confirmation', async () => {
    management.updatePartner.mockResolvedValue({ ...partner, shortName: '星研院' })
    management.archivePartner.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPartners('/library/governance/partners?recordId=partner-1')

    await user.click(await screen.findByRole('button', { name: '编辑合作方' }))
    await user.clear(screen.getByRole('textbox', { name: '合作方简称' }))
    await user.type(screen.getByRole('textbox', { name: '合作方简称' }), '星研院')
    await user.click(screen.getByRole('button', { name: '保存合作方' }))

    await waitFor(() =>
      expect(management.updatePartner).toHaveBeenCalledWith(
        'partner-1',
        expect.objectContaining({ name: '星海研究院', shortName: '星研院' })
      )
    )

    await user.click(screen.getByRole('button', { name: '归档合作方' }))
    expect(screen.getByText('归档前需先移除联系人、协议、沟通和项目关联。')).toBeInTheDocument()
    expect(
      screen.getByText('当前仍有：1 位联系人、1 份协议、1 条沟通、1 个项目关联、0 个活动附件'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认归档' }))
    await waitFor(() => expect(management.archivePartner).toHaveBeenCalledWith('partner-1'))
  })

  it('creates, edits and archives contacts in the same partner context', async () => {
    management.createContact.mockResolvedValue({ id: 'contact-2' })
    management.updateContact.mockResolvedValue({ ...partner.contacts[0], title: '技术负责人' })
    management.archiveContact.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPartners('/library/governance/partners?recordId=partner-1')

    await user.click(await screen.findByRole('tab', { name: /联系人/ }))
    await user.click(screen.getByRole('button', { name: '新增联系人' }))
    await user.type(screen.getByRole('textbox', { name: '联系人姓名' }), '周工')
    await user.type(screen.getByRole('textbox', { name: '联系人职务' }), '项目经理')
    await user.click(screen.getByRole('button', { name: '保存联系人' }))
    await waitFor(() =>
      expect(management.createContact).toHaveBeenCalledWith(
        'partner-1',
        expect.objectContaining({ name: '周工', title: '项目经理' })
      )
    )

    await user.click(screen.getByRole('button', { name: '编辑联系人：林工' }))
    await user.clear(screen.getByRole('textbox', { name: '联系人职务' }))
    await user.type(screen.getByRole('textbox', { name: '联系人职务' }), '技术负责人')
    await user.click(screen.getByRole('button', { name: '保存联系人' }))
    await waitFor(() =>
      expect(management.updateContact).toHaveBeenCalledWith(
        'partner-1',
        'contact-1',
        expect.objectContaining({ title: '技术负责人' })
      )
    )

    await user.click(screen.getByRole('button', { name: '归档联系人：林工' }))
    await user.click(screen.getByRole('button', { name: '确认归档联系人' }))
    await waitFor(() =>
      expect(management.archiveContact).toHaveBeenCalledWith('partner-1', 'contact-1')
    )
  })

  it('maintains agreements and project associations', async () => {
    management.createAgreement.mockResolvedValue({ id: 'agreement-2' })
    management.updateAgreement.mockResolvedValue({
      ...partner.agreements[0],
      status: 'EXPIRED',
    })
    management.archiveAgreement.mockResolvedValue(undefined)
    management.linkPartnerProject.mockResolvedValue({ partnerId: 'partner-1' })
    management.unlinkPartnerProject.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPartners('/library/governance/partners?recordId=partner-1')

    await user.click(await screen.findByRole('tab', { name: /协议/ }))
    await user.click(screen.getByRole('button', { name: '新增协议' }))
    await user.type(screen.getByRole('textbox', { name: '协议标题' }), '数据共享协议')
    await selectSemiOption(screen.getByRole('combobox', { name: '协议状态' }), 'ACTIVE')
    await user.click(screen.getByRole('button', { name: '保存协议' }))
    await waitFor(() =>
      expect(management.createAgreement).toHaveBeenCalledWith(
        'partner-1',
        expect.objectContaining({ title: '数据共享协议', status: 'ACTIVE' })
      )
    )

    await user.click(screen.getByRole('button', { name: '编辑协议：联合研发协议' }))
    await selectSemiOption(screen.getByRole('combobox', { name: '协议状态' }), 'TERMINATED')
    await user.click(screen.getByRole('button', { name: '保存协议' }))
    await waitFor(() =>
      expect(management.updateAgreement).toHaveBeenCalledWith(
        'partner-1',
        'agreement-1',
        expect.objectContaining({ status: 'TERMINATED' })
      )
    )

    await user.click(screen.getByRole('button', { name: '归档协议：联合研发协议' }))
    await user.click(screen.getByRole('button', { name: '确认归档协议' }))
    await waitFor(() =>
      expect(management.archiveAgreement).toHaveBeenCalledWith('partner-1', 'agreement-1')
    )

    await user.click(screen.getByRole('tab', { name: /项目/ }))
    await user.click(screen.getByRole('button', { name: '关联项目：高温涂层验证' }))
    await user.type(screen.getByRole('textbox', { name: '合作角色' }), '联合测试')
    await user.click(screen.getByRole('button', { name: '确认关联项目' }))
    await waitFor(() =>
      expect(management.linkPartnerProject).toHaveBeenCalledWith('partner-1', 'project-2', {
        role: '联合测试',
      })
    )

    await user.click(screen.getByRole('button', { name: '移除项目关联：耐盐材料筛选' }))
    await user.click(screen.getByRole('button', { name: '确认移除项目关联' }))
    await waitFor(() =>
      expect(management.unlinkPartnerProject).toHaveBeenCalledWith('partner-1', 'project-1')
    )
  })

  it('maintains communication records and reports idempotent task conversion', async () => {
    management.createCommunication.mockResolvedValue({ id: 'communication-2' })
    management.updateCommunication.mockResolvedValue({
      ...partner.communications[0],
      promises: '本周提供材料',
    })
    management.archiveCommunication.mockResolvedValue(undefined)
    management.createCommunicationTask.mockResolvedValue({
      task: { id: 'task-1', title: '年度合作沟通' },
      alreadyExists: true,
    })
    const user = userEvent.setup()
    renderPartners('/library/governance/partners?recordId=partner-1')

    await user.click(await screen.findByRole('tab', { name: /沟通/ }))
    await user.click(screen.getByRole('button', { name: '新增沟通' }))
    await user.type(screen.getByRole('textbox', { name: '沟通主题' }), '样品交接确认')
    await user.type(screen.getByLabelText('沟通时间'), '2026-07-21T10:00')
    await user.type(screen.getByLabelText('下次跟进时间'), '2026-07-25T09:00')
    await user.click(screen.getByRole('button', { name: '保存沟通' }))
    await waitFor(() =>
      expect(management.createCommunication).toHaveBeenCalledWith(
        'partner-1',
        expect.objectContaining({
          subject: '样品交接确认',
          occurredAt: expect.any(String),
          nextFollowUpAt: expect.any(String),
        })
      )
    )

    await user.click(screen.getByRole('button', { name: '编辑沟通：年度合作沟通' }))
    await user.clear(screen.getByRole('textbox', { name: '承诺事项' }))
    await user.type(screen.getByRole('textbox', { name: '承诺事项' }), '本周提供材料')
    await user.click(screen.getByRole('button', { name: '保存沟通' }))
    await waitFor(() =>
      expect(management.updateCommunication).toHaveBeenCalledWith(
        'partner-1',
        'communication-1',
        expect.objectContaining({ promises: '本周提供材料' })
      )
    )

    const communication = screen.getByRole('article', { name: '沟通记录：年度合作沟通' })
    await user.click(within(communication).getByRole('button', { name: '转为任务' }))
    expect(await within(communication).findByText('已关联既有任务')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看任务：年度合作沟通' })).toHaveAttribute(
      'href',
      '/my-work?taskId=task-1'
    )

    await user.click(within(communication).getByRole('button', { name: '归档沟通' }))
    await user.click(screen.getByRole('button', { name: '确认归档沟通' }))
    await waitFor(() =>
      expect(management.archiveCommunication).toHaveBeenCalledWith('partner-1', 'communication-1')
    )
  })
})
