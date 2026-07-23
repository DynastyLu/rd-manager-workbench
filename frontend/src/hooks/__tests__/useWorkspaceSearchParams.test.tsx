import { act, renderHook } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { useWorkspaceSearchParams } from '../useWorkspaceSearchParams'

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={['/projects?view=invalid&page=-2&foreign=keep']}>{children}</MemoryRouter>
}

describe('useWorkspaceSearchParams', () => {
  it('falls back for invalid enum and positive integer values', () => {
    const { result } = renderHook(
      () => {
        const query = useWorkspaceSearchParams()
        return {
          view: query.getEnum('view', ['all', 'recent'] as const, 'all'),
          page: query.getPositiveInt('page', 1),
        }
      },
      { wrapper },
    )

    expect(result.current).toEqual({ view: 'all', page: 1 })
  })

  it('preserves unknown parameters and removes default values', () => {
    const { result } = renderHook(
      () => {
        const query = useWorkspaceSearchParams()
        const location = useLocation()
        return { query, search: location.search }
      },
      { wrapper },
    )

    act(() => {
      result.current.query.update(
        { view: 'recent', page: 1, search: '评审' },
        { defaults: { view: 'all', page: 1 } },
      )
    })

    expect(new URLSearchParams(result.current.search).get('foreign')).toBe('keep')
    expect(new URLSearchParams(result.current.search).get('view')).toBe('recent')
    expect(new URLSearchParams(result.current.search).get('page')).toBeNull()
    expect(new URLSearchParams(result.current.search).get('search')).toBe('评审')
  })

  it('queues consecutive updates without dropping an earlier parameter', () => {
    const { result } = renderHook(
      () => {
        const query = useWorkspaceSearchParams()
        const location = useLocation()
        return { query, search: location.search }
      },
      { wrapper },
    )

    act(() => {
      result.current.query.update({ view: 'recent' })
      result.current.query.update({ search: '里程碑' })
    })

    const params = new URLSearchParams(result.current.search)
    expect(params.get('view')).toBe('recent')
    expect(params.get('search')).toBe('里程碑')
    expect(params.get('foreign')).toBe('keep')
  })
})
