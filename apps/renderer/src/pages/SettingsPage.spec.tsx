import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { WorkbenchPreloadApi } from '@rd-manager/contracts'

import { App } from '@/app/App'

const RUNTIME_CONFIG = {
  apiBaseUrl: 'http://127.0.0.1:43127',
  sessionToken: 'a'.repeat(32),
  appVersion: '0.1.0',
  platform: 'darwin' as const,
}

function setWorkbenchApi(api: WorkbenchPreloadApi) {
  Object.defineProperty(window, 'workbench', {
    configurable: true,
    value: api,
  })
}

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <App />
    </MemoryRouter>,
  )
}

afterEach(() => {
  Reflect.deleteProperty(window, 'workbench')
  vi.unstubAllGlobals()
})

describe('SettingsPage diagnostics', () => {
  it('shows a loading state while desktop diagnostics are pending', () => {
    setWorkbenchApi({ getRuntimeConfig: () => new Promise(() => undefined) })

    renderSettings()

    expect(screen.getByText('正在读取本地运行状态')).toBeVisible()
  })

  it('shows ready backend and database diagnostics without exposing the token', async () => {
    setWorkbenchApi({ getRuntimeConfig: async () => RUNTIME_CONFIG })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { status: 'ready', database: 'ready' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderSettings()

    expect(await screen.findByText('后端服务运行正常')).toBeVisible()
    expect(screen.getByText('数据库连接正常')).toBeVisible()
    expect(screen.getByText('http://127.0.0.1:43127')).toBeVisible()
    expect(screen.getByText('0.1.0')).toBeVisible()
    expect(screen.queryByText(RUNTIME_CONFIG.sessionToken)).not.toBeInTheDocument()
  })

  it('shows a safe error when diagnostics fail', async () => {
    setWorkbenchApi({ getRuntimeConfig: async () => RUNTIME_CONFIG })
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('{"secret":"must-not-render"}', { status: 503 })),
    )

    renderSettings()

    expect(await screen.findByText('本地服务尚未就绪')).toBeVisible()
    expect(screen.queryByText(/must-not-render/)).not.toBeInTheDocument()
  })
})
