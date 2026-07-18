import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppShell } from '../AppShell'

function CurrentPath() {
  return <output aria-label="当前路径">{useLocation().pathname}</output>
}

function renderShell(initialPath = '/library') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<AppShell skeleton={<p>加载中</p>} />}>
          <Route
            path="*"
            element={
              <>
                <CurrentPath />
                <Outlet />
              </>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('AppShell', () => {
  it('renders semantic primary navigation, active library, and the route content area without tabs', () => {
    const { container } = renderShell()

    expect(screen.getByRole('navigation', { name: '主导航' })).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(10)
    expect(screen.getByRole('link', { name: /业务库/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(container.querySelector('.tab-bar')).not.toBeInTheDocument()
  })

  it('navigates to settings when its semantic link receives Enter', async () => {
    const user = userEvent.setup()
    renderShell()

    const settings = screen.getByRole('link', { name: /设置/ })
    settings.focus()
    await user.keyboard('{Enter}')

    expect(screen.getByLabelText('当前路径')).toHaveTextContent('/settings')
  })
})
