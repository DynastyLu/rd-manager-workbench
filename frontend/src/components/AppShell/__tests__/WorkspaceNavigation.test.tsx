import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { primaryNavigation } from '@/router/routes'
import { WorkspaceNavigation } from '../WorkspaceNavigation'

describe('WorkspaceNavigation', () => {
  it('renders the seven core apps with Semi icons and no planning badges', () => {
    const { container } = render(
      <MemoryRouter>
        <WorkspaceNavigation items={primaryNavigation} />
      </MemoryRouter>
    )

    const navigation = screen.getByRole('navigation', { name: '主导航' })
    expect(screen.getAllByRole('link')).toHaveLength(7)
    expect(navigation).not.toHaveTextContent('设置')
    expect(navigation).not.toHaveTextContent('规划中')
    expect(container.querySelectorAll('.semi-icon')).toHaveLength(7)
  })

  it('marks the current core app with aria-current, including nested paths', () => {
    render(
      <MemoryRouter initialEntries={['/docs/project-alpha']}>
        <WorkspaceNavigation items={primaryNavigation} />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: '文档与知识库' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByRole('link', { name: '工作台' })).not.toHaveAttribute('aria-current')
  })
})
