import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import EditableTable from '../EditableTable'

const baseData = {
  rows: [
    ['姓名', '金额'],
    ['张三', '100'],
  ],
  cell_confidence: [
    [1, 1],
    [1, 1],
  ],
  merged_cells: [],
}

describe('EditableTable', () => {
  it('renders table cells', () => {
    render(<EditableTable data={baseData} onChange={vi.fn()} />)
    expect(screen.getByDisplayValue('姓名')).toBeInTheDocument()
    expect(screen.getByDisplayValue('张三')).toBeInTheDocument()
  })

  it('calls onChange when cell is edited', async () => {
    const onChange = vi.fn()
    render(<EditableTable data={baseData} onChange={onChange} />)

    const input = screen.getByDisplayValue('张三')
    await userEvent.clear(input)
    await userEvent.type(input, '李四')

    expect(onChange).toHaveBeenCalled()
  })

  it('highlights low-confidence cells (< 0.6)', () => {
    const lowConfidenceData = {
      rows: [['清晰', '模糊']],
      cell_confidence: [[0.95, 0.3]],
      merged_cells: [],
    }
    render(<EditableTable data={lowConfidenceData} onChange={vi.fn()} />)

    const lowCell = screen.getByDisplayValue('模糊').closest('td')
    expect(lowCell).toHaveClass('bg-yellow-50')
  })

  it('adds a row when clicking add row button', async () => {
    const onChange = vi.fn()
    render(<EditableTable data={baseData} onChange={onChange} />)

    await userEvent.click(screen.getByText('+ 添加行'))
    const call = onChange.mock.calls[0][0]
    expect(call.rows).toHaveLength(3)
  })

  it('returns null when rows is empty', () => {
    const { container } = render(
      <EditableTable
        data={{ rows: [], cell_confidence: [], merged_cells: [] }}
        onChange={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })
})
