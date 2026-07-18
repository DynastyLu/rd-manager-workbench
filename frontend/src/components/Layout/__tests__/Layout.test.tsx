import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from '@/components/AppShell/AppShell'

describe('AppShell migration', () => {
  it('renders the workspace content area without the legacy tab bar', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AppShell />
        </MemoryRouter>
      </QueryClientProvider>
    )
    expect(container.querySelector('.app-shell__content')).toBeInTheDocument()
    expect(container.querySelector('.tab-bar')).not.toBeInTheDocument()
  })
})
