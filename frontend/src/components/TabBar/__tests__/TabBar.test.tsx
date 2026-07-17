import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import TabBar from '../TabBar'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: vi.fn() }
})

const ROUTES = [
  { path: '/', title: '首页' },
  { path: '/settings', title: '设置' },
]

function Wrapper({ path = '/', children }) {
  return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
}

describe('TabBar', () => {
  beforeEach(() => {
    vi.mocked(useNavigate).mockReturnValue(vi.fn())
    localStorage.clear()
  })

  it('renders tab title from routes prop', () => {
    render(
      <Wrapper path="/">
        <TabBar routes={ROUTES} />
      </Wrapper>
    )
    expect(screen.getByText('首页')).toBeInTheDocument()
  })

  it('close button on sole tab is disabled', () => {
    render(
      <Wrapper path="/">
        <TabBar routes={ROUTES} />
      </Wrapper>
    )
    expect(screen.getByRole('button', { name: /关闭/ })).toBeDisabled()
  })

  it('renders left/right arrow buttons', () => {
    render(
      <Wrapper path="/">
        <TabBar routes={ROUTES} />
      </Wrapper>
    )
    expect(screen.getByLabelText('向左滚动')).toBeInTheDocument()
    expect(screen.getByLabelText('向右滚动')).toBeInTheDocument()
  })

  it('arrow buttons hidden when no overflow', () => {
    render(
      <Wrapper path="/">
        <TabBar routes={ROUTES} />
      </Wrapper>
    )
    expect(screen.getByLabelText('向左滚动')).toHaveStyle({ visibility: 'hidden' })
    expect(screen.getByLabelText('向右滚动')).toHaveStyle({ visibility: 'hidden' })
  })

  it('restores tabs from localStorage', () => {
    localStorage.setItem(
      'tabbar_state',
      JSON.stringify({
        tabs: [
          { path: '/', title: '首页' },
          { path: '/settings', title: '设置' },
        ],
      })
    )
    render(
      <Wrapper path="/settings">
        <TabBar routes={ROUTES} />
      </Wrapper>
    )
    expect(screen.getAllByRole('button', { name: /关闭/ })).toHaveLength(2)
  })

  it('removes obsolete persisted tool tabs without navigating away from the current route', () => {
    const navigate = vi.fn()
    vi.mocked(useNavigate).mockReturnValue(navigate)
    localStorage.setItem(
      'tabbar_state',
      JSON.stringify({
        tabs: [
          { path: '/', title: '首页' },
          { path: '/ocr', title: '识别工具' },
        ],
      })
    )

    render(
      <Wrapper path="/">
        <TabBar routes={ROUTES} />
      </Wrapper>
    )

    expect(screen.queryByText('识别工具')).not.toBeInTheDocument()
    expect(screen.getByText('首页')).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('closing active tab navigates to neighbor', async () => {
    const navigate = vi.fn()
    vi.mocked(useNavigate).mockReturnValue(navigate)
    localStorage.setItem(
      'tabbar_state',
      JSON.stringify({
        tabs: [
          { path: '/', title: '首页' },
          { path: '/settings', title: '设置' },
        ],
      })
    )

    const user = userEvent.setup()
    render(
      <Wrapper path="/settings">
        <TabBar routes={ROUTES} />
      </Wrapper>
    )

    // Active tab is '/settings' (last in list), close it → should navigate to '/'
    const closeButtons = screen.getAllByRole('button', { name: /关闭/ })
    await user.click(closeButtons[closeButtons.length - 1])
    expect(navigate).toHaveBeenCalledWith('/')
  })
})
