import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DashboardWidget } from '../DashboardWidget'

describe('DashboardWidget', () => {
  it('renders the title as a heading', () => {
    render(
      <DashboardWidget title="今日行动">
        <span data-testid="content">content</span>
      </DashboardWidget>
    )
    expect(screen.getByRole('heading', { name: '今日行动' })).toBeInTheDocument()
  })

  it('renders children inside the body', () => {
    render(
      <DashboardWidget title="今日行动">
        <span data-testid="content">content</span>
      </DashboardWidget>
    )
    expect(screen.getByTestId('content')).toBeInTheDocument()
  })

  it('applies workspace-card and dashboard-widget classes', () => {
    const { container } = render(
      <DashboardWidget title="今日行动">content</DashboardWidget>
    )
    const root = container.firstChild as HTMLElement
    expect(root).toHaveClass('workspace-card')
    expect(root).toHaveClass('dashboard-widget')
  })

  it('applies the optional className', () => {
    const { container } = render(
      <DashboardWidget title="今日行动" className="my-widget">content</DashboardWidget>
    )
    const root = container.firstChild as HTMLElement
    expect(root).toHaveClass('my-widget')
  })

  it('renders footer when provided', () => {
    render(
      <DashboardWidget title="今日行动" footer={<span data-testid="footer">footer</span>}>
        content
      </DashboardWidget>
    )
    expect(screen.getByTestId('footer')).toBeInTheDocument()
  })

  it('does not render footer when omitted', () => {
    const { container } = render(
      <DashboardWidget title="今日行动">content</DashboardWidget>
    )
    expect(container.querySelector('.dashboard-widget__footer')).not.toBeInTheDocument()
  })
})
