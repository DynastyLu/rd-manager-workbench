# Fullscreen Galaxy Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the React Bits Galaxy canvas across the complete login viewport and replace the opaque right panel with a readable translucent glass login card.

**Architecture:** Keep `GalaxyBackground` as the single WebGL renderer, but move it from the left story section to the login page root. Place the two-column login workspace above it as a pointer-transparent content layer, then re-enable pointer events only on the form card. CSS owns the visual hierarchy and responsive fallback; authentication logic remains untouched.

**Tech Stack:** React 19, TypeScript, Less, React Bits Galaxy via OGL, Playwright, Vitest, Vite.

---

### Task 1: Add full-viewport and glass-material regression coverage

**Files:**
- Modify: `frontend/e2e/login-galaxy.spec.ts`

- [ ] **Step 1: Extend the desktop test with full-viewport and material assertions**

Add assertions that compare the Galaxy rectangle with the viewport, verify the access panel is transparent, verify the card has a translucent alpha and backdrop blur, and verify the form card remains interactive:

```ts
const viewport = page.viewportSize()
const galaxyBox = await galaxy.boundingBox()
expect(galaxyBox?.x).toBe(0)
expect(galaxyBox?.y).toBe(0)
expect(galaxyBox?.width).toBe(viewport?.width)
expect(galaxyBox?.height).toBe(viewport?.height)

await expect(page.locator('.aurora-login-page__access')).toHaveCSS(
  'background-color',
  'rgba(0, 0, 0, 0)',
)
await expect(page.locator('.aurora-login-page__card')).toHaveCSS('pointer-events', 'auto')

const cardMaterial = await page.locator('.aurora-login-page__card').evaluate((card) => {
  const style = getComputedStyle(card)
  const alpha = Number(style.backgroundColor.match(/[\d.]+/g)?.at(-1) ?? 1)
  return { alpha, backdropFilter: style.backdropFilter }
})
expect(cardMaterial.alpha).toBeGreaterThan(0)
expect(cardMaterial.alpha).toBeLessThan(0.9)
expect(cardMaterial.backdropFilter).not.toBe('none')
```

- [ ] **Step 2: Add a mobile viewport regression test**

Add a `390 × 844` test that checks Galaxy still fills the viewport and the page does not create horizontal overflow:

```ts
test('keeps the galaxy full-screen and the glass card within a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/login')

  const galaxyBox = await page.getByTestId('login-galaxy').boundingBox()
  expect(galaxyBox?.width).toBe(390)
  expect(galaxyBox?.height).toBe(844)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await expect(page.getByRole('button', { name: '登录' })).toBeVisible()
})
```

- [ ] **Step 3: Run the focused browser test and verify RED**

Run:

```bash
cd frontend
pnpm exec playwright test e2e/login-galaxy.spec.ts --project=chromium --workers=1
```

Expected: FAIL because the current Galaxy width equals only the left column, the access panel is opaque, or the content layer blocks the new full-page hierarchy.

### Task 2: Move Galaxy to the page root and implement the glass hierarchy

**Files:**
- Modify: `frontend/src/modules/auth/pages/LoginPage.tsx`
- Modify: `frontend/src/modules/auth/pages/LoginPage.less`
- Test: `frontend/e2e/login-galaxy.spec.ts`

- [ ] **Step 1: Move the Galaxy component outside the story section**

Render one Galaxy directly beneath the workspace:

```tsx
return (
  <div className="aurora-login-page">
    <GalaxyBackground
      data-testid="login-galaxy"
      aria-hidden="true"
      {...LOGIN_GALAXY_PRESET}
      mouseInteraction={!prefersReducedMotion}
      disableAnimation={Boolean(prefersReducedMotion)}
      transparent
    />
    <main className="aurora-login-page__workspace">
      <section className="aurora-login-page__story" aria-label="研发工作台能力概览">
        {/* existing story decorations and copy */}
      </section>
      {/* existing access section */}
    </main>
  </div>
)
```

Remove the former Galaxy instance from `.aurora-login-page__story` so only one WebGL context is created.

- [ ] **Step 2: Define the full-screen stacking and event layers**

Update the page and workspace rules:

```less
.aurora-login-page {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background: #071221;

  > .galaxy-background {
    position: fixed;
    z-index: 0;
    inset: 0;
  }

  &__workspace {
    position: relative;
    z-index: 1;
    display: grid;
    min-height: 100vh;
    grid-template-columns: minmax(0, 1.12fr) minmax(420px, 0.88fr);
    pointer-events: none;
  }
}
```

Keep the story layer pointer-transparent, remove its opaque background, and use only subtle legibility gradients. Set `.aurora-login-page__access` to transparent.

- [ ] **Step 3: Turn the login card into an interactive glass panel**

Apply a sub-0.9 alpha background, backdrop blur and pointer restoration:

```less
.aurora-login-page__card {
  pointer-events: auto;
  border: 1px solid rgba(255, 255, 255, 0.48);
  background: rgba(255, 255, 255, 0.76);
  box-shadow: 0 30px 90px rgba(2, 9, 20, 0.3), inset 0 1px rgba(255, 255, 255, 0.62);
  backdrop-filter: blur(24px) saturate(135%);
  -webkit-backdrop-filter: blur(24px) saturate(135%);
}
```

Keep form fields opaque enough for contrast. Make the security note readable on the dark background without turning the whole right column opaque.

- [ ] **Step 4: Preserve mobile behavior**

At `max-width: 820px`, continue hiding only the story content. Do not hide the root Galaxy. Keep the access section transparent and the card inside the existing responsive padding.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```bash
cd frontend
pnpm exec playwright test e2e/login-galaxy.spec.ts --project=chromium --workers=1
pnpm exec vitest run src/modules/auth/__tests__/auth-pages.test.tsx --maxWorkers=1
```

Expected: all focused Playwright and Vitest tests PASS.

### Task 3: Verify the production page and responsive result

**Files:**
- Verify: `frontend/src/modules/auth/pages/LoginPage.tsx`
- Verify: `frontend/src/modules/auth/pages/LoginPage.less`
- Verify: `frontend/e2e/login-galaxy.spec.ts`

- [ ] **Step 1: Run type and production build checks**

Run:

```bash
cd frontend
pnpm typecheck
pnpm build
```

Expected: both commands exit with code 0. Existing bundle-size, `config.js`, Lottie `eval`, or mixed dynamic-import warnings must be reported separately rather than presented as fixed.

- [ ] **Step 2: Inspect the desktop page in a real Chromium renderer**

Open `http://127.0.0.1:4312/#/login` at `1440 × 900` and verify:

- Galaxy continues behind both columns.
- The form card visibly reveals the moving star field without losing text contrast.
- The login controls remain clickable and focusable.
- Mouse movement repels stars outside the card.

- [ ] **Step 3: Inspect the mobile page**

Open the same route at `390 × 844` and verify:

- Galaxy covers the full viewport.
- The left story content is hidden.
- The glass card remains centered within the page padding.
- No horizontal scroll is introduced.

- [ ] **Step 4: Commit the implementation intentionally**

Stage only the files from this feature and commit:

```bash
git add \
  frontend/src/modules/auth/pages/LoginPage.tsx \
  frontend/src/modules/auth/pages/LoginPage.less \
  frontend/src/modules/auth/__tests__/auth-pages.test.tsx \
  frontend/e2e/login-galaxy.spec.ts \
  docs/superpowers/plans/2026-08-03-fullscreen-galaxy-login.md
git commit -m "feat: extend galaxy across login page"
```
