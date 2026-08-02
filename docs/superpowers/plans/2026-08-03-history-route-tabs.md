# Compact Route History Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static current-route copy in the workspace header with compact, user-scoped history tabs that reuse the proven treasure-box routing algorithm while matching this workbench's responsive visual system.

**Architecture:** Pure route-history functions own normalization, validation, eviction, and close-target selection. A small React hook synchronizes those functions with React Router and per-user localStorage. `RouteHistoryTabs` renders the adaptive tab strip and overflow menu, while `AppShell` exposes an optional title context for dynamic project and employee names.

**Tech Stack:** React 19, React Router 7, Zustand auth state, Semi Design, Framer Motion, Less, Vitest/Testing Library, Playwright.

**Working-tree constraint:** The repository already contains unrelated uncommitted backend and frontend changes. Execute directly in the current worktree as the user requested, but do not create intermediate commits that would accidentally capture overlapping edits. Commit only when the user explicitly requests delivery.

---

## File map

- Create `frontend/src/components/AppShell/routeHistory.ts`: pure model, storage parsing, key normalization, eviction, close selection, sensitive query filtering.
- Create `frontend/src/components/AppShell/useRouteHistory.ts`: React Router synchronization and per-user persistence.
- Create `frontend/src/components/AppShell/RouteHistoryTabs.tsx`: adaptive visible tabs, overflow menu, close controls and keyboard behavior.
- Create `frontend/src/components/AppShell/RouteHistoryTabs.less`: compact workbench-specific appearance.
- Create `frontend/src/components/AppShell/RouteHistoryTitleContext.tsx`: dynamic title publishing without coupling AppShell to business queries.
- Modify `frontend/src/components/AppShell/AppShell.tsx`: provide title context and pass location/search/hash to the header.
- Modify `frontend/src/components/AppShell/WorkspaceHeader.tsx`: replace static route copy with `RouteHistoryTabs` while preserving search/actions.
- Modify `frontend/src/components/AppShell/AppShell.less`: give the history area a fluid, non-overflowing layout.
- Modify `frontend/src/pages/ProjectWorkspacePage.tsx`: publish the loaded project name.
- Modify `frontend/src/pages/EmployeeDetailPage.tsx`: publish the loaded employee name.
- Create tests next to the new modules and extend existing AppShell browser coverage.

---

### Task 1: Pure route-history model

**Files:**
- Create: `frontend/src/components/AppShell/routeHistory.ts`
- Test: `frontend/src/components/AppShell/__tests__/routeHistory.test.ts`

- [ ] **Step 1: Write failing normalization and close-selection tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  closeHistoryEntry,
  createHistoryEntry,
  parseStoredHistory,
  sanitizeHistoryHref,
  visitHistoryEntry,
} from '../routeHistory'

describe('routeHistory', () => {
  it('updates the last href without duplicating query-only navigation', () => {
    const home = createHistoryEntry('/', '/', '工作台', '工作台', true, 1)
    const first = visitHistoryEntry([home], {
      pathname: '/employees',
      href: '/employees?tab=directory',
      pattern: '/employees',
      title: '员工',
      visitedAt: 2,
    })
    const second = visitHistoryEntry(first, {
      pathname: '/employees',
      href: '/employees?tab=imports',
      pattern: '/employees',
      title: '员工',
      visitedAt: 3,
    })

    expect(second).toHaveLength(2)
    expect(second[1]).toMatchObject({ key: '/employees', href: '/employees?tab=imports' })
  })

  it('keeps different project ids but folds project sections into one key', () => {
    const first = visitHistoryEntry([], {
      pathname: '/spaces/projects/p-1/overview',
      href: '/spaces/projects/p-1/overview',
      pattern: '/spaces/projects/:projectId/:section?',
      title: '项目详情',
      visitedAt: 1,
    })
    const second = visitHistoryEntry(first, {
      pathname: '/spaces/projects/p-1/risks',
      href: '/spaces/projects/p-1/risks',
      pattern: '/spaces/projects/:projectId/:section?',
      title: '项目详情',
      visitedAt: 2,
    })
    const third = visitHistoryEntry(second, {
      pathname: '/spaces/projects/p-2/overview',
      href: '/spaces/projects/p-2/overview',
      pattern: '/spaces/projects/:projectId/:section?',
      title: '项目详情',
      visitedAt: 3,
    })

    expect(third.map((entry) => entry.key)).toEqual([
      '/spaces/projects/p-1',
      '/spaces/projects/p-2',
    ])
    expect(third[0]?.href).toBe('/spaces/projects/p-1/risks')
  })

  it('selects the left neighbor when closing the active entry', () => {
    const entries = [
      createHistoryEntry('/', '/', '工作台', '工作台', true, 1),
      createHistoryEntry('/employees', '/employees', '/employees', '员工', false, 2),
      createHistoryEntry('/calendar', '/calendar', '/calendar', '日历', false, 3),
    ]
    expect(closeHistoryEntry(entries, '/calendar', '/calendar')).toMatchObject({
      nextHref: '/employees',
      entries: expect.arrayContaining([expect.objectContaining({ key: '/employees' })]),
    })
  })

  it('rejects corrupt storage and strips secret parameters', () => {
    expect(parseStoredHistory('{bad-json')).toEqual([])
    expect(sanitizeHistoryHref('/search?q=项目&token=secret&PASSWORD=hidden')).toBe(
      '/search?q=%E9%A1%B9%E7%9B%AE',
    )
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd frontend
pnpm exec vitest run src/components/AppShell/__tests__/routeHistory.test.ts --maxWorkers=1
```

Expected: FAIL because `../routeHistory` does not exist.

- [ ] **Step 3: Implement the pure model**

Implement these public contracts:

```ts
export interface RouteHistoryEntry {
  key: string
  href: string
  title: string
  pattern: string
  visitedAt: number
  pinned: boolean
}

export interface RouteVisit {
  pathname: string
  href: string
  title: string
  pattern: string
  visitedAt: number
}

export const MAX_HISTORY_ENTRIES = 21

export function normalizeRouteKey(pathname: string, pattern: string): string
export function sanitizeHistoryHref(href: string): string
export function createHistoryEntry(
  key: string,
  href: string,
  pattern: string,
  title: string,
  pinned: boolean,
  visitedAt: number,
): RouteHistoryEntry
export function visitHistoryEntry(
  entries: RouteHistoryEntry[],
  visit: RouteVisit,
): RouteHistoryEntry[]
export function closeHistoryEntry(
  entries: RouteHistoryEntry[],
  key: string,
  activeKey: string,
): { entries: RouteHistoryEntry[]; nextHref?: string }
export function closeOtherHistoryEntries(
  entries: RouteHistoryEntry[],
  key: string,
): RouteHistoryEntry[]
export function parseStoredHistory(raw: string | null): RouteHistoryEntry[]
```

Normalization rules:

```ts
if (pattern === '/spaces/projects/:projectId/:section?') {
  return pathname.match(/^\/spaces\/projects\/[^/]+/)?.[0] ?? pathname
}
if (pattern === '/employees/:employeeId') return pathname.replace(/\/$/, '')
return pathname.replace(/\/$/, '') || '/'
```

`visitHistoryEntry` updates an existing entry in place, appends a new entry otherwise, keeps `/` first, and evicts the least recently visited non-pinned/non-active entries until the maximum is met.

- [ ] **Step 4: Run the focused test and verify GREEN**

Expected: all route-history model tests pass with no warnings.

---

### Task 2: User-scoped router synchronization

**Files:**
- Create: `frontend/src/components/AppShell/useRouteHistory.ts`
- Test: `frontend/src/components/AppShell/__tests__/useRouteHistory.test.tsx`

- [ ] **Step 1: Write failing hook tests**

Cover these behaviors with `MemoryRouter` and `useAuthStore`:

```ts
it('persists history under the authenticated user id', async () => {
  renderHistoryHook('/employees?tab=directory', currentUser('user-a'))
  await waitFor(() => {
    const saved = localStorage.getItem('rd-workbench:route-history:v1:user-a')
    expect(saved).toContain('/employees?tab=directory')
  })
})

it('does not restore another users history after account switch', async () => {
  localStorage.setItem(
    'rd-workbench:route-history:v1:user-a',
    JSON.stringify([historyEntry('/employees')]),
  )
  renderHistoryHook('/', currentUser('user-b'))
  expect(screen.queryByText('员工')).not.toBeInTheDocument()
})
```

Also assert that changing only `search` updates `href`, that fallback/redirect routes are not recorded, and that logout stops writes.

- [ ] **Step 2: Run the hook tests and verify RED**

Expected: FAIL because `useRouteHistory` does not exist.

- [ ] **Step 3: Implement `useRouteHistory`**

The hook accepts explicit inputs so it stays testable:

```ts
interface UseRouteHistoryInput {
  userId?: string
  pathname: string
  search: string
  hash: string
  route?: RouteDefinition
  titleOverride?: string
}

interface RouteHistoryController {
  entries: RouteHistoryEntry[]
  activeKey: string
  open: (key: string) => void
  close: (key: string) => void
  closeOthers: (key: string) => void
}
```

Use `useNavigate` only for `open` and active-close navigation. Reinitialize state when `userId` changes. Persist with `sanitizeHistoryHref`; do not write when `userId` or a canonical route is absent.

- [ ] **Step 4: Run the hook tests and verify GREEN**

Expected: user isolation, route synchronization, close navigation and persistence tests pass.

---

### Task 3: Compact adaptive tab strip

**Files:**
- Create: `frontend/src/components/AppShell/RouteHistoryTabs.tsx`
- Create: `frontend/src/components/AppShell/RouteHistoryTabs.less`
- Test: `frontend/src/components/AppShell/__tests__/RouteHistoryTabs.test.tsx`

- [ ] **Step 1: Write failing component tests**

Test the public UI contract rather than implementation details:

```ts
it('renders home as pinned and closes a regular tab', async () => {
  const close = vi.fn()
  render(<RouteHistoryTabs controller={controller({ close })} />)

  expect(screen.queryByRole('button', { name: '关闭工作台' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '关闭员工' }))
  expect(close).toHaveBeenCalledWith('/employees')
})

it('keeps the active tab visible and moves hidden entries into the overflow menu', async () => {
  mockElementWidths({ container: 260, home: 64, employees: 72, calendar: 64, audit: 88 })
  render(<RouteHistoryTabs controller={controller({ activeKey: '/admin/security-audits' })} />)

  expect(screen.getByRole('tab', { name: /安全审计/ })).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: /更多历史路由/ }))
  expect(await screen.findByRole('menuitem', { name: /员工/ })).toBeVisible()
})
```

Add keyboard assertions for ArrowLeft/ArrowRight, Enter/Space and Delete.

- [ ] **Step 2: Run component tests and verify RED**

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the adaptive component**

Use `ResizeObserver` and measured item widths. The visible set must always include:

```ts
const mandatoryKeys = new Set(['/', controller.activeKey])
```

Fill remaining capacity using entries sorted by `visitedAt` descending, then render them in original history order. If hidden entries exist, reserve the overflow button width before the final calculation.

Use Semi `Dropdown` for the `+N` menu and Framer Motion only for the active indicator and entry/exit opacity. Respect the global `MotionConfig` reduced-motion setting.

Style constraints:

```less
.route-history-tabs {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 3px;
  overflow: hidden;
}

.route-history-tab {
  display: inline-flex;
  min-width: 38px;
  max-width: clamp(76px, 7vw, 116px);
  height: 30px;
  flex: 0 1 auto;
}
```

No treasure-box CSS variables, theme selectors, 36px secondary bar, permanent arrows, or full-width tab backgrounds may be copied.

- [ ] **Step 4: Run component tests and verify GREEN**

Expected: rendering, overflow, close and keyboard tests pass.

---

### Task 4: Dynamic titles and AppShell integration

**Files:**
- Create: `frontend/src/components/AppShell/RouteHistoryTitleContext.tsx`
- Modify: `frontend/src/components/AppShell/AppShell.tsx`
- Modify: `frontend/src/components/AppShell/WorkspaceHeader.tsx`
- Modify: `frontend/src/components/AppShell/AppShell.less`
- Modify: `frontend/src/pages/ProjectWorkspacePage.tsx`
- Modify: `frontend/src/pages/EmployeeDetailPage.tsx`
- Modify: `frontend/src/components/AppShell/__tests__/WorkspaceHeader.test.tsx`
- Modify: `frontend/src/components/AppShell/__tests__/AppShell.test.tsx`

- [ ] **Step 1: Write failing integration tests**

Add tests proving:

```ts
expect(screen.getByRole('tablist', { name: '历史路由' })).toBeInTheDocument()
expect(screen.queryByText('本地单人空间')).not.toBeInTheDocument()
expect(screen.getByRole('tab', { name: /工作台/ })).toHaveAttribute('aria-selected', 'true')
```

Render a test page that calls `useRouteHistoryTitle('星河项目')`, then assert the current tab title updates without creating a second tab.

- [ ] **Step 2: Run integration tests and verify RED**

Expected: FAIL because the header still renders static route copy and no title context exists.

- [ ] **Step 3: Implement the title context**

Expose:

```ts
export function RouteHistoryTitleProvider({ children }: PropsWithChildren): JSX.Element
export function useRouteHistoryTitle(title?: string): void
export function useCurrentRouteHistoryTitle(): string | undefined
```

The provider resets its title whenever `pathname` changes. Publishing `undefined` during page loading must not erase a previously resolved title for the same active route.

- [ ] **Step 4: Integrate the header and pages**

`AppShell` reads the full location:

```ts
const location = useLocation()
const activeRoute = findActiveRoute(location.pathname)
```

Wrap `WorkspaceHeader` and `<main>` in `RouteHistoryTitleProvider`, and pass `route`, `pathname`, `search`, `hash`, and `titleOverride` into the history hook/component.

In the project and employee detail pages, publish only resolved names:

```ts
useRouteHistoryTitle(project?.name)
useRouteHistoryTitle(employee?.name)
```

Replace only the existing `.workspace-header__route` contents. Preserve `.workspace-header__identity`, search, create menu, recent-project action, notifications, settings and account menu.

- [ ] **Step 5: Make the left header column fluid**

Update the grid without fixed page-specific widths:

```less
.workspace-header {
  grid-template-columns:
    minmax(260px, 1fr)
    minmax(300px, 1.2fr)
    minmax(max-content, 1fr);
}

.workspace-header__context {
  overflow: hidden;
}
```

At the existing 1180px/900px breakpoints, hide or compact the search exactly as the AppShell currently does; do not introduce a new horizontal page scrollbar.

- [ ] **Step 6: Run integration tests and verify GREEN**

Run:

```bash
pnpm exec vitest run \
  src/components/AppShell/__tests__/routeHistory.test.ts \
  src/components/AppShell/__tests__/useRouteHistory.test.tsx \
  src/components/AppShell/__tests__/RouteHistoryTabs.test.tsx \
  src/components/AppShell/__tests__/WorkspaceHeader.test.tsx \
  src/components/AppShell/__tests__/AppShell.test.tsx \
  --maxWorkers=1
```

Expected: all focused tests pass.

---

### Task 5: Browser regression and delivery verification

**Files:**
- Modify: `frontend/e2e/workspace-layout.spec.ts`
- Create: `frontend/e2e/route-history-tabs.spec.ts`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

- [ ] **Step 1: Write the failing Playwright behavior test**

The test must:

1. Log in as the default admin.
2. Open `/`, `/employees?tab=directory`, `/calendar`, and `/admin/security-audits`.
3. Assert one “员工” tab exists after switching `/employees` query tabs.
4. Assert “安全审计” remains visible at 1280px.
5. Close the active “安全审计” tab and assert navigation returns to “日历”.
6. Reload and assert the same user's history is restored.
7. Assert `document.documentElement.scrollWidth <= window.innerWidth + 2`.

- [ ] **Step 2: Run Playwright and verify RED**

```bash
BASE_URL=http://127.0.0.1:4312 \
pnpm exec playwright test e2e/route-history-tabs.spec.ts --project=chromium --workers=1
```

Expected: FAIL because no route-history tablist exists.

- [ ] **Step 3: Complete browser-facing fixes and run GREEN**

Adjust only measured tab capacity, accessible labels, or responsive styles revealed by the test. Do not weaken assertions or replace actual navigation with mocked state.

- [ ] **Step 4: Run the full focused verification set**

```bash
pnpm typecheck
pnpm exec vitest run \
  src/components/AppShell/__tests__/routeHistory.test.ts \
  src/components/AppShell/__tests__/useRouteHistory.test.tsx \
  src/components/AppShell/__tests__/RouteHistoryTabs.test.tsx \
  src/components/AppShell/__tests__/WorkspaceHeader.test.tsx \
  src/components/AppShell/__tests__/AppShell.test.tsx \
  src/__tests__/workspaceLayoutRules.test.ts \
  --maxWorkers=1
BASE_URL=http://127.0.0.1:4312 \
pnpm exec playwright test \
  e2e/route-history-tabs.spec.ts \
  e2e/workspace-layout.spec.ts \
  --project=chromium --workers=1
pnpm build
git diff --check
```

Expected: typecheck, focused tests, both Chromium specs, production build and whitespace check pass. Report existing third-party build warnings separately.

- [ ] **Step 5: Record the implementation outcome**

Update the three project planning files with:

- copied algorithm boundaries versus newly designed visual behavior;
- user-scoped storage key and route-key rules;
- tests and viewport evidence;
- any unrelated warnings or skipped tests that remain.

