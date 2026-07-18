import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { PlannedModuleState } from '../PlannedModuleState'

describe('PlannedModuleState', () => {
  it('describes the planned capability without requesting data', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    render(
      <MemoryRouter>
        <PlannedModuleState
          title="附件中心"
          description="统一管理会议与项目附件。"
          nextStep="下一步：梳理本地附件索引。"
        />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: '附件中心' })).toBeInTheDocument()
    expect(screen.getByText('该能力正在规划中')).toBeInTheDocument()
    expect(screen.getByText('下一步：梳理本地附件索引。')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('renders its optional related route as a real link', () => {
    render(
      <MemoryRouter>
        <PlannedModuleState
          title="会议纪要模板"
          description="沉淀可复用的会议纪要模板。"
          nextStep="下一步：确定模板字段。"
          relatedRoute={{ to: '/meetings', label: '查看会议模块' }}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: '查看会议模块' })).toHaveAttribute('href', '/meetings')
  })
})
