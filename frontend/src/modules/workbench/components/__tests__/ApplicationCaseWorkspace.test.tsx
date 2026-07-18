import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApplicationCaseWorkspace } from '../ApplicationCaseWorkspace'

const applicationCase = {
  id: 'case-1',
  title: '2026 年市级研发平台认定',
  code: 'APP-2026-001',
  projectId: null,
  workflowTemplateId: 'template-1',
  subjectName: null,
  region: null,
  organization: null,
  batch: null,
  deadlineAt: null,
  collaboratorNames: [],
  status: 'IN_PROGRESS' as const,
  archivedAt: null,
  nodes: [
    {
      id: 'node-1',
      workflowTemplateNodeId: 'template-node-1',
      code: 'PREPARE',
      title: '材料准备',
      description: null,
      sequence: 1,
      prerequisiteNodeCodes: [],
      requiredRequirementCodes: [],
      requiredMaterialCodes: [],
      isRequired: true,
      status: 'PENDING' as const,
      completedAt: null,
    },
  ],
  requirements: [],
  materials: [],
  evidenceRecords: [],
  corrections: [],
  submissions: [],
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
}

describe('ApplicationCaseWorkspace', () => {
  it('renders the case stages and explains missing-item feedback from a rejected completion', async () => {
    const user = userEvent.setup()
    const completeNode = vi.fn().mockRejectedValue(new Error('缺少必需材料：营业执照'))

    render(<ApplicationCaseWorkspace applicationCase={applicationCase} onCompleteNode={completeNode} />)

    const completeButton = screen.getByRole('button', { name: '完成节点：材料准备' })
    expect(completeButton).toBeInTheDocument()
    await user.click(completeButton)

    expect(await screen.findByRole('alert')).toHaveTextContent('缺少必需材料：营业执照')
  })
})
