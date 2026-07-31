# 前端「极光玻璃」重设计规范

- **Date:** 2026-08-01
- **Status:** Approved by user
- **Scope:** 全局视觉系统刷新、登录页重设计、动效规范、护眼换肤预埋
- **Related:** `frontend/src/styles/workspace-tokens.css`, `frontend/src/components/AppShell/*`, `frontend/src/modules/auth/pages/LoginPage.*`

## 1. 背景与目标

当前前端存在以下问题：
- 页面容器被硬编码 `max-width` 居中，宽屏留白严重，表格列宽合计超过容器导致内部横向滚动。
- 颜色、间距、字号、字重、断点、弹窗宽度等均不统一。
- shadcn/radix 与 Semi Design 两套组件并存，原生 HTML 元素散落各处。
- 交互基本是“瞬间切换”，缺少进入/悬浮/聚焦/弹窗动效。
- 登录页视觉老旧，和新的 `AppShell` 脱节。
- 后续希望加入护眼换肤，但大量硬编码颜色让主题切换不可行。

本设计旨在：
1. 建立一套年轻、通透、有设计感的「极光玻璃」视觉系统。
2. 让页面充分利用屏幕宽度，表格不再被挤压。
3. 为所有交互增加丝滑动效。
4. 重设计登录页，使其成为品牌视觉焦点。
5. 用 CSS 变量彻底替换硬编码颜色，为护眼主题预留切换能力。

## 2. 视觉方向：极光玻璃（Aurora Glass）

整体感觉参考 Arc、Raycast、Linear 的现代桌面工具美学：
- 浅色、低饱和、流动的紫蓝渐变作为品牌背景。
- 卡片和表面使用半透明毛玻璃效果，轻盈通透。
- 深靛蓝文字保证可读性，避免纯白卡片配纯黑文字的廉价感。
- 圆角柔和（8~16px），阴影轻且弥散。
- 动效以“浮现、滑动、光晕”为主，不使用生硬的线性过渡。

## 3. 色彩系统

所有颜色必须通过 CSS 变量定义，禁止在业务代码中写死 hex。

### 3.1 核心 token（替换 workspace-tokens.css 中对应变量）

| Token | 默认值 | 用途 |
|---|---|---|
| `--workspace-canvas` | `#f8fafc` + 微渐变 | 页面背景 |
| `--workspace-surface` | `rgba(255, 255, 255, 0.72)` | 玻璃卡片/面板 |
| `--workspace-surface-elevated` | `rgba(255, 255, 255, 0.88)` | 弹窗、下拉面板 |
| `--workspace-border` | `rgba(255, 255, 255, 0.6)` + `rgba(226, 232, 240, 0.8)` | 玻璃边框 |
| `--workspace-brand` | `#8b5cf6` | 主色（紫） |
| `--workspace-brand-gradient` | `linear-gradient(135deg, #8b5cf6, #3b82f6)` | 按钮、logo、焦点 |
| `--workspace-brand-hover` | `#7c3aed` | 主色悬停 |
| `--workspace-brand-soft` | `#ede9fe` | 选中态、轻背景 |
| `--workspace-text` | `#1e1b4b` | 主文字（深靛蓝） |
| `--workspace-text-secondary` | `#5b558e` | 次要文字 |
| `--workspace-text-muted` | `#8a84b3` | 禁用、占位 |
| `--workspace-success` | `#10b981` | 成功 |
| `--workspace-warning` | `#f59e0b` | 警告 |
| `--workspace-danger` | `#ef4444` | 危险 |
| `--workspace-info` | `#3b82f6` | 信息 |
| `--workspace-overlay` | `rgba(30, 27, 75, 0.45)` | 弹窗遮罩 |
| `--workspace-shadow-panel` | `0 8px 32px rgba(31, 35, 41, 0.06)` | 卡片阴影 |
| `--workspace-shadow-float` | `0 20px 60px rgba(31, 35, 41, 0.12)` | 悬浮元素 |

### 3.2 画布渐变

页面背景使用细微的极光渐变，避免单调：

```css
.workspace-canvas-gradient {
  background:
    radial-gradient(circle at 10% 10%, rgba(139, 92, 246, 0.08), transparent 35%),
    radial-gradient(circle at 90% 20%, rgba(59, 130, 246, 0.06), transparent 30%),
    radial-gradient(circle at 50% 90%, rgba(236, 72, 153, 0.04), transparent 35%),
    var(--workspace-canvas);
}
```

## 4. 字体与排版

继续使用 `--font-main: 'Geist Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;`，统一为以下阶梯：

| 元素 | 字号 | 字重 | 行高 | 备注 |
|---|---|---|---|---|
| H1 页面标题 | 30px | 700 | 1.2 | 首页/登录页可更大 |
| H2 区块标题 | 24px | 600 | 1.3 | |
| H3 卡片标题 | 20px | 600 | 1.35 | |
| 引导/副标题 | 16px | 500 | 1.5 | |
| 正文 | 14px | 400 | 1.6 | 桌面基准 |
| 小字 | 13px | 400 | 1.55 | 描述、辅助 |
| 标签 | 12px | 500 | 1.4 | 大写 + 0.04em 字间距 |

禁止使用 11px 及以下的正文/标签，除非在数据密度极高的场景并确保对比度。

## 5. 布局与页面容器

### 5.1 取消硬编码 max-width

- `.app-page__inner` / `.app-page__inner--wide` 改为 `max-width: none`。
- `.app-page__inner--narrow` 保留 `1040px`，用于纯表单/设置页。
- 业务页面（Employees、Projects、Tasks、EmployeeDetail 等）去掉 `.xxx-page { max-width: 1440px; }`。
- Operations / DataGovernance / ExtensionsSettings 等 1180~1240px 的容器也放开到满宽。

### 5.2 统一页面外壳

所有页面最终归入统一的 `.workspace-page`：

```css
.workspace-page {
  min-height: 100%;
  padding: 24px 32px 48px;
  background: /* 极光渐变 */;
}

.workspace-page__inner {
  width: 100%;
  max-width: none;
  margin: 0 auto;
}

.workspace-page__inner--narrow {
  max-width: 1040px;
}
```

迁移顺序：
1. 先在 `workspace-tokens.css` 新增 `.workspace-page` 工具类。
2. 新页面/重设计页面直接使用 `.workspace-page`。
3. 旧页面逐步替换，避免一次性全改带来的回归风险。

### 5.3 表格策略

- 表格容器宽度跟随页面，不再被 `max-width` 挤压。
- 列宽采用“关键列固定 + 弹性列填充”：
  - 名称/操作列给固定最小宽度。
  - 描述/状态列使用百分比或 `minmax(120px, 1fr)`。
- 保留 `scroll={{ x: tableScrollWidth(columns) }}` 作为超宽兜底，但目标是在常见分辨率下不触发横向滚动。
- 表格行 hover：背景色过渡 + 左侧 2px 品牌色条可选。

## 6. 组件规范

### 6.1 卡片

```css
.workspace-card {
  background: var(--workspace-surface);
  backdrop-filter: blur(12px);
  border: 1px solid var(--workspace-border);
  border-radius: 12px;
  box-shadow: var(--workspace-shadow-panel);
  transition: transform 200ms var(--ease-out),
              box-shadow 200ms var(--ease-out);
}

.workspace-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--workspace-shadow-float);
}
```

### 6.2 按钮

主按钮：

```css
.workspace-button-primary {
  background: var(--workspace-brand-gradient);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 4px 14px rgba(139, 92, 246, 0.3);
  transition: transform 150ms var(--ease-out),
              box-shadow 150ms var(--ease-out);
}

.workspace-button-primary:hover {
  transform: scale(1.02);
  box-shadow: 0 6px 20px rgba(139, 92, 246, 0.4);
}
```

次要按钮使用白色玻璃背景 + 品牌边框文字。

### 6.3 输入框

```css
.workspace-input {
  background: rgba(248, 250, 252, 0.8);
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  transition: border-color 150ms, box-shadow 150ms;
}

.workspace-input:focus {
  border-color: var(--workspace-brand);
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15);
  outline: none;
}
```

### 6.4 弹窗

统一弹窗尺寸阶梯：

| 尺寸 | 宽度 | 用途 |
|---|---|---|
| sm | 480px | 确认、简单表单 |
| md | 640px | 标准数据录入 |
| lg | 860px | 复杂表单、导入、矩阵 |
| xl | calc(100vw - 48px), max 1200px | 全宽预览 |

弹窗出现动画：
- Backdrop：`opacity 0→1`，150ms。
- Content：`opacity 0→1` + `scale(0.96→1)` + `translateY(8px→0)`，250ms，`cubic-bezier(0.16, 1, 0.3, 1)`。

### 6.5 表格

- 表头使用半透明毛玻璃 sticky。
- 行高 48px（middle）。
- 行 hover 背景色 `#f5f3ff` / `var(--workspace-brand-soft)`，过渡 150ms。
- 操作列固定右侧，使用品牌色文字链接。

## 7. 登录页设计

### 7.1 整体结构

- 全屏极光渐变背景，带 2~3 个缓慢漂浮的模糊色块（紫、蓝、粉）。
- 居中悬浮玻璃卡片，宽度 `min(400px, calc(100% - 48px))`。
- 卡片内容：logo + 产品名 + 副标题 + 账号输入 + 密码输入 + 登录按钮 + 错误提示 + 可选的“忘记密码/修改密码”。

### 7.2 视觉细节

- Logo：16px 圆角方块，品牌渐变。
- 标题：`font-size: 22px; font-weight: 700; color: var(--workspace-text);`。
- 副标题：`font-size: 14px; color: var(--workspace-text-secondary);`。
- 输入框：见 6.3，聚焦时外发光。
- 登录按钮：主按钮样式，宽度 100%，loading 时显示 spinner。
- 错误提示：玻璃危险色 banner，带 shake 动画（`translateX(-4px, 4px, 0)` 300ms）。

### 7.3 背景动效

```css
@keyframes float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(20px, -20px) scale(1.05); }
}

.aurora-blob {
  animation: float 12s ease-in-out infinite;
  filter: blur(60px);
}
```

使用 `will-change: transform` 和 `transform` 动画以保证性能。

## 8. 动效规范

### 8.1 Easing 变量

```css
:root {
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
}
```

### 8.2 Duration 阶梯

| 场景 | 时长 | 说明 |
|---|---|---|
| Micro（按钮、开关、聚焦） | 150ms | 即时反馈 |
| UI（卡片 hover、下拉） | 200ms | 自然过渡 |
| Enter（页面、弹窗、toast） | 250~400ms | 有存在感的出现 |
| Ambient（登录背景、脉冲） | 8~16s | 循环装饰 |

### 8.3 具体动效清单

- **页面进入**：`opacity 0→1` + `translateY(8px→0)`，400ms，`--ease-out`。
- **路由切换**：旧页面淡出 150ms，新页面进入 300ms。
- **卡片 hover**：`translateY(-2px)` + 阴影加深，200ms。
- **按钮 hover**：`scale(1.02)` + 光晕扩散，150ms。
- **按钮 active**：`scale(0.98)`，100ms。
- **输入聚焦**：边框变品牌色 + 外发光，150ms。
- **表格行 hover**：背景色过渡，150ms。
- **弹窗**：backdrop 淡入 150ms，content scale + opacity 250ms。
- **Toast/通知**：从右侧滑入 + 淡入，300ms；自动消失时淡出 200ms。
- **登录错误**：shake 300ms。

### 8.4 性能原则

- 动画元素使用 `transform` 和 `opacity`，避免触发 layout/paint。
- 长动画使用 `will-change: transform`。
- 尊重 `prefers-reduced-motion`，在媒体查询中禁用非必要动画。

## 9. 护眼换肤预埋

### 9.1 主题架构

- 在 `<html>` 或 `<body>` 上通过 `data-theme="aurora"` / `data-theme="eye-care"` 切换。
- 所有颜色使用 `var(--workspace-*)` 系列变量。
- 组件代码中禁止写死 hex；已有的 1000+ 处硬编码颜色需要逐步迁移。

### 9.2 eye-care 主题变量示例

```css
[data-theme='eye-care'] {
  --workspace-canvas: #f7f5f0;
  --workspace-surface: rgba(253, 251, 247, 0.85);
  --workspace-border: rgba(232, 228, 220, 0.8);
  --workspace-brand: #6b8c5e;
  --workspace-brand-gradient: linear-gradient(135deg, #6b8c5e, #a5a05a);
  --workspace-brand-soft: #eef4ea;
  --workspace-text: #3d3a34;
  --workspace-text-secondary: #6b665a;
  --workspace-text-muted: #9a9485;
}
```

### 9.3 切换入口

- 第一阶段：在 `WorkbenchSettings` 或 `WorkspaceHeader` 用户菜单中增加主题下拉。
- 主题状态保存在 `localStorage`，应用启动时读取并设置 `data-theme`。

## 10. 需要修改的关键文件

### 10.1 Token 与全局样式
- `frontend/src/styles/workspace-tokens.css` — 新增/覆盖颜色、间距、动效变量，定义 `.workspace-page`。
- `frontend/src/index.css` — 清理死主题代码，统一基础样式。
- `frontend/src/animations.css` — 定义关键帧（float、fadeInUp、shake、modalIn 等）。

### 10.2 布局壳
- `frontend/src/components/AppShell/AppShell.less` — 玻璃 sidebar/header，移除旧 token 引用。
- `frontend/src/components/AppShell/AppShell.tsx` — 页面切换动画包裹。

### 10.3 登录页
- `frontend/src/modules/auth/pages/LoginPage.tsx`
- `frontend/src/modules/auth/pages/LoginPage.less`

### 10.4 组件封装
- `frontend/src/components/workspace/SemiCompat.tsx` — 统一按钮、卡片、弹窗样式。
- 新增 `frontend/src/components/workspace/WorkspaceCard.tsx`
- 新增 `frontend/src/components/workspace/WorkspaceButton.tsx`
- 新增 `frontend/src/components/workspace/WorkspaceInput.tsx`

### 10.5 页面迁移（逐步）
- `frontend/src/pages/EmployeesPage.less` / `.tsx` — 移除 max-width，调整表格列宽。
- `frontend/src/pages/ProjectsPage.less` / `.tsx`
- `frontend/src/pages/TasksPage.less` / `.tsx`
- `frontend/src/pages/EmployeeDetailPage.less` / `.tsx`
- `frontend/src/pages/DataGovernancePage.less`
- `frontend/src/pages/OperationsPage.less`
- `frontend/src/pages/ExtensionsSettingsPage.less`

## 11. 实施阶段

### Phase 1 — 基础 token + 登录页（约 1~2 天）
1. 重写 `workspace-tokens.css` 颜色变量与 `.workspace-page`。
2. 新增 `animations.css` 关键帧与 easing 变量。
3. 重设计 `LoginPage`（极光背景 + 玻璃卡片 + 动效）。
4. 验证登录流程、错误状态、loading 状态。

### Phase 2 — 组件统一（约 2~3 天）
1. 封装 `WorkspaceCard`、`WorkspaceButton`、`WorkspaceInput`。
2. 更新 `SemiCompat` 的 Button / Dialog 到 Aurora 样式。
3. 统一弹窗尺寸阶梯。
4. 替换部分页面的原生按钮/输入框。

### Phase 3 — 页面迁移 + 表格（约 3~4 天）
1. 移除业务页 max-width，统一 padding。
2. 调整 Employees / Projects / Tasks 等表格列宽策略。
3. 为 admin 表格补充 numeric column widths。
4. 加入页面进入动画和路由过渡。

### Phase 4 — 护眼主题（约 1~2 天）
1. 实现 `data-theme` 切换机制。
2. 定义 `eye-care` 变量集。
3. 在设置页增加主题切换入口。
4. 修复剩余硬编码颜色。

## 12. 验收标准

- [ ] 所有页面不再被 `max-width` 居中挤压，宽屏下表格无内部横向滚动（常见 1920px 分辨率）。
- [ ] 登录页呈现极光玻璃视觉，输入、错误、loading 有动效。
- [ ] 按钮、卡片、输入框、弹窗风格统一，无明显视觉断层。
- [ ] 路由切换、页面进入、卡片 hover、弹窗、toast 均有动画。
- [ ] `prefers-reduced-motion` 下非必要动画被禁用。
- [ ] 主题切换入口可用，切到 `eye-care` 后无硬编码颜色穿帮。
- [ ] `pnpm lint`、`pnpm typecheck`、`pnpm test` 通过。

---

*Design approved by user on 2026-08-01.*
