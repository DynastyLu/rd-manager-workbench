# Native macOS Dock Magnification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current in-place Dock enlargement with a macOS-like two-dimensional fisheye wave that protrudes into the content area, spreads neighbours away from the pointer, and uses nine distinct application artworks.

**Architecture:** Keep `WorkspaceNavigation` as the shared pointer source and real route/permission owner. Move all visual math into a pure `dock-motion.ts` function, use an untransformed stable slot as the distance reference, and bind the resulting size, horizontal protrusion, and vertical spread to Framer Motion springs on the visual tile only. Replace the shared icon template with independent SVG compositions while preserving the existing `NavigationIcon` contract.

**Tech Stack:** React, TypeScript, React Router, Framer Motion, Less, Vitest, Testing Library, Playwright.

---

### Task 1: Replace the one-dimensional motion result with a two-dimensional fisheye model

**Files:**
- Modify: `frontend/src/components/AppShell/dock-motion.ts`
- Modify: `frontend/src/components/AppShell/__tests__/dock-motion.test.ts`

- [ ] **Step 1: Write failing tests for the native-style curve**

Update the expected result shape and add assertions for center peak, cosine falloff, horizontal protrusion, and outward main-axis spreading:

```ts
it('forms a right-facing fisheye arc across three item slots', () => {
  const center = mapDockDistance(0, false)
  const firstBelow = mapDockDistance(56, false)
  const secondBelow = mapDockDistance(112, false)
  const edgeBelow = mapDockDistance(168, false)

  expect(center.size).toBe(92)
  expect(center.outwardX).toBeGreaterThan(firstBelow.outwardX)
  expect(firstBelow.outwardX).toBeGreaterThan(secondBelow.outwardX)
  expect(secondBelow.outwardX).toBeGreaterThan(edgeBelow.outwardX)
  expect(edgeBelow.outwardX).toBe(0)
})

it('spreads neighbours away from the pointer instead of pulling them inward', () => {
  expect(mapDockDistance(-56, false).spreadY).toBeLessThan(0)
  expect(mapDockDistance(56, false).spreadY).toBeGreaterThan(0)
  expect(mapDockDistance(112, false).spreadY)
    .toBeGreaterThan(mapDockDistance(56, false).spreadY)
})

it('keeps far icons at base size while preserving cumulative expansion', () => {
  expect(mapDockDistance(220, false)).toMatchObject({
    size: 46,
    outwardX: 0,
    spreadY: 46,
    influence: 0,
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd frontend && pnpm vitest run src/components/AppShell/__tests__/dock-motion.test.ts
```

Expected: FAIL because `outwardX`, `spreadY`, and `influence` do not exist and the peak is still 76px.

- [ ] **Step 3: Implement the pure cosine fisheye function**

Use these public types and metrics:

```ts
export interface DockMotionResult {
  size: number
  outwardX: number
  spreadY: number
  influence: number
}

export interface DockMetrics {
  baseSize: number
  maxSize: number
  itemSlot: number
  influenceRadius: number
  outwardBoost: number
  maxSpread: number
}
```

Implement the mapping with a finite-pointer guard:

```ts
const normalized = Math.min(Math.abs(distance) / metrics.influenceRadius, 1)
const influence = normalized < 1
  ? Math.cos(normalized * Math.PI / 2) ** 2
  : 0
const size = metrics.baseSize + (metrics.maxSize - metrics.baseSize) * influence
const outwardX = (size - metrics.baseSize) / 2 + metrics.outwardBoost * influence
const spreadY = distance === 0
  ? 0
  : Math.sign(distance) * metrics.maxSpread * Math.sin(normalized * Math.PI / 2)
```

Use regular metrics `46/92/56/168/12/46` and compact metrics `40/78/48/144/10/38`. Round every numeric output to two decimals. Reduced motion or non-finite distance returns base size and zero transforms.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same Vitest command. Expected: all motion-model tests pass.

- [ ] **Step 5: Commit the motion model**

```bash
git add frontend/src/components/AppShell/dock-motion.ts frontend/src/components/AppShell/__tests__/dock-motion.test.ts
git commit -m "fix: form a native Dock fisheye curve"
```

### Task 2: Bind horizontal protrusion and stable vertical spreading to each Dock tile

**Files:**
- Modify: `frontend/src/components/AppShell/DockItem.tsx`
- Modify: `frontend/src/components/AppShell/__tests__/DockItem.test.tsx`
- Modify: `frontend/src/components/AppShell/AppShell.less`

- [ ] **Step 1: Write a failing component test for stable 2D motion binding**

Mock Framer Motion transforms and assert that the visual tile, not the hitbox slot, receives both horizontal and vertical motion values. Keep assertions that the link has an accessible name and no native `title` attribute.

```ts
expect(screen.getByTestId('dock-visual-home')).toHaveAttribute('data-motion-axis', 'xy')
expect(screen.getByRole('link', { name: '工作台' })).not.toHaveAttribute('title')
```

- [ ] **Step 2: Run the focused component test and verify RED**

```bash
cd frontend && pnpm vitest run src/components/AppShell/__tests__/DockItem.test.tsx
```

Expected: FAIL because the tile has no stable visual test marker and no horizontal spring.

- [ ] **Step 3: Make the slot the stable distance reference**

Change the distance transform so `slotRef.current.getBoundingClientRect()` reads an untransformed outer `div`. Remove `y` from the outer slot and create four derived targets:

```ts
const result = useTransform(distance, value => mapDockDistance(value, reduceMotion, metrics))
const sizeTarget = useTransform(result, value => value.size)
const xTarget = useTransform(result, value => value.outwardX)
const yTarget = useTransform(result, value => value.spreadY)
```

Attach springs for size, `x`, and `y` to `workspace-dock__tile`. The real `NavLink` remains full-slot and untransformed, preserving a stable hover and click target.

- [ ] **Step 4: Tune the spring and tooltip geometry**

Use one shared spring configuration with a fast response and no visible residual oscillation. Add `data-testid="dock-visual-${item.icon}"` and `data-motion-axis="xy"` to the visual tile. Move the tooltip far enough right that the 92px peak cannot cover it.

- [ ] **Step 5: Run component and navigation tests**

```bash
cd frontend && pnpm vitest run \
  src/components/AppShell/__tests__/DockItem.test.tsx \
  src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx
```

Expected: both files pass.

- [ ] **Step 6: Commit the 2D binding**

```bash
git add frontend/src/components/AppShell/DockItem.tsx frontend/src/components/AppShell/AppShell.less frontend/src/components/AppShell/__tests__/DockItem.test.tsx
git commit -m "fix: push Dock magnification into the workspace"
```

### Task 3: Replace the shared icon skin with nine independent application artworks

**Files:**
- Modify: `frontend/src/components/AppShell/WorkspaceDockIcon.tsx`
- Modify: `frontend/src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx`
- Modify: `frontend/src/components/AppShell/AppShell.less`

- [ ] **Step 1: Write a failing icon identity test**

Render the navigation and assert each visible SVG exposes a distinct artwork identifier rather than the shared palette template:

```ts
const artworks = screen.getAllByTestId(/dock-artwork-/)
expect(new Set(artworks.map(node => node.getAttribute('data-dock-artwork'))).size)
  .toBe(artworks.length)
```

- [ ] **Step 2: Run the navigation test and verify RED**

```bash
cd frontend && pnpm vitest run src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx
```

Expected: FAIL because current icons have only `data-dock-icon` and share the same generic SVG shell.

- [ ] **Step 3: Implement independent SVG compositions**

Replace `palettes` and `renderGlyph` with one complete SVG composition per `NavigationIcon`. Each icon must own its background, interior artwork, gradients, and highlights. Use these semantic compositions:

```text
home      cobalt workspace window
tasks     warm white checklist
projects  layered blue folder
employees green collaboration portrait
docs      white document and blue book spine
base      teal data grid
calendar  white calendar with red header
search    pearl search lens with coloured signal dots
settings  silver gear and control disc
```

Keep `viewBox="0 0 64 64"`, `data-dock-icon`, and add `data-testid` plus `data-dock-artwork`. Do not import or copy third-party application assets.

- [ ] **Step 4: Refine shared clipping and shadow only**

Keep outer CSS limited to consistent superellipse clipping and natural drop shadow. Remove filters that make every icon share the same glossy appearance.

- [ ] **Step 5: Run navigation tests and typecheck**

```bash
cd frontend && pnpm vitest run src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx
cd frontend && pnpm typecheck
```

Expected: tests and TypeScript pass.

- [ ] **Step 6: Commit independent artwork**

```bash
git add frontend/src/components/AppShell/WorkspaceDockIcon.tsx frontend/src/components/AppShell/AppShell.less frontend/src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx
git commit -m "style: give Dock apps distinct artwork"
```

### Task 4: Measure the real arc in Chromium and prevent regression

**Files:**
- Modify: `frontend/e2e/workspace-dock.spec.ts`
- Modify: `frontend/src/components/AppShell/AppShell.less`

- [ ] **Step 1: Extend the Playwright test with 2D geometry assertions**

At 1280×720, move the pointer to the center of one Dock item and read the tile rectangles for the center, first neighbour, second neighbour, and Dock rail:

```ts
expect(center.width).toBeGreaterThan(first.width)
expect(first.width).toBeGreaterThan(second.width)
expect(center.right).toBeGreaterThan(first.right)
expect(first.right).toBeGreaterThan(second.right)
expect(center.right - dock.right).toBeGreaterThan(24)
expect(above.y).toBeLessThan(aboveBaseY)
expect(below.y).toBeGreaterThan(belowBaseY)
```

- [ ] **Step 2: Run the focused E2E test and inspect any failure measurements**

```bash
cd frontend && pnpm playwright test e2e/workspace-dock.spec.ts --workers=1 --reporter=line
```

Expected before final tuning: geometry assertions identify any insufficient protrusion or reversed spread.

- [ ] **Step 3: Tune only metrics and spring constants**

Adjust `maxSize`, `outwardBoost`, `maxSpread`, and spring damping without changing the model shape. Keep 1280×600 navigation reachable and prevent clipping by the app shell.

- [ ] **Step 4: Run focused unit and browser validation**

```bash
cd frontend && pnpm vitest run \
  src/components/AppShell/__tests__/dock-motion.test.ts \
  src/components/AppShell/__tests__/DockItem.test.tsx \
  src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx
cd frontend && pnpm playwright test e2e/workspace-dock.spec.ts --workers=1 --reporter=line
```

Expected: all focused tests pass and all four browser scenarios pass.

- [ ] **Step 5: Run frontend regression gates**

```bash
cd frontend && pnpm lint
cd frontend && pnpm typecheck
cd frontend && pnpm build
git diff --check
```

Expected: lint, typecheck, build, and diff check exit successfully. Existing build-size or third-party warnings must be reported separately.

- [ ] **Step 6: Commit the browser-verified correction**

```bash
git add frontend/e2e/workspace-dock.spec.ts frontend/src/components/AppShell/AppShell.less
git commit -m "test: lock Dock protrusion geometry"
```
