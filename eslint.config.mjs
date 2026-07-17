import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'release/**', '.worktrees/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      '*.{js,mjs,cjs,ts,mts,cts}',
      'scripts/**/*.{js,mjs,cjs,ts,mts,cts}',
      'apps/backend/**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}',
      'apps/desktop/**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['apps/renderer/**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'no-restricted-globals': [
        'error',
        'process',
        'Buffer',
        'require',
        'module',
        '__filename',
        '__dirname',
        'global',
      ],
    },
  },
)
