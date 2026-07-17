import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import FileCard from '../FileCard'

function Wrapper({ children }) {
  return <>{children}</>
}

const baseItem = {
  id: '1',
  name: 'test.jpg',
  preview: null,
  status: 'waiting',
  tableData: null,
  error: null,
}

describe('FileCard', () => {
  it('shows filename and waiting badge', () => {
    render(<FileCard item={baseItem} onTableChange={vi.fn()} />, { wrapper: Wrapper })
    expect(screen.getByText('test.jpg')).toBeInTheDocument()
    expect(screen.getByText('等待中')).toBeInTheDocument()
  })

  it('shows processing badge with spinner', () => {
    render(<FileCard item={{ ...baseItem, status: 'processing' }} onTableChange={vi.fn()} />, {
      wrapper: Wrapper,
    })
    expect(screen.getByText('识别中')).toBeInTheDocument()
  })

  it('shows done badge and download button', () => {
    const tableData = {
      rows: [['A']],
      cell_confidence: [[1]],
      merged_cells: [],
      confidence: 'high',
    }
    render(<FileCard item={{ ...baseItem, status: 'done', tableData }} onTableChange={vi.fn()} />, {
      wrapper: Wrapper,
    })
    expect(screen.getByText('已完成')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /下载 Excel/ })).toBeInTheDocument()
  })

  it('shows error message on error status', () => {
    render(
      <FileCard
        item={{ ...baseItem, status: 'error', error: '识别超时' }}
        onTableChange={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    expect(screen.getByText('失败')).toBeInTheDocument()
    expect(screen.getByText(/识别超时/)).toBeInTheDocument()
  })

  it('does not show download button when not done', () => {
    render(<FileCard item={baseItem} onTableChange={vi.fn()} />, { wrapper: Wrapper })
    expect(screen.queryByRole('button', { name: /下载/ })).toBeNull()
  })
})
