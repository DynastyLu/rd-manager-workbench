import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  define: {
    // 注入构建版本号，供版本更新检测使用（Plan 3）
    __APP_VERSION__: JSON.stringify(process.env['npm_package_version'] ?? '0.0.0'),
  },
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
