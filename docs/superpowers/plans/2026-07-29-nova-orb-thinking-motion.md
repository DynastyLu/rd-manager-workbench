# NOVA Orb Thinking Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the black AI badge and complex robot with a consistent blue NOVA orb, reliable blink/bounce/dot motion, and search-only panel glow.

**Architecture:** `NovaBot` owns the reusable orb anatomy and Framer Motion timelines. `KnowledgeSessionList` reuses the compact static orb for branding, while `KnowledgeThinkingProcess` determines whether retrieval is active and coordinates the active orb, dot animation, and glow state without timers or per-frame React state.

**Tech Stack:** React, TypeScript, Framer Motion 11, Less, Vitest, Testing Library

---

### Task 1: Lock the NOVA sidebar identity

**Files:**
- Modify: `frontend/src/modules/knowledge/__tests__/KnowledgeSessionList.test.tsx`
- Modify: `frontend/src/modules/knowledge/components/KnowledgeSessionList.tsx`

- [ ] **Step 1: Write a failing sidebar-brand test**

Replace the old header assertion with:

```tsx
expect(screen.getByLabelText('NOVA 知识助手')).toBeInTheDocument()
expect(screen.getByText('NOVA')).toBeInTheDocument()
expect(screen.getByText('知识助手')).toBeInTheDocument()
expect(document.querySelector('.knowledge-assistant__sessions-logo')).not.toHaveTextContent('AI')
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm exec vitest run src/modules/knowledge/__tests__/KnowledgeSessionList.test.tsx --reporter=dot
```

Expected: FAIL because the sidebar still renders the black `AI` square and “知识助手” as the only title.

- [ ] **Step 3: Render the compact NOVA orb**

Import `NovaBot` and replace the header markup with:

```tsx
<NovaBot compact label="NOVA 知识助手" />
<div className="knowledge-assistant__sessions-title">
  <strong>NOVA</strong>
  <small>知识助手</small>
</div>
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same Vitest command. Expected: all session-list tests pass.

### Task 2: Lock the orb anatomy and active state

**Files:**
- Modify: `frontend/src/modules/knowledge/__tests__/KnowledgeChatPanel.test.tsx`
- Modify: `frontend/src/modules/knowledge/components/NovaBot.tsx`

- [ ] **Step 1: Extend the existing thinking test**

Add assertions:

```tsx
expect(thinking.querySelector('.nova-bot__orb')).toBeInTheDocument()
expect(thinking.querySelectorAll('.nova-bot__eye')).toHaveLength(2)
expect(thinking.querySelector('.nova-bot__ground-shadow')).toBeInTheDocument()
expect(thinking.querySelector('.nova-bot__antenna')).not.toBeInTheDocument()
expect(thinking.querySelector('.nova-bot__smile')).not.toBeInTheDocument()
expect(thinking.querySelector('.nova-bot__halo')).not.toBeInTheDocument()
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm exec vitest run src/modules/knowledge/__tests__/KnowledgeChatPanel.test.tsx --reporter=dot
```

Expected: FAIL because the existing robot contains a halo, antenna, shell, and smile, and has no orb or ground shadow.

- [ ] **Step 3: Implement the Framer Motion orb**

Use `motion` and `useReducedMotion`. Render only:

```tsx
<span className={classes} role="img" aria-label={label}>
  <motion.span
    className="nova-bot__orb"
    animate={active && !reduceMotion ? {
      y: [0, 1, -12, 0, -4, 0],
      scaleX: [1.05, 1.1, 0.97, 1.08, 0.99, 1.03],
      scaleY: [0.95, 0.89, 1.05, 0.92, 1.02, 0.98],
    } : undefined}
    transition={{ duration: 1.38, repeat: Infinity, ease: 'easeInOut' }}
  >
    <span className="nova-bot__eyes">
      {[0, 1].map((eye) => (
        <motion.i
          key={eye}
          className="nova-bot__eye"
          animate={reduceMotion ? undefined : { scaleY: [1, 1, 0.12, 1, 1] }}
          transition={{
            duration: 4.8,
            repeat: Infinity,
            times: [0, 0.92, 0.955, 0.98, 1],
            delay: eye * 0.05,
          }}
        />
      ))}
    </span>
  </motion.span>
  {active ? <motion.span className="nova-bot__ground-shadow" /> : null}
</span>
```

Give the shadow the same 1.38-second repeated timeline using opacity and scaleX.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same chat-panel Vitest command. Expected: all chat-panel tests pass.

### Task 3: Animate dots and search-only glow

**Files:**
- Modify: `frontend/src/modules/knowledge/components/KnowledgeThinkingProcess.tsx`
- Modify: `frontend/src/modules/knowledge/__tests__/KnowledgeChatPanel.test.tsx`
- Modify: `frontend/src/pages/KnowledgeHomePage.less`

- [ ] **Step 1: Write a failing retrieval-glow assertion**

In the retrieval-started stream test, assert:

```tsx
const thinking = await screen.findByLabelText('AI 思考过程')
expect(thinking).toHaveClass('kb-ai-thinking--searching')
expect(thinking.querySelector('.kb-ai-thinking__search-glow')).toBeInTheDocument()
```

In the initial understanding test, assert that `kb-ai-thinking--searching` is absent.

- [ ] **Step 2: Run the test and verify RED**

Run the chat-panel Vitest command. Expected: FAIL because no search glow state exists.

- [ ] **Step 3: Add semantic search state**

Derive:

```tsx
const searching = displaySteps.some(
  (step) => step.icon === 'search' && step.state === 'active',
)
```

Apply the `kb-ai-thinking--searching` class and render one decorative
`kb-ai-thinking__search-glow` element only while `searching` is true.

- [ ] **Step 4: Replace static dot elements with Motion dots**

Render three `motion.i` nodes:

```tsx
{[0, 1, 2].map((dot) => (
  <motion.i
    key={dot}
    animate={reduceMotion ? undefined : {
      y: [2, -5, 2],
      opacity: [0.3, 1, 0.3],
      scale: [0.75, 1.15, 0.75],
    }}
    transition={{
      duration: 0.95,
      repeat: Infinity,
      delay: dot * 0.15,
      ease: 'easeInOut',
    }}
  />
))}
```

- [ ] **Step 5: Style the panel glow and remove obsolete robot anatomy**

Replace the old shell, halo, antenna, smile and eye-motion CSS with the orb gradient,
static eye placement and ground-shadow layout. Add search-only rotating gradient and
top sweep styles scoped under `.kb-ai-thinking--searching`.

- [ ] **Step 6: Run both focused suites**

Run:

```bash
pnpm exec vitest run \
  src/modules/knowledge/__tests__/KnowledgeSessionList.test.tsx \
  src/modules/knowledge/__tests__/KnowledgeChatPanel.test.tsx \
  --reporter=dot
```

Expected: both test files pass.

### Task 4: Verify production behavior

**Files:**
- Verify: `frontend/src/modules/knowledge/components/NovaBot.tsx`
- Verify: `frontend/src/modules/knowledge/components/KnowledgeSessionList.tsx`
- Verify: `frontend/src/modules/knowledge/components/KnowledgeThinkingProcess.tsx`
- Verify: `frontend/src/pages/KnowledgeHomePage.less`

- [ ] **Step 1: Format and lint touched files**

```bash
pnpm exec prettier --write \
  src/modules/knowledge/components/NovaBot.tsx \
  src/modules/knowledge/components/KnowledgeSessionList.tsx \
  src/modules/knowledge/components/KnowledgeThinkingProcess.tsx \
  src/modules/knowledge/__tests__/KnowledgeSessionList.test.tsx \
  src/modules/knowledge/__tests__/KnowledgeChatPanel.test.tsx \
  src/pages/KnowledgeHomePage.less
pnpm exec eslint \
  src/modules/knowledge/components/NovaBot.tsx \
  src/modules/knowledge/components/KnowledgeSessionList.tsx \
  src/modules/knowledge/components/KnowledgeThinkingProcess.tsx \
  src/modules/knowledge/__tests__/KnowledgeSessionList.test.tsx \
  src/modules/knowledge/__tests__/KnowledgeChatPanel.test.tsx
```

Expected: zero lint errors.

- [ ] **Step 2: Run static and production checks**

```bash
pnpm typecheck
pnpm build
```

Expected: both commands exit with code 0.

- [ ] **Step 3: Inspect the live page**

Verify:

1. The sidebar shows the orb, NOVA, and “知识助手”.
2. The orb has no antenna, smile, or outer ring.
3. During thinking the orb bounces with squash/stretch and a synchronized shadow.
4. Eyes stay in place and blink approximately once per 4.8 seconds.
5. All three dots visibly bounce in sequence.
6. Search glow appears only while retrieval is active.
