import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceButton } from '../WorkspaceButton'

describe('WorkspaceButton', () => {
  it('renders children', () => {
    render(<WorkspaceButton>Click me</WorkspaceButton>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('is disabled when loading', () => {
    render(<WorkspaceButton loading>Click me</WorkspaceButton>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn()
    render(<WorkspaceButton onClick={handleClick}>Click me</WorkspaceButton>)
    await screen.getByRole('button').click()
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
