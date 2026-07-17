import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import Layout from '../Layout'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: vi.fn() }
})

describe('Layout', () => {
  it('renders TabBar and Outlet area', () => {
    vi.mocked(useNavigate).mockReturnValue(vi.fn())
    const { container } = render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    )
    expect(container.querySelector('.tab-bar')).toBeInTheDocument()
    expect(container.querySelector('.layout__content')).toBeInTheDocument()
  })
})
