import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import routes from '@/router/routes'
import MeetingsPage from '@/pages/MeetingsPage'
import { AppShell } from '../AppShell'

const { listMeetings } = vi.hoisted(() => ({ listMeetings: vi.fn() }))

vi.mock('@/modules/workbench/api/management', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/workbench/api/management')>()),
  listMeetings,
}))

function renderShellPage(page: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/library']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="*" element={page} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('AppShell landmarks', () => {
  it.each([
    [
      'a planned module',
      () => {
        const LibraryPage = routes.find((route) => route.path === '/library')!.component
        return <LibraryPage />
      },
    ],
    ['the meetings page', () => <MeetingsPage />],
  ])('keeps one main landmark when rendering %s', async (_name, createPage) => {
    listMeetings.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } })
    const { container } = renderShellPage(createPage())

    expect(container.ownerDocument.querySelectorAll('main')).toHaveLength(1)
  })
})
