import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceInput } from '../WorkspaceInput'

describe('WorkspaceInput', () => {
  it('renders and accepts input', async () => {
    const onChange = vi.fn()
    render(<WorkspaceInput placeholder="Type here" onChange={onChange} />)
    const input = screen.getByPlaceholderText('Type here')
    await userEvent.type(input, 'hello')
    expect(input).toHaveValue('hello')
  })
})
