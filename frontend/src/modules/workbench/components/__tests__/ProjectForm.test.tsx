import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProjectForm } from '../ProjectForm'

const { createProject, updateProject } = vi.hoisted(() => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
}))

vi.mock('@/modules/workbench/api/projects', () => ({ createProject, updateProject }))

describe('ProjectForm', () => {
  beforeEach(() => {
    createProject.mockReset()
    updateProject.mockReset()
  })

  it('creates a project with trimmed project code and name', async () => {
    createProject.mockResolvedValue({ id: 'project-1' })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const user = userEvent.setup()

    render(
      <QueryClientProvider client={queryClient}>
        <ProjectForm />
      </QueryClientProvider>
    )

    await user.type(screen.getByLabelText('项目编号'), ' RD-001 ')
    await user.type(screen.getByLabelText('项目名称'), ' 耐盐材料筛选 ')
    await user.click(screen.getByRole('button', { name: '保存项目' }))

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith({ code: 'RD-001', name: '耐盐材料筛选' })
    })
  })

  it('refreshes the edited project detail cache after updating an existing project', async () => {
    const project = {
      id: 'project-1',
      code: 'RD-001',
      name: '耐盐材料筛选',
      type: null,
      researchDirection: null,
      objective: null,
      expectedOutcome: null,
      leadName: null,
      participantNames: [],
      plannedStartAt: null,
      plannedEndAt: null,
      actualStartAt: null,
      actualEndAt: null,
      status: 'ACTIVE',
      phase: 'RESEARCH',
      health: 'GREEN',
      archivedAt: null,
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    } as const
    updateProject.mockResolvedValue(project)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const user = userEvent.setup()

    render(
      <QueryClientProvider client={queryClient}>
        <ProjectForm project={project} />
      </QueryClientProvider>
    )

    await user.clear(screen.getByLabelText('项目名称'))
    await user.type(screen.getByLabelText('项目名称'), '耐盐材料复筛')
    await user.click(screen.getByRole('button', { name: '保存项目' }))

    await waitFor(() => {
      expect(updateProject).toHaveBeenCalledWith('project-1', {
        code: 'RD-001',
        name: '耐盐材料复筛',
      })
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['project', 'project-1'] })
    })
  })
})
