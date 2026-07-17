import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import jsxA11y from 'eslint-plugin-jsx-a11y'

// 使用 tseslint.config() 而非 eslint/config 的 defineConfig()
// tseslint.config() 对 extends 字段有明确保证，flat config 中不依赖 eslint/config 的处理机制
export default tseslint.config(
  // 全局忽略
  {
    ignores: [
      'coverage',
      'dist',
      'node_modules',
      'playwright-report',
      'pnpm-lock.yaml',
      'stats.html',
      'storybook-static',
      'test-results',
    ],
  },

  // JavaScript 文件（迁移完成前保留，Plan 2-5 迁移后此块可删除）
  {
    files: ['**/*.{js,jsx}'],
    extends: [js.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
  },

  // TypeScript 文件（vite.config.ts 等 node 配置文件使用 tsconfig.node.json）
  {
    files: ['*.config.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.node.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // TypeScript 源文件
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/**/__tests__/**',
      'src/**/*.test.{ts,tsx}',
      'src/**/*.stories.{ts,tsx}',
      'src/test-setup.ts',
      'src/mocks/**',
    ],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },

  // Test files, stories, mocks — use recommended (non-type-checked) rules only
  {
    files: [
      'src/**/__tests__/**/*.{ts,tsx}',
      'src/**/*.test.{ts,tsx}',
      'src/**/*.stories.{ts,tsx}',
      'src/test-setup.ts',
      'src/mocks/**/*.{ts,tsx}',
    ],
    extends: [...tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: {
      parser: tseslint.parser,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'react-refresh/only-export-components': 'off',
    },
  },

  // .storybook config files
  {
    files: ['.storybook/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      parser: tseslint.parser,
    },
  }
)
