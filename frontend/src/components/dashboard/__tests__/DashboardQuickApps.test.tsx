import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { DashboardQuickApps } from '../DashboardQuickApps'

const items = [
  { title: '项目', description: '管理项目与进度', to: '/projects', icon: <span data-testid="project-icon" /> },
  { title: '任务', description: '查看我的任务', to: '/tasks', icon: <span data-testid="task-icon" /> },
]

function renderQuickApps() {
  return render(
    <MemoryRouter>
      <DashboardQuickApps items={items} />
    </MemoryRouter>
  )
}

describe('DashboardQuickApps', () => {
  it('renders the section heading', () => {
    renderQuickApps()
    expect(screen.getByRole('heading', { name: '常用应用' })).toBeInTheDocument()
  })

  it('renders a navigation landmark for the app grid', () => {
    renderQuickApps()
    expect(screen.getByRole('navigation', { name: '常用应用' })).toBeInTheDocument()
  })

  it('renders a link for each app with title, description and route', () => {
    renderQuickApps()

    const projectLink = screen.getByRole('link', { name: /项目/ })
    expect(projectLink).toHaveAttribute('href', '/projects')
    expect(screen.getByText('管理项目与进度')).toBeInTheDocument()

    const taskLink = screen.getByRole('link', { name: /任务/ })
    expect(taskLink).toHaveAttribute('href', '/tasks')
    expect(screen.getByText('查看我的任务')).toBeInTheDocument()
  })

  it('renders icons as decorative', () => {
    const { container } = renderQuickApps()
    const iconWrappers = container.querySelectorAll('.dashboard-quick-apps__icon')
    expect(iconWrappers.length).toBe(items.length)
    iconWrappers.forEach((wrapper) => {
      expect(wrapper).toHaveAttribute('aria-hidden', 'true')
    })
  })

  it('renders nothing when items is empty', () => {
    render(
      <MemoryRouter>
        <DashboardQuickApps items={[]} />
      </MemoryRouter>
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
