import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 4312,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4312,
    strictPort: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  define: {
    // 注入构建版本号，供版本更新检测使用（Plan 3）
    __APP_VERSION__: JSON.stringify(process.env['npm_package_version'] ?? '0.0.0'),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router-dom')
          ) {
            return 'vendor-react'
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-motion'
          }
          if (id.includes('node_modules/@tanstack')) {
            return 'vendor-query'
          }
          if (id.includes('node_modules/@sentry')) {
            return 'vendor-sentry'
          }
          if (
            id.includes('node_modules/radix-ui') ||
            id.includes('node_modules/@radix-ui') ||
            id.includes('node_modules/lucide-react') ||
            id.includes('node_modules/class-variance-authority') ||
            id.includes('node_modules/tailwind-merge') ||
            id.includes('node_modules/clsx')
          ) {
            return 'vendor-ui'
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'e2e/**', 'playwright.config.ts'],
    globals: true,
    setupFiles: './src/test-setup.ts',
    // Default 5s is too tight under full parallelism: suites with heavy imports
    // (Semi UI, FullCalendar) starve each other on CPU and time out even though
    // they pass in isolation. 15s keeps the safety net without masking hangs.
    testTimeout: 30_000,
    // 15s was too tight under full parallelism for heavy user-event flows
    // (PartnersPage multi-dialog sequences); raised to 30s to match
    // worst-case loaded runs without masking genuine hangs.
    // Per-test awaits use testing-library's asyncUtilTimeout (10s),
    // configured in src/test-setup.ts; this is the outer safety net.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      thresholds: {
        branches: 25,
        functions: 30,
        lines: 35,
        statements: 35,
      },
      exclude: [
        '**/*.d.ts',
        '**/*.stories.{ts,tsx}',
        '**/test-setup.ts',
        '**/vite-env.d.ts',
      ],
    },
  },
})
