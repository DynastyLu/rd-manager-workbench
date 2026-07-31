import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env['E2E_PORT'] ?? 4312)
const baseURL = process.env['BASE_URL'] ?? `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : 2,
  reporter: process.env['CI']
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['list'], ['html', { open: 'on-failure' }]],
  timeout: 45_000,
  // 5s is too tight when the whole suite runs fullyParallel locally: 15
  // chromium workers contend for the dev API, and data-dependent assertions
  // (e.g. the /base grid search box) miss the window even though the page is
  // healthy. 10s covers loaded runs without masking real regressions.
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env['BASE_URL']
    ? undefined
    : {
        command: `pnpm exec vite --host 127.0.0.1 --port ${PORT} --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env['CI'],
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
})
