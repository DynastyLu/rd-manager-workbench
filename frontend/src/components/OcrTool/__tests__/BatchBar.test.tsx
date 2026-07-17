import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BatchBar from '../BatchBar'

function Wrapper({ children }) {
  return <>{children}</>
}

const makeDone = (id) => ({
  id,
  name: `file${id}.jpg`,
  status: 'done',
  tableData: { rows: [['A']], merged_cells: [] },
})

describe('BatchBar', () => {
  it('renders nothing when no done items', () => {
    const { container } = render(<BatchBar items={[]} />, { wrapper: Wrapper })
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when all items are waiting', () => {
    const items = [{ id: '1', status: 'waiting', tableData: null }]
    const { container } = render(<BatchBar items={items} />, { wrapper: Wrapper })
    expect(container.firstChild).toBeNull()
  })

  it('shows done count and download button', () => {
    render(<BatchBar items={[makeDone('1'), makeDone('2')]} />, { wrapper: Wrapper })
    expect(screen.getByText(/已完成/)).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /下载全部/ })).toBeInTheDocument()
  })

  it('calls fetch when download button clicked', async () => {
    const user = userEvent.setup()
    const mockBlob = new Blob(['data'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, blob: () => Promise.resolve(mockBlob) })
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock')
    globalThis.URL.revokeObjectURL = vi.fn()

    render(<BatchBar items={[makeDone('1')]} />, { wrapper: Wrapper })
    await user.click(screen.getByRole('button', { name: /下载全部/ }))
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/export-batch',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
