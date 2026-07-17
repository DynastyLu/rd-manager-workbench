# Frontend Template Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `treasure-box` into a reusable, production-ready React frontend engineering template.

**Architecture:** Keep the existing Vite + React + TypeScript app structure, and add missing engineering boundaries around quality gates, CI, runtime configuration, E2E testing, deployment, and maintenance automation. Avoid business-page rewrites; template work should stay infrastructure-focused.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Playwright, ESLint, Prettier, Husky, lint-staged, Storybook, MSW, Docker, GitHub Actions, Renovate.

---

### Task 1: Quality Gates And CI

**Files:**

- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Create: `.github/dependabot.yml`
- Create: `renovate.json`

- [ ] Add a root-level `check` script that runs lint, typecheck, unit tests, production build, and Storybook build.
- [ ] Fix GitHub Actions to run from the repository root instead of the removed `frontend` directory.
- [ ] Add dependency cache paths for the root `pnpm-lock.yaml`.
- [ ] Add automated dependency update configuration.

### Task 2: Coverage And Bundle Analysis

**Files:**

- Modify: `package.json`
- Modify: `vite.config.ts`

- [ ] Add Vitest coverage provider dependency and coverage thresholds.
- [ ] Replace the broken bundle analyzer command with an installed analyzer.
- [ ] Keep coverage reports and generated analyzer files out of Git.

### Task 3: Runtime Configuration Contract

**Files:**

- Modify: `src/lib/request.ts`
- Modify: `src/lib/__tests__/config.test.ts`
- Create: `src/lib/__tests__/requestConfig.test.ts`

- [ ] Make the HTTP client resolve relative `/api` URLs against `config.apiBaseUrl`.
- [ ] Keep absolute URLs unchanged for downloads and third-party URLs.
- [ ] Add regression tests proving runtime config controls API origin.

### Task 4: E2E Smoke Test

**Files:**

- Create: `playwright.config.ts`
- Create: `e2e/smoke.spec.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

- [ ] Add Playwright with a Chromium smoke suite.
- [ ] Start the Vite dev server through Playwright `webServer`.
- [ ] Verify the login page renders and the app has a stable title.
- [ ] Upload Playwright reports in CI when tests fail.

### Task 5: Deployment Template

**Files:**

- Create: `Dockerfile`
- Create: `nginx.conf`
- Create: `.dockerignore`
- Create: `scripts/write-build-info.mjs`
- Modify: `package.json`
- Modify: `public/version.json`

- [ ] Add a production static Docker image based on nginx.
- [ ] Support SPA fallback and runtime `config.js` overrides.
- [ ] Generate `version.json` from package version, git SHA, and build time before build.

### Task 6: Repository Hygiene And Documentation

**Files:**

- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `docs/GUIDE.md`

- [ ] Ignore generated test, coverage, report, and analyzer outputs.
- [ ] Remove local `.DS_Store` files from source folders.
- [ ] Document template commands, CI, E2E, coverage, deployment, and runtime config.

### Task 7: Verification

**Commands:**

- `pnpm install`
- `pnpm check`
- `pnpm test:coverage`
- `pnpm analyze`
- `pnpm test:e2e`

- [ ] Run the full verification suite.
- [ ] Report any command that cannot be completed with the exact failure.
