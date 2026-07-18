import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApplicationCaseForm } from '../ApplicationCaseForm'

describe('ApplicationCaseForm', () => {
  it('requires a case name, project and workflow template before it creates a case', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(<ApplicationCaseForm templates={[]} onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: '创建案件' }))

    expect(screen.getByText('请填写案件名称')).toBeInTheDocument()
    expect(screen.getByText('请填写案件编号')).toBeInTheDocument()
    expect(screen.getByText('请选择关联项目')).toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(4)
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toContain('请选择流程模板')
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
