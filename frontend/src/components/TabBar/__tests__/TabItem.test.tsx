import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TabItem from '../TabItem'

describe('TabItem', () => {
  it('renders title', () => {
    render(
      <TabItem
        title="首页"
        path="/"
        active={false}
        onClose={vi.fn()}
        onClick={vi.fn()}
        isLast={false}
      />
    )
    expect(screen.getByText('首页')).toBeInTheDocument()
  })

  it('calls onClick when tab label clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <TabItem
        title="首页"
        path="/"
        active={false}
        onClose={vi.fn()}
        onClick={onClick}
        isLast={false}
      />
    )
    await user.click(screen.getByText('首页'))
    expect(onClick).toHaveBeenCalledWith('/')
  })

  it('calls onClose when × clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <TabItem
        title="首页"
        path="/"
        active={false}
        onClose={onClose}
        onClick={vi.fn()}
        isLast={false}
      />
    )
    await user.click(screen.getByRole('button', { name: /关闭/ }))
    expect(onClose).toHaveBeenCalledWith('/')
  })

  it('close button is disabled when isLast=true', () => {
    render(
      <TabItem
        title="首页"
        path="/"
        active={false}
        onClose={vi.fn()}
        onClick={vi.fn()}
        isLast={true}
      />
    )
    expect(screen.getByRole('button', { name: /关闭/ })).toBeDisabled()
  })

  it('has active class when active=true', () => {
    const { container } = render(
      <TabItem
        title="首页"
        path="/"
        active={true}
        onClose={vi.fn()}
        onClick={vi.fn()}
        isLast={false}
      />
    )
    expect(container.firstChild).toHaveClass('tab-item--active')
  })
})
