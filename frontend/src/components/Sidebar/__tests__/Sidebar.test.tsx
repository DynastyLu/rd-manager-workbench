import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import Sidebar from '../Sidebar'

function CurrentPath() {
  return <output>{useLocation().pathname}</output>
}

describe('Sidebar', () => {
  it('navigates with Enter from a semantic route link', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar />
        <CurrentPath />
      </MemoryRouter>
    )

    const projects = screen.getByRole('link', { name: /项目/ })
    projects.focus()
    await user.keyboard('{Enter}')

    expect(screen.getByRole('status')).toHaveTextContent('/spaces/projects')
  })
})
