import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import WorkbenchHome from '../WorkbenchHome'

describe('WorkbenchHome', () => {
  it('identifies the local engineering manager workbench without inventing data', () => {
    render(
      <MemoryRouter>
        <WorkbenchHome />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: '研发主管工作台' })).toBeInTheDocument()
    expect(screen.getByText('本地工作台入口已就绪，项目数据接入后会在这里呈现。')).toBeInTheDocument()
    expect(screen.queryByText(/个工具/)).not.toBeInTheDocument()
  })
})
