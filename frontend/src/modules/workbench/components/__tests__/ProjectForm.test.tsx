import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ProjectForm } from '../ProjectForm'

const { createProject, updateProject } = vi.hoisted(() => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
}))

vi.mock('@/modules/workbench/api/projects', () => ({ createProject, updateProject }))

describe('ProjectForm', () => {
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
})
