import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from '@/components/AppShell/AppShell'

describe('AppShell migration', () => {
  it('renders the workspace content area without the legacy tab bar', () => {
    const { container } = render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>
    )
    expect(container.querySelector('.app-shell__content')).toBeInTheDocument()
    expect(container.querySelector('.tab-bar')).not.toBeInTheDocument()
  })
})
