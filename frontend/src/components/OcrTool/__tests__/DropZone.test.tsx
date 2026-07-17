import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DropZone from '../DropZone'

describe('DropZone', () => {
  it('shows count and limit', () => {
    render(<DropZone onFiles={vi.fn()} currentCount={3} doneCount={1} totalCount={5} />)
    expect(screen.getByText(/3 \/ 20/)).toBeInTheDocument()
  })

  it('shows completed progress when processing', () => {
    render(<DropZone onFiles={vi.fn()} currentCount={5} doneCount={2} totalCount={5} />)
    expect(screen.getByText(/已完成 2 \/ 5/)).toBeInTheDocument()
  })

  it('shows limit reached at 20', () => {
    render(<DropZone onFiles={vi.fn()} currentCount={20} doneCount={0} totalCount={20} />)
    expect(screen.getByText(/已达上限/)).toBeInTheDocument()
  })

  it('calls onFiles with valid files when input changes', async () => {
    const user = userEvent.setup()
    const onFiles = vi.fn()
    render(<DropZone onFiles={onFiles} currentCount={0} doneCount={0} totalCount={0} />)
    const input = document.querySelector('input[type="file"]')
    const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' })
    await user.upload(input, file)
    expect(onFiles).toHaveBeenCalledWith([file])
  })

  it('filters out unsupported file types', async () => {
    const user = userEvent.setup()
    const onFiles = vi.fn()
    render(<DropZone onFiles={onFiles} currentCount={0} doneCount={0} totalCount={0} />)
    const input = document.querySelector('input[type="file"]')
    const pdf = new File(['data'], 'test.pdf', { type: 'application/pdf' })
    await user.upload(input, pdf)
    expect(onFiles).toHaveBeenCalledWith([])
  })
})
