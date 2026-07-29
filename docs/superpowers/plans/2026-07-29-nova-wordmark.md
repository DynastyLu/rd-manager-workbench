# NOVA Sequential Wordmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the incomplete segmented NOVA drawing with a smooth, strictly sequential N → O → V → A SVG handwriting animation.

**Architecture:** Keep `NovaWordmark` as a focused presentational component, but model each letter as one complete SVG path with explicit duration and delay metadata. Use the existing Framer Motion dependency to animate `pathLength` without timers or per-frame React state; keep layout and reduced-motion fallback in the existing knowledge-page stylesheet.

**Tech Stack:** React, TypeScript, Framer Motion 11, inline SVG, Less, Vitest, Testing Library

---

### Task 1: Lock the sequential timing and complete glyph contract

**Files:**
- Modify: `frontend/src/modules/knowledge/__tests__/KnowledgeChatPanel.test.tsx`
- Modify: `frontend/src/modules/knowledge/components/NovaWordmark.tsx`

- [ ] **Step 1: Replace the old nine-stroke assertion with a failing four-letter contract**

In the empty-state test, assert that the component exposes four complete letter paths and serial timing metadata:

```tsx
const letters = Array.from(
  container.querySelectorAll<SVGPathElement>('.nova-wordmark__letter'),
);

expect(letters.map((letter) => letter.dataset.letter)).toEqual(['n', 'o', 'v', 'a']);
expect(letters).toHaveLength(4);

const timing = letters.map((letter) => ({
  delay: Number(letter.dataset.delay),
  duration: Number(letter.dataset.duration),
}));

for (let index = 1; index < timing.length; index += 1) {
  expect(timing[index].delay).toBeGreaterThanOrEqual(
    timing[index - 1].delay + timing[index - 1].duration,
  );
}

expect(letters[0]).toHaveAttribute('d', expect.stringContaining('L55 52 L55 13'));
expect(letters[3]).toHaveAttribute('d', expect.stringContaining('M190 38 L220 38'));
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run src/modules/knowledge/__tests__/KnowledgeChatPanel.test.tsx --reporter=dot
```

Expected: FAIL because the current component exposes nine `.nova-wordmark__stroke` paths and no per-letter timing metadata.

- [ ] **Step 3: Define the immutable letter configuration**

In `NovaWordmark.tsx`, export a readonly configuration:

```tsx
export const NOVA_LETTERS = [
  { id: 'n', d: 'M15 52 L15 13 L55 52 L55 13', delay: 0.18, duration: 1.06 },
  {
    id: 'o',
    d: 'M97 13 C81 13 72 21 72 33 S81 53 97 53 122 45 122 33 113 13 97 13 Z',
    delay: 1.38,
    duration: 0.92,
  },
  { id: 'v', d: 'M132 14 L153 52 L174 14', delay: 2.44, duration: 0.72 },
  {
    id: 'a',
    d: 'M182 52 L205 13 L228 52 M190 38 L220 38',
    delay: 3.3,
    duration: 1.02,
  },
] as const;
```

- [ ] **Step 4: Run the focused test only after implementing Task 2**

The test remains RED until the component renders the configuration with Motion paths.

### Task 2: Render four complete Framer Motion paths

**Files:**
- Modify: `frontend/src/modules/knowledge/components/NovaWordmark.tsx`
- Modify: `frontend/src/pages/KnowledgeHomePage.less`

- [ ] **Step 1: Replace segmented paths with Motion paths**

Import `motion` and `useReducedMotion` from `framer-motion`, generate a unique gradient ID with `useId`, and render:

```tsx
const reduceMotion = useReducedMotion();
const gradientId = `nova-wordmark-gradient-${useId().replace(/:/g, '')}`;

{NOVA_LETTERS.map((letter) => (
  <motion.path
    key={letter.id}
    className="nova-wordmark__letter"
    data-letter={letter.id}
    data-delay={letter.delay}
    data-duration={letter.duration}
    d={letter.d}
    initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
    animate={{ pathLength: 1, opacity: 1 }}
    transition={{
      pathLength: {
        delay: letter.delay,
        duration: letter.duration,
        ease: [0.46, 0.02, 0.23, 1],
      },
      opacity: { delay: letter.delay, duration: 0.08 },
    }}
  />
))}
```

The SVG uses `viewBox="0 0 244 66"` so the first and final strokes have safe padding.

- [ ] **Step 2: Replace animation CSS with stable visual styles**

Replace `.nova-wordmark__stroke` and its nine delay rules with:

```less
.nova-wordmark__letter {
  fill: none;
  stroke: var(--nova-wordmark-stroke);
  stroke-width: 3.1;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  will-change: stroke-dashoffset, opacity;
}
```

Set `--nova-wordmark-stroke` on the SVG to the generated `url(#...)` value through the component style prop. Remove the old `nova-wordmark-draw` keyframes. Keep the caption animation, changing its delay to `4.42s`.

- [ ] **Step 3: Implement the reduced-motion fallback**

When `useReducedMotion()` returns true, pass `initial={false}` so the complete wordmark is painted immediately. Keep the existing media query as a defensive CSS fallback, targeting `.nova-wordmark__letter`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
pnpm exec vitest run src/modules/knowledge/__tests__/KnowledgeChatPanel.test.tsx --reporter=dot
```

Expected: all tests in `KnowledgeChatPanel.test.tsx` pass.

### Task 3: Verify smooth production behavior

**Files:**
- Verify: `frontend/src/modules/knowledge/components/NovaWordmark.tsx`
- Verify: `frontend/src/modules/knowledge/__tests__/KnowledgeChatPanel.test.tsx`
- Verify: `frontend/src/pages/KnowledgeHomePage.less`

- [ ] **Step 1: Format and lint only the touched files**

Run:

```bash
pnpm exec prettier --write \
  src/modules/knowledge/components/NovaWordmark.tsx \
  src/modules/knowledge/__tests__/KnowledgeChatPanel.test.tsx \
  src/pages/KnowledgeHomePage.less
pnpm exec eslint \
  src/modules/knowledge/components/NovaWordmark.tsx \
  src/modules/knowledge/__tests__/KnowledgeChatPanel.test.tsx
```

Expected: zero lint errors.

- [ ] **Step 2: Run type and production verification**

Run:

```bash
pnpm typecheck
pnpm build
```

Expected: both commands exit with code 0.

- [ ] **Step 3: Inspect the new-chat state**

Open `http://127.0.0.1:4312/#/docs?tab=chat`, select “新建对话”, and verify:

1. N finishes before O appears.
2. O finishes before V appears.
3. V finishes before A appears.
4. N has both verticals and its diagonal.
5. A has both diagonals and the complete crossbar.
6. The wordmark does not loop or shift the composer.

- [ ] **Step 4: Commit only the NOVA implementation**

```bash
git add \
  frontend/src/modules/knowledge/components/NovaWordmark.tsx \
  frontend/src/modules/knowledge/__tests__/KnowledgeChatPanel.test.tsx \
  frontend/src/pages/KnowledgeHomePage.less \
  docs/superpowers/plans/2026-07-29-nova-wordmark.md
git commit -m "fix: smooth NOVA sequential wordmark animation"
```
