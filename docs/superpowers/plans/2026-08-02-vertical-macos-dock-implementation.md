# 竖向 macOS Dock 导航 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有固定三级放大的左侧导航改造成全高玻璃材质、彩色自有图标、连续距离放大与邻近让位的竖向 macOS Dock，同时保留路由、权限和键盘可访问性。

**Architecture:** `WorkspaceNavigation` 只编排权限、分组和共享指针坐标；`DockItem` 负责距离映射、spring 和交互状态；`WorkspaceDockIcon` 负责九套自有 SVG 图标；纯函数 `dock-motion.ts` 提供可测试的距离曲线和紧凑模式参数。静态材质与响应式规则保留在 `AppShell.less` 和工作区 Token 中，运行时变换由 Framer Motion 管理。

**Tech Stack:** React 19、TypeScript、React Router 7、Framer Motion 11、LESS、Vitest、Testing Library、Playwright。

---

## 文件结构

- Create: `frontend/src/components/AppShell/dock-motion.ts` — Dock 尺寸常量、连续距离映射和 reduced-motion 分支。
- Create: `frontend/src/components/AppShell/WorkspaceDockIcon.tsx` — 九个模块的本地 Squircle SVG 图标。
- Create: `frontend/src/components/AppShell/DockItem.tsx` — 单个导航项的 spring、测量、Tooltip、焦点与当前路由状态。
- Modify: `frontend/src/components/AppShell/WorkspaceNavigation.tsx` — 权限过滤、分组、共享 `mouseY` 与 Dock 容器事件。
- Modify: `frontend/src/components/AppShell/AppShell.less` — 玻璃轨道、分组、Tooltip、滚动与高/宽响应式。
- Modify: `frontend/src/styles/workspace-tokens.css` — Dock 材质、阴影、尺寸、提示气泡 Token。
- Modify: `frontend/src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx` — 分组、权限、当前状态和自有图标回归。
- Create: `frontend/src/components/AppShell/__tests__/dock-motion.test.ts` — 连续衰减、边界和 reduced-motion 单元测试。
- Create: `frontend/src/components/AppShell/__tests__/DockItem.test.tsx` — Tooltip、焦点、真实链接和当前状态组件测试。
- Create: `frontend/e2e/workspace-dock.spec.ts` — 720/600 高度可见性、悬浮放大和键盘访问浏览器测试。

### Task 1: 锁定 Dock 距离曲线

**Files:**
- Create: `frontend/src/components/AppShell/dock-motion.ts`
- Test: `frontend/src/components/AppShell/__tests__/dock-motion.test.ts`

- [ ] **Step 1: 写连续距离映射的失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { getDockMetrics, mapDockDistance } from '../dock-motion'

describe('dock motion model', () => {
  it('continuously decays from the hovered icon across two neighbours', () => {
    const values = [0, 46, 92, 138].map((distance) => mapDockDistance(distance, false))
    expect(values[0].size).toBe(76)
    expect(values[0].size).toBeGreaterThan(values[1].size)
    expect(values[1].size).toBeGreaterThan(values[2].size)
    expect(values[2].size).toBeGreaterThan(values[3].size)
    expect(values[3]).toEqual({ size: 46, displacement: 0 })
  })

  it('uses compact dimensions for short viewports', () => {
    expect(getDockMetrics(600)).toMatchObject({ baseSize: 40, itemSlot: 48 })
    expect(getDockMetrics(800)).toMatchObject({ baseSize: 46, itemSlot: 56 })
  })

  it('returns static dimensions when motion is reduced', () => {
    expect(mapDockDistance(0, true)).toEqual({ size: 46, displacement: 0 })
  })
})
```

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run: `cd frontend && pnpm vitest run src/components/AppShell/__tests__/dock-motion.test.ts`

Expected: FAIL，提示无法解析 `../dock-motion`。

- [ ] **Step 3: 实现纯函数与固定常量**

```ts
export interface DockMotionResult {
  size: number
  displacement: number
}

export interface DockMetrics {
  baseSize: number
  maxSize: number
  itemSlot: number
  influenceRadius: number
}

export const REGULAR_DOCK_METRICS: DockMetrics = {
  baseSize: 46,
  maxSize: 76,
  itemSlot: 56,
  influenceRadius: 138,
}

export const COMPACT_DOCK_METRICS: DockMetrics = {
  baseSize: 40,
  maxSize: 62,
  itemSlot: 48,
  influenceRadius: 120,
}

export function getDockMetrics(viewportHeight: number): DockMetrics {
  return viewportHeight < 720 ? COMPACT_DOCK_METRICS : REGULAR_DOCK_METRICS
}

export function mapDockDistance(
  distance: number,
  reduceMotion: boolean,
  metrics = REGULAR_DOCK_METRICS,
): DockMotionResult {
  if (reduceMotion) return { size: metrics.baseSize, displacement: 0 }
  const ratio = Math.max(0, 1 - Math.abs(distance) / metrics.influenceRadius)
  if (ratio === 0) return { size: metrics.baseSize, displacement: 0 }
  const eased = ratio * ratio * (3 - 2 * ratio)
  return {
    size: Math.round((metrics.baseSize + (metrics.maxSize - metrics.baseSize) * eased) * 100) / 100,
    displacement: Math.round((-Math.sign(distance) * 8 * eased) * 100) / 100,
  }
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `cd frontend && pnpm vitest run src/components/AppShell/__tests__/dock-motion.test.ts`

Expected: PASS，3 tests。

- [ ] **Step 5: 提交距离模型**

```bash
git add frontend/src/components/AppShell/dock-motion.ts frontend/src/components/AppShell/__tests__/dock-motion.test.ts
git commit -m "feat: add continuous dock motion model"
```

### Task 2: 创建自有彩色应用图标

**Files:**
- Create: `frontend/src/components/AppShell/WorkspaceDockIcon.tsx`
- Modify: `frontend/src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx`

- [ ] **Step 1: 把现有 Semi 图标断言改成九套项目图标断言**

```ts
it('renders project-owned dock icons instead of Semi navigation icons', () => {
  const { container } = renderNavigation(superAdmin)
  expect(container.querySelectorAll('[data-dock-icon]')).toHaveLength(9)
  expect(container.querySelectorAll('.semi-icon')).toHaveLength(0)
  expect(
    new Set(
      [...container.querySelectorAll('[data-dock-icon]')].map((node) =>
        node.getAttribute('data-dock-icon'),
      ),
    ).size,
  ).toBe(9)
})
```

- [ ] **Step 2: 运行测试确认旧图标实现失败**

Run: `cd frontend && pnpm vitest run src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx`

Expected: FAIL，找不到 `[data-dock-icon]`，仍存在 `.semi-icon`。

- [ ] **Step 3: 创建统一 Squircle SVG 图标组件**

```tsx
import type { NavigationIcon } from '@/router/routes'

interface WorkspaceDockIconProps {
  icon: NavigationIcon
}

const palettes: Record<NavigationIcon, readonly [string, string]> = {
  home: ['#5B8CFF', '#3155D9'],
  tasks: ['#7B61FF', '#5C3BD9'],
  projects: ['#24C8A5', '#0A8F78'],
  employees: ['#FF9F43', '#E56B24'],
  docs: ['#44A5FF', '#2563EB'],
  base: ['#A66BFF', '#7143D7'],
  calendar: ['#FF6577', '#D93652'],
  search: ['#5CC8FF', '#2876D8'],
  settings: ['#8A94A6', '#596273'],
}

export function WorkspaceDockIcon({ icon }: WorkspaceDockIconProps) {
  const [start, end] = palettes[icon]
  const gradientId = `dock-${icon}`
  const glyphs: Record<NavigationIcon, ReactNode> = {
    home: <><path d="M20 28h24v18H20z" /><path d="m17 29 15-13 15 13" /></>,
    tasks: <><path d="M19 20h5M19 32h5M19 44h5" /><path d="M29 20h17M29 32h17M29 44h17" /></>,
    projects: <path d="M15 23h14l4 5h16v20H15z" />,
    employees: <><circle cx="26" cy="27" r="7" /><circle cx="41" cy="29" r="5" /><path d="M15 47c2-9 20-9 22 0M36 45c2-6 12-6 14 0" /></>,
    docs: <><path d="M15 19c8-3 13 0 17 4v26c-4-4-9-6-17-3z" /><path d="M49 19c-8-3-13 0-17 4v26c4-4 9-6 17-3z" /></>,
    base: <><rect x="15" y="15" width="14" height="14" rx="3" /><rect x="35" y="15" width="14" height="14" rx="3" /><rect x="15" y="35" width="14" height="14" rx="3" /><rect x="35" y="35" width="14" height="14" rx="3" /></>,
    calendar: <><rect x="15" y="18" width="34" height="31" rx="5" /><path d="M15 28h34M23 14v8M41 14v8" /><path d="M24 36h5M35 36h5M24 43h5M35 43h5" /></>,
    search: <><circle cx="29" cy="29" r="13" /><path d="m39 39 11 11" /></>,
    settings: <><circle cx="32" cy="32" r="8" /><path d="M32 14v6M32 44v6M14 32h6M44 32h6M19 19l5 5M40 40l5 5M45 19l-5 5M24 40l-5 5" /></>,
  }
  return (
    <svg data-dock-icon={icon} viewBox="0 0 64 64" role="presentation" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="10" y1="6" x2="54" y2="58">
          <stop stopColor={start} />
          <stop offset="1" stopColor={end} />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="58" height="58" rx="15" fill={`url(#${gradientId})`} />
      <g fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        {glyphs[icon]}
      </g>
    </svg>
  )
}
```

文件顶部同时导入 `type ReactNode`。九个图形分别表示工作台窗口、清单、项目文件夹、员工头像组、打开的书、多维网格、日历页、放大镜和齿轮；不得用文字或 Emoji 代替图形。

- [ ] **Step 4: 运行图标与导航测试**

Run: `cd frontend && pnpm vitest run src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx`

Expected: PASS；普通用户 8 个图标，超级管理员 9 个图标，且无 Semi 图标。

- [ ] **Step 5: 提交自有图标**

```bash
git add frontend/src/components/AppShell/WorkspaceDockIcon.tsx frontend/src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx
git commit -m "feat: add workspace dock application icons"
```

### Task 3: 实现单个 Dock 项的连续 spring 交互

**Files:**
- Create: `frontend/src/components/AppShell/DockItem.tsx`
- Create: `frontend/src/components/AppShell/__tests__/DockItem.test.tsx`

- [ ] **Step 1: 写链接、Tooltip、当前状态的失败测试**

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { motionValue } from 'framer-motion'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DockItem } from '../DockItem'

const item = { key: 'projects', title: '项目', icon: 'projects' as const, path: '/spaces/projects' }

it('keeps link semantics and exposes a single custom tooltip', () => {
  render(
    <MemoryRouter>
      <DockItem item={item} active mouseY={motionValue(Number.POSITIVE_INFINITY)} />
    </MemoryRouter>,
  )
  const link = screen.getByRole('link', { name: '项目' })
  expect(link).toHaveAttribute('href', '/spaces/projects')
  expect(link).toHaveAttribute('aria-current', 'page')
  expect(link).not.toHaveAttribute('title')
  fireEvent.focus(link)
  expect(screen.getByRole('tooltip')).toHaveTextContent('项目')
})
```

- [ ] **Step 2: 运行测试确认组件不存在**

Run: `cd frontend && pnpm vitest run src/components/AppShell/__tests__/DockItem.test.tsx`

Expected: FAIL，无法解析 `../DockItem`。

- [ ] **Step 3: 用 MotionValue 和真实 NavLink 实现组件**

```tsx
export function DockItem({ item, active, mouseY }: DockItemProps) {
  const ref = useRef<HTMLAnchorElement>(null)
  const reduceMotion = useReducedMotion() ?? false
  const distance = useTransform(mouseY, (value) => {
    const rect = ref.current?.getBoundingClientRect()
    return rect ? value - (rect.top + rect.height / 2) : Number.POSITIVE_INFINITY
  })
  const sizeTarget = useTransform(distance, (value) => mapDockDistance(value, reduceMotion).size)
  const yTarget = useTransform(distance, (value) => mapDockDistance(value, reduceMotion).displacement)
  const size = useSpring(sizeTarget, { mass: 0.12, stiffness: 180, damping: 16 })
  const y = useSpring(yTarget, { mass: 0.12, stiffness: 180, damping: 16 })

  return (
    <motion.div className="workspace-dock__slot" style={{ height: size, y }} layout={!reduceMotion}>
      <NavLink ref={ref} to={item.path} aria-label={item.title} aria-current={active ? 'page' : undefined}>
        <motion.span className="workspace-dock__tile" style={{ width: size, height: size }} whileTap={{ scale: 0.94 }}>
          <WorkspaceDockIcon icon={item.icon} />
        </motion.span>
        <span role="tooltip" className="workspace-dock__label">{item.title}</span>
        {active && <span className="workspace-dock__dot" aria-hidden="true" />}
      </NavLink>
    </motion.div>
  )
}
```

Tooltip 默认视觉隐藏但保留 DOM，使用 `:hover` 与 `:focus-visible` 控制显示；组件不得添加原生 `title`。

- [ ] **Step 4: 运行组件测试和类型检查**

Run: `cd frontend && pnpm vitest run src/components/AppShell/__tests__/DockItem.test.tsx && pnpm typecheck`

Expected: PASS，TypeScript 0 errors。

- [ ] **Step 5: 提交 DockItem**

```bash
git add frontend/src/components/AppShell/DockItem.tsx frontend/src/components/AppShell/__tests__/DockItem.test.tsx
git commit -m "feat: add accessible animated dock item"
```

### Task 4: 重构导航编排、权限与分组

**Files:**
- Modify: `frontend/src/components/AppShell/WorkspaceNavigation.tsx`
- Modify: `frontend/src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx`

- [ ] **Step 1: 写分组和运行指示点的失败测试**

```tsx
it('groups core, content and tools without changing visible routes', () => {
  useAuthStore.setState({ user: superAdmin })
  const { container } = renderNavigation()
  expect(container.querySelectorAll('[data-dock-group]')).toHaveLength(3)
  expect(container.querySelector('[data-dock-group="core"]')).toHaveTextContent('工作台我的工作项目员工')
  expect(container.querySelector('[data-dock-group="content"]')).toHaveTextContent('文档与知识库多维表格日历')
  expect(container.querySelector('[data-dock-group="tools"]')).toHaveTextContent('搜索系统管理')
  expect(container.querySelectorAll('.workspace-dock__separator')).toHaveLength(1)
})
```

- [ ] **Step 2: 运行导航测试确认当前扁平列表失败**

Run: `cd frontend && pnpm vitest run src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx`

Expected: FAIL，缺少 `data-dock-group` 和分隔线。

- [ ] **Step 3: 使用共享 mouseY 和显式分组渲染 DockItem**

```tsx
const GROUP_KEYS = {
  core: new Set(['home', 'my-work', 'projects', 'employees']),
  content: new Set(['docs', 'base', 'calendar']),
  tools: new Set(['search', 'admin']),
} as const

export function WorkspaceNavigation({ items }: WorkspaceNavigationProps) {
  const mouseY = useMotionValue(Number.POSITIVE_INFINITY)
  const visibleItems = appendAdminWhenAllowed(items, user)
  const groups = groupNavigationItems(visibleItems)

  return (
    <nav
      className="workspace-dock"
      aria-label="主导航"
      onPointerMove={(event) => mouseY.set(event.clientY)}
      onPointerLeave={() => mouseY.set(Number.POSITIVE_INFINITY)}
    >
      <div className="workspace-dock__scroll" tabIndex={-1}>
        {groups.map((group, index) => (
          <Fragment key={group.key}>
            {index === 2 && <span className="workspace-dock__separator" aria-hidden="true" />}
            <div className="workspace-dock__group" data-dock-group={group.key}>
              {group.items.map((item) => (
                <DockItem key={item.key} item={item} active={isActivePath(item, pathname)} mouseY={mouseY} />
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </nav>
  )
}
```

保留现有 `ADMIN_PERMISSION_CODES`、`canAccessAdmin` 和 `isActivePath` 的行为；只移动渲染职责，不改变授权结果。

- [ ] **Step 4: 运行导航、AppShell 与可访问性测试**

Run: `cd frontend && pnpm vitest run src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx src/components/AppShell/__tests__/AppShell.test.tsx src/components/AppShell/__tests__/AppShellAccessibility.test.tsx`

Expected: PASS，路由数量、管理员入口和 landmark 均不回归。

- [ ] **Step 5: 提交导航编排**

```bash
git add frontend/src/components/AppShell/WorkspaceNavigation.tsx frontend/src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx
git commit -m "refactor: group workspace dock navigation"
```

### Task 5: 完成玻璃材质、响应式和无动画分支

**Files:**
- Modify: `frontend/src/components/AppShell/AppShell.less`
- Modify: `frontend/src/styles/workspace-tokens.css`
- Modify: `frontend/src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx`

- [ ] **Step 1: 添加样式契约失败测试**

```ts
it('does not use fixed sibling hover magnification or native title tooltips', () => {
  const styles = readFileSync(resolve(process.cwd(), 'src/components/AppShell/AppShell.less'), 'utf8')
  const source = readFileSync(resolve(process.cwd(), 'src/components/AppShell/WorkspaceNavigation.tsx'), 'utf8')
  expect(styles).not.toMatch(/:has\([^)]*:hover/)
  expect(styles).not.toMatch(/hover\s*\+\s*\.workspace-dock__item/)
  expect(styles).toContain('@media (max-height: 719px)')
  expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
  expect(source).not.toMatch(/title=\{item\.title\}/)
})
```

- [ ] **Step 2: 运行测试确认旧 CSS 失败**

Run: `cd frontend && pnpm vitest run src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx`

Expected: FAIL，检测到 `:has(...:hover)` 与缺少高度/reduced-motion 媒体查询。

- [ ] **Step 3: 替换 Dock 样式和 Token**

`workspace-tokens.css` 增加并在主题覆盖中保持同名 Token：

```css
--workspace-dock-width: 82px;
--workspace-dock-compact-width: 70px;
--workspace-dock-bg: rgba(247, 249, 252, 0.68);
--workspace-dock-border: rgba(255, 255, 255, 0.72);
--workspace-dock-shadow: 12px 0 34px rgba(31, 35, 41, 0.12);
--workspace-dock-tooltip-bg: rgba(31, 35, 41, 0.92);
```

`AppShell.less` 必须实现：

```less
.workspace-dock {
  position: relative;
  z-index: 10;
  width: var(--workspace-dock-width);
  height: 100dvh;
  flex: 0 0 var(--workspace-dock-width);
  overflow: visible;
  border-right: 1px solid var(--workspace-dock-border);
  background: var(--workspace-dock-bg);
  box-shadow: inset -1px 0 rgba(255, 255, 255, 0.45), var(--workspace-dock-shadow);
  backdrop-filter: blur(24px) saturate(180%);
}

.workspace-dock__scroll {
  height: 100%;
  overflow-x: visible;
  overflow-y: auto;
  scrollbar-width: none;
}

.workspace-dock__label {
  left: calc(100% + 12px);
  top: 50%;
  opacity: 0;
  transform: translate3d(-6px, -50%, 0) scale(0.96);
}

.workspace-dock__item:hover .workspace-dock__label,
.workspace-dock__item:focus-visible .workspace-dock__label {
  opacity: 1;
  transform: translate3d(0, -50%, 0) scale(1);
}

@media (max-height: 719px) {
  .workspace-dock__scroll { padding-block: 8px; }
  .workspace-dock__group { gap: 2px; }
}

@media (prefers-reduced-motion: reduce) {
  .workspace-dock *, .workspace-dock *::before, .workspace-dock *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

删除旧 `.workspace-dock__item:has(...)`、兄弟选择器三级放大、Semi 图标尺寸规则和厚重 active 描边。

- [ ] **Step 4: 运行样式契约、格式和类型验证**

Run: `cd frontend && pnpm vitest run src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx && pnpm eslint src/components/AppShell && pnpm prettier --check src/components/AppShell/AppShell.less src/styles/workspace-tokens.css && pnpm typecheck`

Expected: 测试通过、ESLint 0 errors、TypeScript 0 errors。

- [ ] **Step 5: 提交视觉与响应式样式**

```bash
git add frontend/src/components/AppShell/AppShell.less frontend/src/styles/workspace-tokens.css frontend/src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx
git commit -m "style: finish vertical glass workspace dock"
```

### Task 6: 浏览器边界验证与最终回归

**Files:**
- Create: `frontend/e2e/workspace-dock.spec.ts`

- [ ] **Step 1: 添加真实窗口几何和键盘测试**

```ts
import { expect, test } from '@playwright/test'

for (const viewport of [{ width: 1280, height: 720 }, { width: 1280, height: 600 }]) {
  test(`dock stays usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    const dock = page.getByRole('navigation', { name: '主导航' })
    const lastLink = dock.getByRole('link').last()
    await lastLink.scrollIntoViewIfNeeded()
    await expect(lastLink).toBeVisible()
    const dockBox = await dock.boundingBox()
    const lastBox = await lastLink.boundingBox()
    expect(dockBox).not.toBeNull()
    expect(lastBox).not.toBeNull()
    expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(viewport.height)
  })
}

test('hover creates a continuous magnification wave and keyboard shows tooltip', async ({ page }) => {
  await page.goto('/')
  const items = page.getByRole('navigation', { name: '主导航' }).getByRole('link')
  const target = items.nth(3)
  const neighbour = items.nth(2)
  const before = await target.boundingBox()
  await target.hover()
  await page.waitForTimeout(250)
  const after = await target.boundingBox()
  const neighbourAfter = await neighbour.boundingBox()
  expect(after!.width).toBeGreaterThan(before!.width * 1.4)
  expect(neighbourAfter!.width).toBeGreaterThan(46)
  await target.focus()
  await expect(page.getByRole('tooltip', { name: '员工' })).toBeVisible()
})
```

该 E2E 沿用现有 `smoke.spec.ts` 的本地测试模式，直接打开应用，不新增或复制管理员账号密码。

- [ ] **Step 2: 运行 Dock E2E**

Run: `cd frontend && pnpm playwright test e2e/workspace-dock.spec.ts`

Expected: PASS，两个窗口高度和悬浮/键盘场景全部通过。

- [ ] **Step 3: 运行前端完整验证**

Run: `cd frontend && pnpm lint && pnpm typecheck && pnpm typecheck:contracts && pnpm test && pnpm build`

Expected: 所有命令退出码 0；若存在历史 warning，单独记录但不得当作本次新增错误忽略。

- [ ] **Step 4: 检查变更边界和空白错误**

Run: `git diff --check && git status --short && git diff --stat`

Expected: `git diff --check` 无输出；Dock 文件外没有本任务新增改动。

- [ ] **Step 5: 提交浏览器验证**

```bash
git add frontend/e2e/workspace-dock.spec.ts
git commit -m "test: cover workspace dock browser behaviour"
```

## 最终验收清单

- [ ] 9 个模块均为项目自有彩色 SVG 图标。
- [ ] 距离放大连续影响上下两个邻居，并产生让位而非覆盖。
- [ ] 当前路由仅显示左侧小圆点与轻微提亮。
- [ ] Hover 与键盘 Focus 均显示唯一自定义 Tooltip。
- [ ] 普通员工不显示系统管理，超级管理员显示系统管理。
- [ ] 1280×600 下最后一个入口可滚动访问且不被裁切。
- [ ] reduced-motion 下无缩放、弹跳与位移。
- [ ] 所有现有路由、Header 和主内容页面行为保持不变。
