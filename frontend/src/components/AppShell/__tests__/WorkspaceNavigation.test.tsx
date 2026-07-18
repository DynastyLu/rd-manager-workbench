import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { primaryNavigation } from '@/router/routes'
import { WorkspaceNavigation } from '../WorkspaceNavigation'

describe('WorkspaceNavigation', () => {
  it('renders all eight stable primary destinations as links and keeps settings in the main navigation', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <WorkspaceNavigation items={primaryNavigation} />
      </MemoryRouter>
    )

    const navigation = screen.getByRole('navigation', { name: '主导航' })
    expect(screen.getAllByRole('link')).toHaveLength(8)
    expect(navigation).toContainElement(screen.getByRole('link', { name: /设置/ }))
    expect(screen.getByRole('link', { name: /设置/ })).toHaveAttribute('aria-current', 'page')
  })
})
