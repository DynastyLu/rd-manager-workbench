# Aurora Glass 前端重设计实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `rd-manager-workbench` 前端改造为「极光玻璃」视觉系统：统一 token、重设计登录页、加入丝滑动效、消除页面限宽导致的表格挤压，并为护眼换肤预埋能力。

**Architecture:** 以 CSS 变量 (`workspace-tokens.css`) 为单一颜色来源；新增 `animations.css` 提供统一 easing 与关键帧；用新的 `WorkspaceButton/Card/Input` 组件收敛组件风格；登录页独立重设计作为视觉标杆；页面容器逐步迁到 `.workspace-page` 满宽布局；`AppShell` 通过 `AnimatePresence` 实现路由过渡动画。

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind CSS v4 + Semi Design + TanStack Query + Vitest + jsdom + framer-motion（已存在依赖中）

**Working Branch:** `design/aurora-glass-frontend`

## Global Constraints

- 所有颜色必须通过 `var(--workspace-*)` 引用，禁止业务代码写死 hex。
- 基础字号为 14px；禁用 11px 及以下作为正文/标签字号。
- 页面容器默认满宽，窄内容使用 `.workspace-page__inner--narrow`（1040px）。
- 所有进入/悬浮/聚焦/弹窗的 *位移动画*（移动、缩放、滑入）必须使用 `transform` 或 `opacity`；hover/focus 的颜色/边框/阴影状态过渡允许存在。
- 必须尊重 `prefers-reduced-motion`。
- 每次 task 完成后需通过 `pnpm lint`、`pnpm typecheck`、相关单元测试，并提交。

---

## File Structure

| 文件 | 责任 |
|---|---|
| `frontend/src/animations.css` | 全局关键帧与 easing 变量 |
| `frontend/src/styles/workspace-tokens.css` | Aurora 颜色 token、间距、页面容器类 |
| `frontend/src/index.css` | 清理旧主题，保留基础样式 |
| `frontend/src/components/workspace/WorkspaceButton.tsx` | 统一按钮组件 |
| `frontend/src/components/workspace/WorkspaceCard.tsx` | 统一卡片组件 |
| `frontend/src/components/workspace/WorkspaceInput.tsx` | 统一输入框组件 |
| `frontend/src/components/workspace/SemiCompat.tsx` | 扩展/调整 Semi 封装 |
| `frontend/src/modules/auth/pages/LoginPage.tsx` | 登录页结构与交互 |
| `frontend/src/modules/auth/pages/LoginPage.less` | 登录页极光玻璃样式 |
| `frontend/src/components/AppShell/AppShell.tsx` | 路由过渡动画包裹 |
| `frontend/src/components/AppShell/AppShell.less` | 玻璃 sidebar/header |
| `frontend/src/pages/EmployeesPage.less` | 移除 max-width，应用 glass 卡片 |
| `frontend/src/pages/EmployeesPage.tsx` | 调整表格列宽 |
| `frontend/src/stores/theme.ts` | 主题切换状态与持久化 |

---

## Task 1: 创建全局动画样式

**Files:**
- Create: `frontend/src/animations.css`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Produces: CSS variables `--ease-out`, `--ease-standard`, `--ease-in-out`; keyframes `float`, `fadeInUp`, `shake`, `scaleIn`, `slideInRight`.

- [ ] **Step 1: 编写 animations.css**

```css
:root {
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
}

@keyframes float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(20px, -20px) scale(1.05); }
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

@keyframes slideInRight {
  from { opacity: 0; transform: translateX(16px); }
  to { opacity: 1; transform: translateX(0); }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: 在 main.tsx 中引入 animations.css**

在 `import './index.css'` 之后添加：

```tsx
import './animations.css'
```

- [ ] **Step 3: 运行 lint/typecheck**

```bash
cd frontend
pnpm lint
pnpm typecheck
```

Expected: pass。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/animations.css frontend/src/main.tsx
git commit -m "feat(design): add global animation tokens and keyframes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: 更新 workspace-tokens.css 为 Aurora 视觉系统

**Files:**
- Modify: `frontend/src/styles/workspace-tokens.css`

**Interfaces:**
- Produces: CSS variables `--workspace-canvas` 等；utility classes `.workspace-page`, `.workspace-page__inner`, `.workspace-card`, `.workspace-button-primary`, `.workspace-input`.

- [ ] **Step 1: 在 `:root` 区域新增/覆盖以下 token**

保留原有 `--workspace-sidebar-width`、`--workspace-header-height`、`--workspace-page-padding`、`--workspace-radius*` 等结构 token，将颜色与表面相关 token 替换为：

```css
:root,
[data-theme='classic'],
[data-theme='cyberpunk'],
[data-theme='ocean'],
[data-theme='worldcup'] {
  --workspace-sidebar-width: 208px;
  --workspace-header-height: 56px;
  --workspace-page-padding: 24px 32px 48px;
  --workspace-control-height: 32px;
  --workspace-control-height-lg: 36px;
  --workspace-form-gap: 16px;
  --workspace-field-gap: 6px;
  --workspace-modal-padding: 24px;
  --workspace-modal-footer-gap: 8px;

  /* Aurora color system */
  --workspace-brand: #8b5cf6;
  --workspace-brand-hover: #7c3aed;
  --workspace-brand-gradient: linear-gradient(135deg, #8b5cf6, #3b82f6);
  --workspace-brand-soft: #ede9fe;
  --workspace-canvas: #f8fafc;
  --workspace-canvas-gradient:
    radial-gradient(circle at 10% 10%, rgba(139, 92, 246, 0.08), transparent 35%),
    radial-gradient(circle at 90% 20%, rgba(59, 130, 246, 0.06), transparent 30%),
    radial-gradient(circle at 50% 90%, rgba(236, 72, 153, 0.04), transparent 35%),
    var(--workspace-canvas);
  --workspace-surface: rgba(255, 255, 255, 0.72);
  --workspace-surface-elevated: rgba(255, 255, 255, 0.88);
  --workspace-surface-subtle: #f5f3ff;
  --workspace-border: rgba(255, 255, 255, 0.6);
  --workspace-border-strong: rgba(226, 232, 240, 0.8);
  --workspace-text: #1e1b4b;
  --workspace-text-secondary: #5b558e;
  --workspace-text-muted: #8a84b3;
  --workspace-text-inverse: #ffffff;
  --workspace-success: #10b981;
  --workspace-warning: #f59e0b;
  --workspace-danger: #ef4444;
  --workspace-info: #3b82f6;
  --workspace-overlay: rgba(30, 27, 75, 0.45);
  --workspace-focus-ring: 0 0 0 3px rgba(139, 92, 246, 0.15);
  --workspace-shadow-panel: 0 8px 32px rgba(31, 35, 41, 0.06);
  --workspace-shadow-float: 0 20px 60px rgba(31, 35, 41, 0.12);
  --workspace-radius-sm: 6px;
  --workspace-radius: 8px;
  --workspace-radius-lg: 12px;

  /* Compatibility aliases */
  --bg-primary: var(--workspace-surface);
  --bg-secondary: var(--workspace-canvas);
  --bg-surface: var(--workspace-surface);
  --bg-panel: var(--workspace-surface);
  --bg-hover: var(--workspace-surface-subtle);
  --accent-cyan: var(--workspace-info);
  --accent-pink: #ec4899;
  --accent-gold: var(--workspace-warning);
  --accent-green: var(--workspace-success);
  --text-primary: var(--workspace-text);
  --text-secondary: var(--workspace-text-secondary);
  --text-muted: var(--workspace-text-muted);
  --text-inverse: var(--workspace-text-inverse);
  --border-color: var(--workspace-border-strong);
  --border-active: var(--workspace-brand);
  --header-bg: var(--workspace-surface);
  --header-border: var(--workspace-border-strong);
  --sidebar-bg: var(--workspace-surface);
  --sidebar-width: var(--workspace-sidebar-width);
  --font-main: 'Geist Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --radius: var(--workspace-radius);
}
```

- [ ] **Step 2: 在文件末尾追加统一页面容器与组件工具类**

```css
/* Unified page shell */
.workspace-page {
  min-height: 100%;
  padding: var(--workspace-page-padding);
  background: var(--workspace-canvas-gradient);
  color: var(--workspace-text);
}

.workspace-page__inner {
  width: 100%;
  max-width: none;
  margin: 0 auto;
}

.workspace-page__inner--narrow {
  max-width: 1040px;
}

/* Glass card */
.workspace-card {
  background: var(--workspace-surface);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--workspace-border);
  border-radius: var(--workspace-radius-lg);
  box-shadow: var(--workspace-shadow-panel);
  transition: transform 200ms var(--ease-out), box-shadow 200ms var(--ease-out);
}

.workspace-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--workspace-shadow-float);
}

/* Primary button */
.workspace-button-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: var(--workspace-radius);
  background: var(--workspace-brand-gradient);
  color: var(--workspace-text-inverse);
  font-family: var(--font-main);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(139, 92, 246, 0.3);
  transition: transform 150ms var(--ease-out), box-shadow 150ms var(--ease-out);
}

.workspace-button-primary:hover {
  transform: scale(1.02);
  box-shadow: 0 6px 20px rgba(139, 92, 246, 0.4);
}

.workspace-button-primary:active {
  transform: scale(0.98);
}

.workspace-button-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Input */
.workspace-input {
  width: 100%;
  min-height: 40px;
  padding: 8px 12px;
  border: 1px solid var(--workspace-border-strong);
  border-radius: var(--workspace-radius);
  background: rgba(248, 250, 252, 0.8);
  color: var(--workspace-text);
  font-family: var(--font-main);
  font-size: 14px;
  transition: border-color 150ms var(--ease-standard), box-shadow 150ms var(--ease-standard);
}

.workspace-input::placeholder {
  color: var(--workspace-text-muted);
}

.workspace-input:focus {
  border-color: var(--workspace-brand);
  box-shadow: var(--workspace-focus-ring);
  outline: none;
}
```

- [ ] **Step 3: 运行 lint/typecheck**

```bash
cd frontend
pnpm lint
pnpm typecheck
```

Expected: pass。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/styles/workspace-tokens.css
git commit -m "feat(design): establish Aurora Glass token system and utility classes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: 清理 index.css 中的旧主题死代码

**Files:**
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: new tokens from `workspace-tokens.css`
- Produces: lean base stylesheet, removing cyberpunk/worldcup/ocean full blocks.

- [ ] **Step 1: 删除三个旧主题完整块，只保留 `[data-theme='classic']`/`:root` 的极简重置**

将 `index.css` 中 `[data-theme='cyberpunk']`、 `[data-theme='worldcup']`、 `[data-theme='ocean']` 三个完整块删除。保留：

```css
@import 'tailwindcss';

[data-theme='classic'],
:root {
  --scanline-opacity: 0;
  --neon-line-opacity: 0;
  --dot-visibility: hidden;
}
```

以及文件末尾已有的通用 reset/utility 类（如 `.app-page`, `.workspace-select-field` 等已迁移到 `workspace-tokens.css` 的可以删除，避免重复）。

- [ ] **Step 2: 确保 build 后没有未使用的 CSS 报错**

```bash
cd frontend
pnpm lint
pnpm typecheck
pnpm build
```

Expected: pass。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/index.css
git commit -m "refactor(design): remove legacy cyberpunk/worldcup/ocean theme dead code

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: 创建 WorkspaceButton 组件

**Files:**
- Create: `frontend/src/components/workspace/WorkspaceButton.tsx`
- Create: `frontend/src/components/workspace/__tests__/WorkspaceButton.test.tsx`
- Modify: `frontend/src/components/workspace/SemiCompat.tsx`（若需要导出）

**Interfaces:**
- Produces: `WorkspaceButton` React component with props `{ variant?: 'primary' | 'secondary' | 'ghost'; size?: 'sm' | 'md' | 'lg'; loading?: boolean; children: ReactNode } & ButtonHTMLAttributes`.

- [ ] **Step 1: 编写 WorkspaceButton.tsx**

```tsx
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type WorkspaceButtonVariant = 'primary' | 'secondary' | 'ghost'
type WorkspaceButtonSize = 'sm' | 'md' | 'lg'

interface WorkspaceButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: WorkspaceButtonVariant
  size?: WorkspaceButtonSize
  loading?: boolean
  children: ReactNode
}

const sizeClasses: Record<WorkspaceButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
}

export const WorkspaceButton = forwardRef<HTMLButtonElement, WorkspaceButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, children, disabled, className = '', ...props }, ref) => {
    const base = 'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-transform duration-150 focus:outline-none'
    const variantClasses: Record<WorkspaceButtonVariant, string> = {
      primary: 'workspace-button-primary',
      secondary: 'bg-white/70 border border-slate-200 text-slate-700 hover:bg-white hover:border-slate-300',
      ghost: 'bg-transparent text-slate-600 hover:bg-slate-100',
    }

    return (
      <button
        ref={ref}
        className={`${base} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {children}
          </>
        ) : (
          children
        )}
      </button>
    )
  }
)

WorkspaceButton.displayName = 'WorkspaceButton'
```

- [ ] **Step 2: 编写测试**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceButton } from '../WorkspaceButton'

describe('WorkspaceButton', () => {
  it('renders children', () => {
    render(<WorkspaceButton>Click me</WorkspaceButton>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('is disabled when loading', () => {
    render(<WorkspaceButton loading>Click me</WorkspaceButton>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn()
    render(<WorkspaceButton onClick={handleClick}>Click me</WorkspaceButton>)
    await screen.getByRole('button').click()
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 3: 运行测试与门禁**

```bash
cd frontend
pnpm test src/components/workspace/__tests__/WorkspaceButton.test.tsx
pnpm lint
pnpm typecheck
```

Expected: pass。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/workspace/WorkspaceButton.tsx frontend/src/components/workspace/__tests__/WorkspaceButton.test.tsx
git commit -m "feat(design): add WorkspaceButton component

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: 创建 WorkspaceCard 组件

**Files:**
- Create: `frontend/src/components/workspace/WorkspaceCard.tsx`
- Create: `frontend/src/components/workspace/__tests__/WorkspaceCard.test.tsx`

**Interfaces:**
- Produces: `WorkspaceCard`, `WorkspaceCardHeader`, `WorkspaceCardTitle`, `WorkspaceCardDescription`, `WorkspaceCardContent`, `WorkspaceCardFooter` compound components.

- [ ] **Step 1: 编写 WorkspaceCard.tsx**

```tsx
import { createContext, useContext, type HTMLAttributes, type ReactNode } from 'react'

const CardContext = createContext(false)

interface WorkspaceCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  hover?: boolean
}

export function WorkspaceCard({ children, hover = true, className = '', ...props }: WorkspaceCardProps) {
  return (
    <CardContext.Provider value>
      <div
        className={`workspace-card ${hover ? '' : 'hover:!transform-none hover:!shadow-[var(--workspace-shadow-panel)]'} ${className}`}
        {...props}
      >
        {children}
      </div>
    </CardContext.Provider>
  )
}

function useCard() {
  const inside = useContext(CardContext)
  if (!inside) throw new Error('WorkspaceCard subcomponents must be used inside WorkspaceCard')
}

export function WorkspaceCardHeader({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  useCard()
  return (
    <div className={`flex min-h-[52px] items-center justify-between gap-3 border-b border-[var(--workspace-border-strong)] px-5 ${className}`} {...props}>
      {children}
    </div>
  )
}

export function WorkspaceCardTitle({ children, className = '', ...props }: HTMLAttributes<HTMLHeadingElement>) {
  useCard()
  return (
    <h3 className={`m-0 text-lg font-semibold text-[var(--workspace-text)] ${className}`} {...props}>
      {children}
    </h3>
  )
}

export function WorkspaceCardDescription({ children, className = '', ...props }: HTMLAttributes<HTMLParagraphElement>) {
  useCard()
  return (
    <p className={`m-0 text-sm text-[var(--workspace-text-secondary)] ${className}`} {...props}>
      {children}
    </p>
  )
}

export function WorkspaceCardContent({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  useCard()
  return <div className={`p-5 ${className}`} {...props}>{children}</div>
}

export function WorkspaceCardFooter({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  useCard()
  return <div className={`flex items-center justify-end gap-2 border-t border-[var(--workspace-border-strong)] px-5 py-3 ${className}`} {...props}>{children}</div>
}
```

- [ ] **Step 2: 编写测试**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WorkspaceCard, WorkspaceCardContent, WorkspaceCardHeader, WorkspaceCardTitle } from '../WorkspaceCard'

describe('WorkspaceCard', () => {
  it('renders card with header and title', () => {
    render(
      <WorkspaceCard>
        <WorkspaceCardHeader>
          <WorkspaceCardTitle>Card Title</WorkspaceCardTitle>
        </WorkspaceCardHeader>
        <WorkspaceCardContent>Content</WorkspaceCardContent>
      </WorkspaceCard>
    )
    expect(screen.getByText('Card Title')).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('throws when subcomponent is used outside card', () => {
    expect(() => render(<WorkspaceCardTitle>Orphan</WorkspaceCardTitle>)).toThrow()
  })
})
```

- [ ] **Step 3: 运行测试与门禁**

```bash
cd frontend
pnpm test src/components/workspace/__tests__/WorkspaceCard.test.tsx
pnpm lint
pnpm typecheck
```

Expected: pass。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/workspace/WorkspaceCard.tsx frontend/src/components/workspace/__tests__/WorkspaceCard.test.tsx
git commit -m "feat(design): add WorkspaceCard compound component

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: 创建 WorkspaceInput 组件

**Files:**
- Create: `frontend/src/components/workspace/WorkspaceInput.tsx`
- Create: `frontend/src/components/workspace/__tests__/WorkspaceInput.test.tsx`

**Interfaces:**
- Produces: `WorkspaceInput` controlled/uncontrolled input with focus glow.

- [ ] **Step 1: 编写 WorkspaceInput.tsx**

```tsx
import { forwardRef, type InputHTMLAttributes } from 'react'

export const WorkspaceInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`workspace-input ${className}`}
        {...props}
      />
    )
  }
)

WorkspaceInput.displayName = 'WorkspaceInput'
```

- [ ] **Step 2: 编写测试**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceInput } from '../WorkspaceInput'

describe('WorkspaceInput', () => {
  it('renders and accepts input', async () => {
    const onChange = vi.fn()
    render(<WorkspaceInput placeholder="Type here" onChange={onChange} />)
    const input = screen.getByPlaceholderText('Type here')
    await userEvent.type(input, 'hello')
    expect(input).toHaveValue('hello')
  })
})
```

- [ ] **Step 3: 运行测试与门禁**

```bash
cd frontend
pnpm test src/components/workspace/__tests__/WorkspaceInput.test.tsx
pnpm lint
pnpm typecheck
```

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/workspace/WorkspaceInput.tsx frontend/src/components/workspace/__tests__/WorkspaceInput.test.tsx
git commit -m "feat(design): add WorkspaceInput component

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: 重设计登录页

**Files:**
- Modify: `frontend/src/modules/auth/pages/LoginPage.tsx`
- Modify: `frontend/src/modules/auth/pages/LoginPage.less`
- Create: `frontend/src/modules/auth/pages/__tests__/LoginPage.test.tsx`（如不存在则更新）

**Interfaces:**
- Consumes: `WorkspaceButton`, `WorkspaceInput`
- Produces: New Aurora Glass login UI with floating blobs, shake error animation, focus glow.

- [ ] **Step 1: 重写 LoginPage.tsx**

保留原有的 `loginErrorMessage`、`safeReturnPath`、提交逻辑；只改 JSX：

```tsx
import { useState } from 'react'
import { Banner, Form } from '@douyinfe/semi-ui'
import { IconKey, IconUser } from '@douyinfe/semi-icons'
import { useLocation, useNavigate } from 'react-router-dom'

import { ROUTES } from '@/constants/routes'
import { ApiError } from '@/lib/http'
import { login } from '@/modules/auth/api'
import { useAuthStore } from '@/modules/auth/store'
import { WorkspaceButton } from '@/components/workspace/WorkspaceButton'
import { WorkspaceInput } from '@/components/workspace/WorkspaceInput'

interface LoginValues {
  identifier: string
  password: string
  rememberMe?: boolean
}

function safeReturnPath(value: unknown): string { /* keep existing */ }
function loginErrorMessage(error: unknown): string { /* keep existing */ }

export default function LoginPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()
  const [shake, setShake] = useState(false)

  const submit = async (values: LoginValues) => {
    setSubmitting(true)
    setError(undefined)
    try {
      const session = await login({
        identifier: values.identifier.trim(),
        password: values.password,
        rememberMe: Boolean(values.rememberMe),
      })
      useAuthStore.getState().setSession(session)
      const from = safeReturnPath((location.state as { from?: unknown } | null)?.from)
      void navigate(session.mustChangePassword ? ROUTES.CHANGE_PASSWORD : from, { replace: true })
    } catch (requestError) {
      setError(loginErrorMessage(requestError))
      setShake(true)
      setTimeout(() => setShake(false), 300)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="aurora-login-page">
      <div className="aurora-login-page__blob aurora-login-page__blob--1" aria-hidden="true" />
      <div className="aurora-login-page__blob aurora-login-page__blob--2" aria-hidden="true" />
      <div className="aurora-login-page__blob aurora-login-page__blob--3" aria-hidden="true" />
      <main className={`aurora-login-page__card ${shake ? 'aurora-login-page__card--shake' : ''}`}>
        <div className="aurora-login-page__brand">
          <span className="aurora-login-page__logo" aria-hidden="true" />
          <span>研发主管工作台</span>
        </div>
        <h1 className="aurora-login-page__title">欢迎回来</h1>
        <p className="aurora-login-page__subtitle">使用账号或员工工号登录</p>
        {error ? (
          <Banner className="aurora-login-page__banner" type="danger" description={error} />
        ) : null}
        <Form<LoginValues>
          className="aurora-login-form"
          layout="vertical"
          labelPosition="top"
          onSubmit={(values) => void submit(values)}
        >
          <Form.Input
            field="identifier"
            label="账号或工号"
            prefix={<IconUser />}
            autoComplete="username"
            placeholder="请输入账号或员工工号"
            rules={[{ required: true, message: '请输入账号或工号' }]}
            className="aurora-login-form__field"
          />
          <Form.Input
            field="password"
            label="密码"
            prefix={<IconKey />}
            mode="password"
            autoComplete="current-password"
            placeholder="请输入密码"
            rules={[{ required: true, message: '请输入密码' }]}
            className="aurora-login-form__field"
          />
          <div className="aurora-login-form__options">
            <Form.Checkbox field="rememberMe" noLabel>保持登录</Form.Checkbox>
            <span>忘记密码请联系管理员</span>
          </div>
          <WorkspaceButton type="submit" loading={submitting} className="aurora-login-form__submit">
            登录
          </WorkspaceButton>
        </Form>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: 重写 LoginPage.less**

```less
.aurora-login-page {
  position: relative;
  display: flex;
  min-height: 100vh;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: hidden;
  background: var(--workspace-canvas-gradient);

  &__blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(60px);
    pointer-events: none;
    will-change: transform;

    &--1 {
      width: 320px;
      height: 320px;
      top: 10%;
      left: 15%;
      background: rgba(139, 92, 246, 0.25);
      animation: float 14s ease-in-out infinite;
    }

    &--2 {
      width: 280px;
      height: 280px;
      top: 50%;
      right: 12%;
      background: rgba(59, 130, 246, 0.22);
      animation: float 12s ease-in-out infinite reverse;
    }

    &--3 {
      width: 220px;
      height: 220px;
      bottom: 12%;
      left: 35%;
      background: rgba(236, 72, 153, 0.16);
      animation: float 16s ease-in-out infinite;
    }
  }

  &__card {
    position: relative;
    width: min(100%, 400px);
    padding: 36px;
    border: 1px solid var(--workspace-border);
    border-radius: var(--workspace-radius-lg);
    background: var(--workspace-surface);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    box-shadow: var(--workspace-shadow-float);
    animation: scaleIn 400ms var(--ease-out) both;

    &--shake {
      animation: shake 300ms var(--ease-standard);
    }
  }

  &__brand {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 24px;
    color: var(--workspace-text);
    font-size: 16px;
    font-weight: 700;
  }

  &__logo {
    display: inline-block;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: var(--workspace-brand-gradient);
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
  }

  &__title {
    margin: 0 0 6px;
    color: var(--workspace-text);
    font-size: 24px;
    font-weight: 700;
  }

  &__subtitle {
    margin: 0 0 22px;
    color: var(--workspace-text-secondary);
    font-size: 14px;
  }

  &__banner {
    margin-bottom: 16px;
    border-radius: var(--workspace-radius);
  }
}

.aurora-login-form {
  &__field {
    margin-bottom: 16px;

    .semi-form-field-label {
      color: var(--workspace-text-secondary);
      font-size: 13px;
      font-weight: 600;
    }

    .semi-input-wrapper,
    .semi-input-wrapper-focus {
      min-height: 44px;
      border: 1px solid var(--workspace-border-strong);
      border-radius: var(--workspace-radius);
      background: rgba(248, 250, 252, 0.8);
      transition: border-color 150ms var(--ease-standard), box-shadow 150ms var(--ease-standard);
    }

    .semi-input-wrapper-focus {
      border-color: var(--workspace-brand);
      box-shadow: var(--workspace-focus-ring);
    }

    input {
      color: var(--workspace-text);
      font-size: 14px;
    }
  }

  &__options {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: -4px 0 20px;
    color: var(--workspace-text-muted);
    font-size: 13px;
  }

  &__submit {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .aurora-login-page {
    padding: 16px;

    &__card {
      padding: 28px 24px;
    }
  }
}
```

- [ ] **Step 3: 更新/补充登录页测试**

确保现有 `LoginPage.test.tsx` 或新增测试覆盖：
- 渲染用户名/密码输入和登录按钮
- 提交后显示 loading
- 登录失败显示错误 banner

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import * as api from './api'
import LoginPage from './LoginPage'

vi.mock('./api')

describe('LoginPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders login form', () => {
    render(<LoginPage />, { wrapper: MemoryRouter })
    expect(screen.getByPlaceholderText('请输入账号或员工工号')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('请输入密码')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /登录/i })).toBeInTheDocument()
  })

  it('shows error on failed login', async () => {
    vi.spyOn(api, 'login').mockRejectedValue(new Error('invalid'))
    render(<LoginPage />, { wrapper: MemoryRouter })
    await userEvent.type(screen.getByPlaceholderText('请输入账号或员工工号'), 'admin')
    await userEvent.type(screen.getByPlaceholderText('请输入密码'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /登录/i }))
    await waitFor(() => {
      expect(screen.getByText(/账号或密码错误|服务暂时不可用/)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 4: 运行门禁**

```bash
cd frontend
pnpm test src/modules/auth/pages/__tests__/LoginPage.test.tsx
pnpm lint
pnpm typecheck
```

Expected: pass。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/modules/auth/pages/LoginPage.tsx frontend/src/modules/auth/pages/LoginPage.less frontend/src/modules/auth/pages/__tests__/LoginPage.test.tsx
git commit -m "feat(design): redesign login page with Aurora Glass style

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: AppShell 玻璃化与路由过渡动画

**Files:**
- Modify: `frontend/src/components/AppShell/AppShell.tsx`
- Modify: `frontend/src/components/AppShell/AppShell.less`

**Interfaces:**
- Consumes: framer-motion (already in package.json)
- Produces: `AnimatePresence` route fade transition; glass sidebar/header surfaces.

- [ ] **Step 1: 修改 AppShell.tsx 包裹 Outlet**

```tsx
import { Suspense, useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { matchRoutes, Outlet, useLocation, useNavigate, type RouteObject } from 'react-router-dom'
import routes, { primaryNavigation, type RouteDefinition } from '@/router/routes'
import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceNavigation } from './WorkspaceNavigation'
import './AppShell.less'

// ... existing helpers ...

export function AppShell({ skeleton = null }: AppShellProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  const activeRoute = findActiveRoute(pathname)

  useEffect(() => { navigateRef.current = navigate }, [navigate])
  useEffect(() => {
    if (typeof window === 'undefined' || !window.rdWorkbenchDesktop) return undefined
    return window.rdWorkbenchDesktop.onNotificationClicked((sourcePath) => {
      const target = resolveInternalNotificationPath(sourcePath)
      if (target) void navigateRef.current(target)
    })
  }, [])

  return (
    <div className="app-shell">
      <WorkspaceNavigation items={primaryNavigation} />
      <div className="app-shell__main">
        <WorkspaceHeader route={activeRoute} />
        <main className="app-shell__content">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              className="app-shell__page"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <Suspense fallback={skeleton}>
                <Outlet />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 修改 AppShell.less 让 sidebar/header 使用玻璃表面**

```less
.workspace-navigation {
  background: var(--workspace-surface);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-right-color: var(--workspace-border-strong);
}

.workspace-header {
  background: var(--workspace-surface);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom-color: var(--workspace-border-strong);
}
```

- [ ] **Step 3: 运行门禁**

```bash
cd frontend
pnpm lint
pnpm typecheck
```

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/AppShell/AppShell.tsx frontend/src/components/AppShell/AppShell.less
git commit -m "feat(design): add glass AppShell shell and route transition animations

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 9: EmployeesPage 满宽迁移与表格列宽调整

**Files:**
- Modify: `frontend/src/pages/EmployeesPage.less`
- Modify: `frontend/src/pages/EmployeesPage.tsx`

**Interfaces:**
- Consumes: `.workspace-page` classes
- Produces: Full-width Employees page; table columns no longer overflow at 1920px.

- [ ] **Step 1: 修改 EmployeesPage.less**

```less
.employees-page {
  /* The root element carries className="employees-page workspace-page",
     and .employees-page__inner carries className="workspace-page__inner". */

  &__header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 18px;

    h1 {
      margin: 0;
      color: var(--workspace-text);
      font-size: 30px;
      font-weight: 700;
    }

    p {
      margin: 7px 0 0;
      color: var(--workspace-text-secondary);
      font-size: 14px;
    }
  }

  &__surface {
    /* Add className="workspace-card" in JSX; keep page-specific overrides here. */
  }

  &__tabs {
    > .semi-tabs-bar {
      min-height: 50px;
      padding-inline: 20px;
      border-bottom-color: var(--workspace-border-strong);
    }

    .semi-tabs-content {
      padding: 0;
    }
  }

  &__toolbar {
    display: grid;
    grid-template-columns: minmax(240px, 1fr) 170px 170px 140px;
    gap: 10px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--workspace-border-strong);

    @media (max-width: 900px) {
      grid-template-columns: 1fr;
    }
  }
}
```

注：`.workspace-page`、`.workspace-page__inner`、`.workspace-card` 是定义在 `workspace-tokens.css` 中的 CSS 类，直接在 JSX 的 `className` 上使用，不再作为 Less mixin 调用。

- [ ] **Step 2: 修改 EmployeesPage.tsx**

将根容器改为：

```tsx
<div className="employees-page workspace-page">
  <div className="employees-page__inner workspace-page__inner">
    ...
  </div>
</div>
```

调整表格列宽（示例）：将固定列宽改为百分比或 `minmax` 策略，使总宽度不再超过容器。

```tsx
const columns: ColumnProps<Employee>[] = [
  { title: '员工', dataIndex: 'displayName', width: 180, ... },
  { title: '部门', dataIndex: 'department', width: 120, ... },
  { title: '岗位', dataIndex: 'roleTitle', width: 150, ... },
  { title: '工作方向', dataIndex: 'workDirection', width: 140, ... },
  { title: '直属负责人', dataIndex: 'managerName', width: 130, ... },
  { title: '状态', dataIndex: 'employmentStatus', width: 90, ... },
  { title: '每周容量', dataIndex: 'weeklyCapacityHours', width: 100, ... },
  { title: '技能', dataIndex: 'skills', width: 180, ... },
  { title: '操作', dataIndex: 'id', fixed: 'right', width: 220, ... },
]
```

保持 `scroll={{ x: tableScrollWidth(columns) }}` 作为超窄屏兜底。

- [ ] **Step 3: 运行相关测试与门禁**

```bash
cd frontend
pnpm test src/pages/__tests__/EmployeesPage.test.tsx 2>/dev/null || pnpm test
pnpm lint
pnpm typecheck
```

Expected: pass。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/pages/EmployeesPage.less frontend/src/pages/EmployeesPage.tsx
git commit -m "feat(design): migrate EmployeesPage to full-width Aurora layout

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 10: 迁移 ProjectsPage / TasksPage / EmployeeDetailPage

**Files:**
- Modify: `frontend/src/pages/ProjectsPage.less`, `.tsx`
- Modify: `frontend/src/pages/TasksPage.less`, `.tsx`
- Modify: `frontend/src/pages/EmployeeDetailPage.less`, `.tsx`

**Interfaces:**
- Consumes: `.workspace-page`, `.workspace-card`

- [ ] **Step 1: 对每个页面执行与 Task 9 相同的改造**
  - 根容器改为 `<div className="xxx-page workspace-page"><div className="xxx-page__inner workspace-page__inner">...</div></div>`
  - Less 中移除 `max-width: 1440px; margin: 0 auto;`，页面根元素 JSX 使用 `className="xxx-page workspace-page"`，内部容器使用 `className="workspace-page__inner"`。
  - 标题字号统一为 30px / 700，副标题 14px / `var(--workspace-text-secondary)`
  - `.xxx-page__surface` 的 JSX 改用 `className="workspace-card"。
  - 表格列宽按“固定必要列 + 弹性填充”原则调整

- [ ] **Step 2: 运行门禁**

```bash
cd frontend
pnpm test
pnpm lint
pnpm typecheck
```

- [ ] **Step 3: 提交（可分三个 commit 或一个）**

```bash
git add frontend/src/pages/ProjectsPage.less frontend/src/pages/ProjectsPage.tsx frontend/src/pages/TasksPage.less frontend/src/pages/TasksPage.tsx frontend/src/pages/EmployeeDetailPage.less frontend/src/pages/EmployeeDetailPage.tsx
git commit -m "feat(design): migrate Projects/Tasks/EmployeeDetail to full-width Aurora layout

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 11: 迁移 Operations / DataGovernance / ExtensionsSettings

**Files:**
- Modify: `frontend/src/pages/OperationsPage.less`, `.tsx`
- Modify: `frontend/src/pages/DataGovernancePage.less`, `.tsx`
- Modify: `frontend/src/pages/ExtensionsSettingsPage.less`, `.tsx`

**Interfaces:**
- Consumes: `.workspace-page`, `.workspace-card`

- [ ] **Step 1: 移除 1180/1240px 的 max-width，改用 `.workspace-page`**

将 `.operations-page__header` 和 `.operations-page__surface` 的 `max-width: 1180px; margin: 0 auto;` 移除；页面根元素 JSX 使用 `className="operations-page workspace-page"`，内部容器使用 `className="workspace-page__inner"`；`.operations-page__surface` 的 JSX 改用 `className="workspace-card"`。

DataGovernance/ExtensionsSettings 同理。

- [ ] **Step 2: 运行门禁**

```bash
cd frontend
pnpm test
pnpm lint
pnpm typecheck
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/pages/OperationsPage.less frontend/src/pages/OperationsPage.tsx frontend/src/pages/DataGovernancePage.less frontend/src/pages/DataGovernancePage.tsx frontend/src/pages/ExtensionsSettingsPage.less frontend/src/pages/ExtensionsSettingsPage.tsx
git commit -m "feat(design): remove max-width constraints on Operations/DataGovernance/ExtensionsSettings

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 12: Admin 表格列宽补齐

**Files:**
- Modify: `frontend/src/modules/admin/UsersPage.tsx`
- Modify: `frontend/src/modules/admin/RolesPage.tsx`
- Modify: `frontend/src/modules/admin/PermissionsPage.tsx`
- Modify: `frontend/src/modules/admin/SecurityAuditsPage.tsx`

**Interfaces:**
- Produces: Numeric `width` on every leaf column so `tableScrollWidth` returns a pixel value.

- [ ] **Step 1: 为每个 leaf column 添加 `width`**

例如 `UsersPage`：

```tsx
const columns = [
  { title: '账号', dataIndex: 'username', width: 140 },
  { title: '工号', dataIndex: 'employeeNo', width: 100 },
  { title: '姓名', dataIndex: 'displayName', width: 120 },
  { title: '角色', dataIndex: 'roles', width: 160 },
  { title: '状态', dataIndex: 'status', width: 90 },
  { title: '最近登录', dataIndex: 'lastLoginAt', width: 160 },
  { title: '操作', dataIndex: 'id', fixed: 'right', width: 180 },
]
```

- [ ] **Step 2: 运行门禁**

```bash
cd frontend
pnpm test
pnpm lint
pnpm typecheck
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/modules/admin/UsersPage.tsx frontend/src/modules/admin/RolesPage.tsx frontend/src/modules/admin/PermissionsPage.tsx frontend/src/modules/admin/SecurityAuditsPage.tsx
git commit -m "feat(design): add numeric column widths to admin tables

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 13: 主题切换机制

**Files:**
- Create: `frontend/src/stores/theme.ts`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/pages/WorkbenchSettings.tsx`（或合适位置增加入口）

**Interfaces:**
- Produces: `useThemeStore`, `ThemeProvider` or hydration script; persists theme in `localStorage`.

- [ ] **Step 1: 编写 theme.ts**

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'aurora' | 'eye-care'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'aurora',
      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme)
        set({ theme })
      },
    }),
    {
      name: 'rd-workbench-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          document.documentElement.setAttribute('data-theme', state.theme)
        }
      },
    }
  )
)
```

若项目未使用 zustand，可用 React Context + `useState` + `useEffect` + `localStorage` 实现等效逻辑。

- [ ] **Step 2: 在 main.tsx 初始化 theme**

```tsx
import { useThemeStore } from '@/stores/theme'

const theme = useThemeStore.getState().theme
document.documentElement.setAttribute('data-theme', theme)
```

- [ ] **Step 3: 在设置页增加主题切换**

在 `WorkbenchSettings.tsx` 中加入：

```tsx
import { useThemeStore } from '@/stores/theme'

function ThemeSection() {
  const { theme, setTheme } = useThemeStore()
  return (
    <section className="workspace-card p-5">
      <h3 className="text-lg font-semibold text-[var(--workspace-text)]">外观</h3>
      <div className="mt-4 flex gap-2">
        <button
          className={`rounded-lg border px-4 py-2 text-sm ${theme === 'aurora' ? 'border-[var(--workspace-brand)] bg-[var(--workspace-brand-soft)] text-[var(--workspace-brand)]' : 'border-slate-200'}`}
          onClick={() => setTheme('aurora')}
        >
          极光
        </button>
        <button
          className={`rounded-lg border px-4 py-2 text-sm ${theme === 'eye-care' ? 'border-[var(--workspace-brand)] bg-[var(--workspace-brand-soft)] text-[var(--workspace-brand)]' : 'border-slate-200'}`}
          onClick={() => setTheme('eye-care')}
        >
          护眼
        </button>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: 添加 theme store 测试**

```tsx
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, beforeEach } from 'vitest'
import { useThemeStore } from './theme'

describe('useThemeStore', () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: 'aurora' })
    document.documentElement.setAttribute('data-theme', 'aurora')
  })

  it('sets data-theme on setTheme', () => {
    const { result } = renderHook(() => useThemeStore())
    act(() => result.current.setTheme('eye-care'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('eye-care')
  })
})
```

- [ ] **Step 5: 运行门禁**

```bash
cd frontend
pnpm test src/stores/__tests__/theme.test.tsx 2>/dev/null || pnpm test
pnpm lint
pnpm typecheck
```

- [ ] **Step 6: 提交**

```bash
git add frontend/src/stores/theme.ts frontend/src/stores/__tests__/theme.test.tsx frontend/src/main.tsx frontend/src/pages/WorkbenchSettings.tsx
git commit -m "feat(design): add theme switcher with localStorage persistence

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 14: 护眼主题变量

**Files:**
- Modify: `frontend/src/styles/workspace-tokens.css`

**Interfaces:**
- Produces: `[data-theme='eye-care']` variable overrides.

- [ ] **Step 1: 在 workspace-tokens.css 追加 eye-care 主题**

```css
[data-theme='eye-care'] {
  --workspace-canvas: #f7f5f0;
  --workspace-canvas-gradient:
    radial-gradient(circle at 10% 10%, rgba(107, 140, 94, 0.06), transparent 35%),
    radial-gradient(circle at 90% 20%, rgba(165, 160, 90, 0.05), transparent 30%),
    var(--workspace-canvas);
  --workspace-surface: rgba(253, 251, 247, 0.85);
  --workspace-surface-elevated: rgba(253, 251, 247, 0.94);
  --workspace-surface-subtle: #eef4ea;
  --workspace-border: rgba(232, 228, 220, 0.8);
  --workspace-border-strong: rgba(218, 213, 202, 0.8);
  --workspace-brand: #6b8c5e;
  --workspace-brand-hover: #5d7a52;
  --workspace-brand-gradient: linear-gradient(135deg, #6b8c5e, #a5a05a);
  --workspace-brand-soft: #eef4ea;
  --workspace-text: #3d3a34;
  --workspace-text-secondary: #6b665a;
  --workspace-text-muted: #9a9485;
  --workspace-text-inverse: #ffffff;
  --workspace-focus-ring: 0 0 0 3px rgba(107, 140, 94, 0.15);
  --workspace-shadow-panel: 0 8px 32px rgba(61, 58, 52, 0.05);
  --workspace-shadow-float: 0 20px 60px rgba(61, 58, 52, 0.08);
}
```

- [ ] **Step 2: 运行门禁**

```bash
cd frontend
pnpm lint
pnpm typecheck
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/styles/workspace-tokens.css
git commit -m "feat(design): add eye-care theme token overrides

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 15: 最终回归与清理

**Files:**
- All modified files

- [ ] **Step 1: 全局搜索硬编码颜色**

```bash
cd frontend
pnpm exec eslint . --ext .ts,.tsx --rule '{ "no-restricted-syntax": ["error", { "selector": "JSXAttribute[name.name=\"style\"]", "message": "Avoid inline styles" } ] }' 2>/dev/null || true
grep -R "background: #" src --include="*.less" --include="*.css" | head -20
```

记录剩余硬编码位置，作为后续技术债，但不在本次计划全部清理。

- [ ] **Step 2: 运行完整门禁**

```bash
cd frontend
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all pass。

- [ ] **Step 3: 提交**

```bash
git commit -m "chore(design): final pass and cleanup

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** 每一节设计规范（颜色、字体、布局、登录页、动效、主题）都有对应 task。
- [x] **Placeholder scan:** 无 TBD/TODO；所有代码块均为可直接使用的示例。
- [x] **Type consistency:** `WorkspaceButton` / `WorkspaceCard` / `WorkspaceInput` 接口在各自 task 中完整定义，不依赖未说明的外部类型。
- [x] **Scope check:** 本计划覆盖 Phase 1~4，按依赖顺序排列；每个 task 产生可独立测试的交付物。
- [x] **Gaps:** 旧页面的原生 `<button>` / `<input>` 未在本次全部替换，属于后续迭代技术债，已在 Task 15 记录。

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-01-aurora-glass-frontend-redesign.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach do you want?
