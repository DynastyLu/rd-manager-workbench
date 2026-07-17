# Paper Excel OCR — 前端框架使用指南

> 基于 React 19 + TypeScript 5 + Vite 8 的企业级前端框架，涵盖状态管理、HTTP 请求、权限控制、表单校验、国际化、测试、组件文档等完整能力。

---

## 目录

- [一、快速启动](#一快速启动)
- [二、目录结构](#二目录结构)
- [三、状态管理（Zustand）](#三状态管理zustand)
- [四、HTTP 请求（request.ts）](#四http-请求requestts)
- [五、API Service 层](#五api-service-层)
- [六、数据查询（TanStack React Query）](#六数据查询tanstack-react-query)
- [七、表单处理（react-hook-form + Zod）](#七表单处理react-hook-form--zod)
- [八、权限控制（RBAC）](#八权限控制rbac)
- [九、路由与页面](#九路由与页面)
- [十、主题系统](#十主题系统)
- [十一、组件库（shadcn/ui）](#十一组件库shadcnui)
- [十二、动画（Framer Motion）](#十二动画framer-motion)
- [十三、WebSocket](#十三websocket)
- [十四、国际化（i18n）](#十四国际化i18n)
- [十五、运行时配置](#十五运行时配置)
- [十六、错误监控（Sentry）](#十六错误监控sentry)
- [十七、版本更新检测](#十七版本更新检测)
- [十八、测试](#十八测试)
- [十九、Storybook 组件文档](#十九storybook-组件文档)
- [二十、Git 工作流](#二十git-工作流)
- [二十一、构建与部署](#二十一构建与部署)
- [二十二、新增功能的标准流程](#二十二新增功能的标准流程)
- [附录 A：CSS 变量速查表](#附录-acss-变量速查表)
- [附录 B：常见问题](#附录-b常见问题)

---

## 一、快速启动

### 环境要求

- Node.js >= 20
- pnpm >= 9（项目锁定 `pnpm@9.15.1`，其他包管理器无法安装）

### 常用命令

```bash
pnpm install              # 安装依赖
pnpm dev                  # 启动开发服务器（自动代理 /api → localhost:3000）
pnpm check                # 统一质量门禁：lint + typecheck + test + build + storybook
pnpm build                # 生产构建
pnpm preview              # 预览构建产物
pnpm test                 # 运行测试
pnpm test:coverage        # 覆盖率报告
pnpm test:e2e             # Playwright 浏览器 smoke 测试
pnpm typecheck            # TypeScript 类型检查（不产出文件）
pnpm lint                 # ESLint 检查
pnpm format:check         # Prettier 格式检查
pnpm lint:fix             # ESLint 自动修复 + Prettier 格式化
pnpm storybook            # 启动 Storybook 开发服务器（端口 6006）
pnpm build-storybook      # 构建 Storybook 静态站点
pnpm analyze              # 生成 stats.html 打包体积报告
```

---

## 工程化闭环

当前模板已经接入以下工程能力：

- **CI**：`.github/workflows/ci.yml` 在根目录执行 `pnpm check`、`pnpm test:coverage` 和 `pnpm test:e2e`。
- **提交门禁**：Husky + lint-staged 负责 staged 文件格式化和 lint，commitlint 约束 Conventional Commits。
- **覆盖率**：Vitest 使用 V8 coverage provider，报告输出到 `coverage/`，阈值在 `vite.config.ts` 中维护。
- **E2E**：Playwright 配置在 `playwright.config.ts`，默认启动 Vite dev server 并使用 Chromium 跑 `e2e/` 下的 smoke。
- **包体分析**：`pnpm analyze` 输出 `stats.html`，用于检查依赖拆包和体积变化。
- **运行时配置**：`public/config.js` 在 bundle 前加载，`src/lib/config.ts` 读取后冻结配置；`request.ts` 会把 `/api/...` 解析到 `config.apiBaseUrl`。
- **部署**：`Dockerfile` 使用 Node 构建、nginx 运行；`nginx.conf` 提供 SPA fallback、静态资源强缓存、`config.js` 和 `version.json` 禁止缓存。
- **版本信息**：`pnpm build` 会在 `dist/version.json` 写入 package version、git commit 和 build time。
- **依赖维护**：`.github/dependabot.yml` 和 `renovate.json` 提供自动升级策略。

---

## 二、目录结构

```
src/
├── main.tsx                # 应用入口（Sentry、QueryClient、路由、主题初始化）
├── index.css               # 全局样式 + 3 套主题 CSS 变量
├── animations.css          # 动画关键帧定义
├── vite-env.d.ts           # Vite 环境类型声明
├── test-setup.ts           # Vitest 测试全局配置（MSW 集成）
│
├── router/
│   └── routes.ts           # 路由定义与分类
│
├── stores/                 # Zustand 状态管理
│   ├── auth.ts             #   认证（登录/登出/token 刷新）
│   ├── theme.ts            #   主题切换（持久化到 localStorage）
│   └── toast.ts            #   Toast 通知（sonner 封装）
│
├── lib/                    # 基础设施层
│   ├── request.ts          #   HTTP 客户端（token 注入 + 401 静默刷新）
│   ├── socket.ts           #   WebSocket 客户端（心跳 + 断线重连）
│   ├── config.ts           #   运行时配置（window.__APP_CONFIG__）
│   ├── i18n.ts             #   国际化初始化
│   ├── motion.ts           #   Framer Motion 动画 variants
│   ├── version.ts          #   版本更新检测
│   └── utils.ts            #   cn() 样式合并工具（clsx + tailwind-merge）
│
├── hooks/                  # 通用 Hooks
│   ├── usePermission.ts    #   RBAC 权限检查
│   ├── useRequest.ts       #   通用异步请求 Hook
│   ├── useWebSocket.ts     #   WebSocket 连接 Hook
│   └── useOnlineStatus.ts  #   浏览器在线状态检测
│
├── services/               # API 调用层（一个后端模块对应一个文件）
│   ├── auth.ts             #   认证 API
│   ├── ocr.ts              #   OCR 识别/导出 API
│   └── users.ts            #   用户管理 API
│
├── schemas/                # Zod 校验 Schema
│   ├── auth.ts             #   登录表单校验
│   ├── user.ts             #   用户创建/角色更新校验
│   └── ocr.ts              #   上传校验
│
├── types/                  # TypeScript 类型定义
│   ├── api.ts              #   通用 API 响应类型
│   ├── user.ts             #   用户类型（UserInfo, UserRole）
│   ├── ocr.ts              #   OCR 类型（FileItem, TableData）
│   └── env.d.ts            #   环境变量类型
│
├── constants/              # 常量
│   ├── routes.ts           #   路由路径常量
│   └── roles.ts            #   角色、权限、权限映射表
│
├── locales/                # 国际化翻译文件
│   ├── zh-CN/common.json
│   └── en-US/common.json
│
├── components/             # 组件
│   ├── ui/                 #   shadcn/ui 基础组件（Button, Input, Dialog 等）
│   ├── Header/             #   顶部导航（主题切换 + 用户菜单）
│   ├── Sidebar/            #   侧边栏（可折叠分类）
│   ├── Footer/             #   页脚
│   ├── Layout/             #   布局容器
│   ├── TabBar/             #   标签栏（带 localStorage 持久化）
│   ├── ProtectedRoute/     #   路由鉴权守卫
│   ├── PermissionGate/     #   权限控制组件
│   ├── PageTransition/     #   页面过渡动画
│   ├── ErrorBoundary/      #   错误边界
│   ├── UpdateNotifier/     #   版本更新提示
│   ├── EditableTable/      #   可编辑表格
│   └── OcrTool/            #   OCR 业务组件（DropZone, FileCard, BatchBar）
│
├── pages/                  # 页面组件
│   ├── Home.tsx            #   首页仪表盘
│   ├── Login.tsx           #   登录页（赛博朋克风格）
│   ├── OcrTool.tsx         #   OCR 识别工具
│   ├── AdminUsers.tsx      #   用户管理（TanStack Query + shadcn）
│   ├── Admin.tsx           #   管理后台
│   ├── History.tsx         #   历史记录
│   ├── Mine.tsx            #   我的
│   ├── Settings.tsx        #   设置
│   └── Profile.tsx         #   个人中心
│
└── mocks/                  # MSW Mock 数据
    ├── browser.ts          #   浏览器 Worker 入口
    ├── server.ts           #   Node 测试 Server 入口
    └── handlers/           #   Mock Handler
        ├── index.ts
        ├── auth.ts
        ├── users.ts
        └── ocr.ts
```

---

## 三、状态管理（Zustand）

项目使用 [Zustand](https://zustand.docs.pmnd.rs/) 替代 React Context，共 3 个独立 store。

### 3.1 认证 store — `stores/auth.ts`

```tsx
import { useAuthStore } from '@/stores/auth'

// --- 在组件中读取状态（自动响应式更新） ---

function UserBadge() {
  const user = useAuthStore((s) => s.user) // UserInfo | null
  const isLoading = useAuthStore((s) => s.isLoading) // 初始化中?

  if (isLoading) return <span>加载中...</span>
  if (!user) return <span>未登录</span>
  return (
    <span>
      欢迎, {user.username}（{user.role}）
    </span>
  )
}

// --- 调用 action ---

function LoginButton() {
  const login = useAuthStore((s) => s.login)

  const handleLogin = async () => {
    try {
      await login('admin', 'password123')
      // 成功后 store 自动更新 user + accessToken
    } catch (err) {
      console.error('登录失败', err)
    }
  }

  return (
    <button
      onClick={() => {
        void handleLogin()
      }}
    >
      登录
    </button>
  )
}

// --- 在组件外使用（service / 拦截器等非 React 环境） ---

const currentUser = useAuthStore.getState().user
await useAuthStore.getState().logout()
```

**设计要点：**

- **不持久化**（防 XSS）：token 存在内存中，刷新页面通过 httpOnly cookie 调用 `refreshAccessToken()` 恢复会话。
- **Token 刷新去重**：多个并发 401 只触发一次 refresh，其余请求等待同一个 Promise。
- **自动配置 HTTP 层**：模块加载时调用 `configureRequest()`，将 token getter 和 refresh 函数注入到 `request.ts`。

### 3.2 主题 store — `stores/theme.ts`

```tsx
import { useThemeStore, THEME_LABELS, type Theme } from '@/stores/theme'

function ThemeSwitcher() {
  const theme = useThemeStore((s) => s.theme) // 'cyberpunk' | 'ocean' | 'classic'
  const setTheme = useThemeStore((s) => s.setTheme)

  return (
    <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
      {Object.entries(THEME_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  )
}
```

`setTheme()` 同时完成三件事：

1. 更新 Zustand state
2. 写入 localStorage（通过 persist 中间件）
3. 设置 `document.documentElement.setAttribute('data-theme', theme)`（CSS 变量切换）

**防闪烁**：`main.tsx` 在 React 渲染前同步读取 localStorage 并设置 `data-theme`，避免默认主题闪烁。

### 3.3 Toast store — `stores/toast.ts`

```tsx
import { useToast } from '@/stores/toast'

function SaveButton() {
  const toast = useToast()

  const handleSave = async () => {
    try {
      await saveData()
      toast.success('保存成功') // 默认 3s 后消失
      toast.info('提示信息', { duration: 5000 }) // 自定义时长（ms）
      toast.warning('请注意')
      toast.error('严重错误', { duration: 0 }) // 0 = 不自动消失
    } catch {
      toast.error('保存失败')
    }
  }

  return (
    <button
      onClick={() => {
        void handleSave()
      }}
    >
      保存
    </button>
  )
}

// 在组件外使用
import { useToastStore } from '@/stores/toast'
useToastStore.getState().showError('网络异常')
useToastStore.getState().showSuccess('操作成功')
```

---

## 四、HTTP 请求（request.ts）

位于 `src/lib/request.ts`，是对原生 `fetch` 的薄封装。

### 4.1 基本用法

```tsx
import * as request from '@/lib/request'

// GET
const user = await request.get<UserInfo>('/api/auth/me')

// POST（自动 JSON.stringify）
const result = await request.post<{ id: string }>('/api/items', {
  name: '新项目',
  type: 'doc',
})

// PATCH
await request.patch<UserInfo>('/api/users/123/role', { role: 'admin' })

// DELETE（204 返回 null）
await request.del('/api/users/123')

// 文件上传（FormData，浏览器自动设置 Content-Type 和 boundary）
const form = new FormData()
form.append('image', file)
const ocr = await request.postForm<OcrResult>('/api/recognize', form)

// 文件下载
const blob = await request.getBlob('/api/export/123')
const blob2 = await request.postBlob('/api/export', { rows, merged_cells })
```

### 4.2 自动行为

| 功能         | 说明                                                |
| ------------ | --------------------------------------------------- |
| Token 注入   | 每个请求自动加 `Authorization: Bearer <token>`      |
| 401 静默刷新 | 收到 401 → 调 refresh → 拿新 token → 自动重试原请求 |
| 错误规范化   | 非 2xx 抛出 `ApiError(message, status, code)`       |
| Cookie 携带  | 所有请求 `credentials: 'include'`                   |

### 4.3 错误处理

```tsx
import { ApiError } from '@/lib/request'

try {
  await request.post('/api/something', data)
} catch (err) {
  if (err instanceof ApiError) {
    console.log(err.status) // HTTP 状态码：400, 403, 500...
    console.log(err.code) // 后端自定义错误码：'USER_EXISTS', 'INVALID_TOKEN'...
    console.log(err.message) // 人类可读错误信息：'用户已存在'
  }
}
```

### 4.4 为什么不用 axios

| 对比          | 当前 fetch wrapper     | axios              |
| ------------- | ---------------------- | ------------------ |
| 体积          | 0 KB（浏览器原生）     | ~13 KB gzip        |
| 泛型支持      | `get<T>`, `post<T>`    | 类似               |
| 401 刷新      | 已实现                 | 需手写 interceptor |
| 文件上传/下载 | `postForm` / `getBlob` | 类似               |
| SSR 支持      | 需 polyfill            | 内置 adapter       |

本项目是纯 SPA，不需要 SSR，fetch wrapper 完全够用且零依赖。

---

## 五、API Service 层

Service 层是对 `request.ts` 的**业务封装**，一个后端模块对应一个文件。

### 5.1 已有的 Service

```tsx
import { authService } from '@/services/auth'
import { ocrService } from '@/services/ocr'
import { usersService } from '@/services/users'

// 认证
await authService.login(username, password) // → { accessToken, user }
await authService.logout()
await authService.refresh() // → { accessToken }
const me = await authService.me() // → UserInfo

// OCR
const result = await ocrService.recognize(file) // → { success, data: TableData }
const blob = await ocrService.exportOne({ rows, merged_cells }) // → Blob (xlsx)
const blob2 = await ocrService.exportBatch(sheets) // → Blob (xlsx)

// 用户管理
const users = await usersService.list()
const newUser = await usersService.create({ username, password, role })
await usersService.updateRole(id, role)
await usersService.remove(id)
```

### 5.2 新增 Service 的模板

```tsx
// src/services/projects.ts
import * as request from '@/lib/request'
import type { Project } from '@/types/project'

interface CreateProjectPayload {
  name: string
  description?: string
}

export const projectService = {
  /** 获取项目列表 */
  list: () => request.get<Project[]>('/api/projects'),

  /** 获取单个项目 */
  getById: (id: string) => request.get<Project>(`/api/projects/${id}`),

  /** 创建项目 */
  create: (data: CreateProjectPayload) => request.post<Project>('/api/projects', data),

  /** 更新项目 */
  update: (id: string, data: Partial<Project>) =>
    request.patch<Project>(`/api/projects/${id}`, data),

  /** 删除项目 */
  remove: (id: string) => request.del(`/api/projects/${id}`),
}
```

---

## 六、数据查询（TanStack React Query）

项目使用 [React Query](https://tanstack.com/query) 管理服务端状态，替代手动 `useState` + `useEffect` 模式。

### 6.1 查询数据

```tsx
import { useQuery } from '@tanstack/react-query'
import { usersService } from '@/services/users'

function UserList() {
  const {
    data: users,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['admin', 'users'], // 缓存键
    queryFn: () => usersService.list(), // 数据获取函数
  })

  if (isLoading) return <Skeleton />
  if (error) return <p>加载失败: {error.message}</p>

  return (
    <ul>
      {users?.map((u) => (
        <li key={u.id}>{u.username}</li>
      ))}
    </ul>
  )
}
```

**React Query 帮你做了：**

- 自动缓存（`staleTime: 5min`），避免重复请求
- 窗口重新聚焦时自动刷新
- Loading / Error 状态自动管理
- 组件卸载 10 分钟后才垃圾回收（`gcTime: 10min`）

### 6.2 修改数据（Mutation）

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'

function CreateUserForm() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const mutation = useMutation({
    mutationFn: (data: CreateUserPayload) => usersService.create(data),
    onSuccess: () => {
      // 让列表缓存失效 → 自动触发重新获取
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success('创建成功')
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : '创建失败')
    },
  })

  return (
    <button
      onClick={() => {
        void mutation.mutateAsync(formData)
      }}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? '创建中...' : '创建'}
    </button>
  )
}
```

### 6.3 乐观更新

适用于需要即时反馈的操作（如角色切换）：

```tsx
const roleChangeMutation = useMutation({
  mutationFn: ({ id, role }: { id: string; role: string }) => usersService.updateRole(id, role),

  // 1. 乐观更新：先改 UI，不等后端
  onMutate: async ({ id, role }) => {
    await queryClient.cancelQueries({ queryKey: ['admin', 'users'] })
    const previous = queryClient.getQueryData<User[]>(['admin', 'users'])
    queryClient.setQueryData<User[]>(['admin', 'users'], (old) =>
      old?.map((u) => (u.id === id ? { ...u, role } : u))
    )
    return { previous } // 保存旧数据
  },

  // 2. 后端报错时回滚
  onError: (_err, _vars, context) => {
    if (context?.previous) {
      queryClient.setQueryData(['admin', 'users'], context.previous)
    }
    toast.error('更新失败')
  },

  // 3. 无论成败，最终和服务器同步
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
  },
})
```

### 6.4 queryKey 命名规范

```
['admin', 'users']           # 用户列表
['admin', 'users', userId]   # 单个用户
['ocr', 'history']           # OCR 历史
['ocr', 'history', fileId]   # 单条历史
```

调用 `invalidateQueries({ queryKey: ['admin', 'users'] })` 会让**所有以此为前缀的查询**失效。

---

## 七、表单处理（react-hook-form + Zod）

### 7.1 定义 Zod Schema

```tsx
// src/schemas/auth.ts
import { z } from 'zod'

export const LoginSchema = z.object({
  username: z.string().min(3, '用户名至少 3 个字符').max(50, '用户名最多 50 个字符'),
  password: z.string().min(6, '密码至少 6 个字符'),
})

// 自动推导 TypeScript 类型
export type LoginFormData = z.infer<typeof LoginSchema>
// → { username: string; password: string }
```

### 7.2 完整表单示例

```tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { LoginSchema, type LoginFormData } from '@/schemas/auth'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

function LoginForm() {
  const form = useForm<LoginFormData>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { username: '', password: '' },
  })

  const onSubmit = async (data: LoginFormData) => {
    try {
      await useAuthStore.getState().login(data.username, data.password)
    } catch {
      form.setError('root', { message: '用户名或密码错误' })
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          void form.handleSubmit(onSubmit)(e)
        }}
      >
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>用户名</FormLabel>
              <FormControl>
                <Input placeholder="请输入用户名" {...field} />
              </FormControl>
              <FormMessage /> {/* 自动显示 Zod 校验错误 */}
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>密码</FormLabel>
              <FormControl>
                <Input type="password" placeholder="请输入密码" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 表单级错误（如"密码错误"） */}
        {form.formState.errors.root && (
          <p style={{ color: 'red' }}>{form.formState.errors.root.message}</p>
        )}

        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? '登录中...' : '登录'}
        </Button>
      </form>
    </Form>
  )
}
```

**核心概念：**

| 概念                          | 作用                                          |
| ----------------------------- | --------------------------------------------- |
| `zodResolver(Schema)`         | 将 Zod Schema 接入 react-hook-form 的校验系统 |
| `<FormField>`                 | 连接 form state 与 UI 组件                    |
| `<FormMessage />`             | 自动显示当前字段的校验错误文本                |
| `form.setError('root', ...)`  | 手动设置表单级错误（非字段级）                |
| `form.formState.isSubmitting` | 提交中状态，用于禁用按钮                      |
| `z.infer<typeof Schema>`      | 从 Zod Schema 自动推导 TypeScript 类型        |

---

## 八、权限控制（RBAC）

### 8.1 权限体系

定义在 `src/constants/roles.ts`：

| 角色    | 权限                                                                        |
| ------- | --------------------------------------------------------------------------- |
| `admin` | `ocr:upload`, `ocr:export`, `history:view`, `history:delete`, `admin:users` |
| `user`  | `ocr:upload`, `ocr:export`, `history:view`                                  |
| `guest` | 无                                                                          |

### 8.2 Hook 用法

```tsx
import { usePermission, usePermissions, useHasRole } from '@/hooks/usePermission'

function UploadButton() {
  const canUpload = usePermission('ocr:upload') // 检查单个权限
  if (!canUpload) return null
  return <button>上传</button>
}

function AdminSection() {
  const isAdmin = useHasRole('admin') // 检查角色
  if (!isAdmin) return null
  return <div>管理区域</div>
}

function ExportButton() {
  const [canExport, canDelete] = usePermissions([
    // 检查多个权限
    'ocr:export',
    'history:delete',
  ])
  // ...
}
```

### 8.3 组件式权限控制

```tsx
import PermissionGate from '@/components/PermissionGate/PermissionGate'

{
  /* 有权限才渲染 */
}
;<PermissionGate permission="admin:users">
  <AdminPanel />
</PermissionGate>

{
  /* 无权限显示 fallback */
}
;<PermissionGate permission="ocr:upload" fallback={<p>无权限</p>}>
  <UploadForm />
</PermissionGate>
```

### 8.4 路由级鉴权

在路由定义中设置 `requireAdmin: true`，`ProtectedRoute` 组件会自动检查：

- 未登录 → 重定向到 `/login?returnUrl=当前路径`
- 已登录但非 admin → 重定向到 `/`
- admin → 正常渲染

---

## 九、路由与页面

### 9.1 路由结构

| 路径           | 页面           | 鉴权     | 位置           |
| -------------- | -------------- | -------- | -------------- |
| `/login`       | Login.tsx      | 无需登录 | 独立页面       |
| `/`            | Home.tsx       | 需登录   | 侧边栏         |
| `/ocr`         | OcrTool.tsx    | 需登录   | 侧边栏         |
| `/history`     | History.tsx    | 需登录   | 侧边栏         |
| `/mine`        | Mine.tsx       | 需登录   | 侧边栏         |
| `/settings`    | Settings.tsx   | 需登录   | 侧边栏         |
| `/profile`     | Profile.tsx    | 需登录   | 仅 Header 入口 |
| `/admin`       | Admin.tsx      | 需 admin | 仅 Header 入口 |
| `/admin/users` | AdminUsers.tsx | 需 admin | 仅 Header 入口 |

### 9.2 添加新页面

**Step 1：创建页面组件**

```tsx
// src/pages/Reports.tsx
export default function Reports() {
  return (
    <div style={{ padding: 24, color: 'var(--text-primary)' }}>
      <h1>报表</h1>
    </div>
  )
}
```

**Step 2：添加路由常量**

```tsx
// src/constants/routes.ts — 添加一行
export const ROUTES = {
  HOME: '/',
  OCR: '/ocr',
  // ...
  REPORTS: '/reports', // ← 新增
} as const
```

**Step 3：注册路由**

```tsx
// src/router/routes.ts
const Reports = lazy(() => import('@/pages/Reports')) // ← 懒加载

export const routeCategories: RouteCategory[] = [
  {
    key: 'tools',
    title: '工具箱',
    icon: '⚡',
    routes: [
      { path: ROUTES.HOME, title: '首页', icon: '⌂', component: Home },
      { path: ROUTES.OCR, title: '识别工具', icon: '◈', component: OcrTool },
      { path: ROUTES.HISTORY, title: '历史记录', icon: '◷', component: History },
      { path: ROUTES.REPORTS, title: '报表', icon: '📊', component: Reports }, // ← 新增
    ],
  },
  // ...
]
```

页面自动获得：代码分割、懒加载、页面过渡动画、侧边栏入口、Tab 栏标签。

### 9.3 添加仅 Header 可达的页面

```tsx
export const headerRoutes: AppRoute[] = [
  // ...
  { path: '/my-page', title: '我的页面', icon: '★', component: MyPage, headerOnly: true },
]
```

### 9.4 添加需要管理员权限的页面

```tsx
{
  path: '/admin/reports',
  title: '管理报表',
  icon: '▣',
  component: AdminReports,
  headerOnly: true,
  requireAdmin: true,    // ← 自动检查 admin 角色
}
```

---

## 十、主题系统

### 10.1 三套主题

| 主题                | 风格                          | 动画     |
| ------------------- | ----------------------------- | -------- |
| `cyberpunk`（默认） | 暗色霓虹，青色 + 粉色发光效果 | 全部开启 |
| `ocean`             | 深蓝色调，紫色点缀            | 全部开启 |
| `classic`           | 浅色经典，无发光效果          | 自动关闭 |

### 10.2 在组件中使用主题变量

```tsx
// 内联样式（适合简单场景）
<div style={{
  color: 'var(--text-primary)',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius)',
}}>
  内容
</div>

// LESS 文件（适合复杂组件）
// MyComponent.less
.my-component {
  color: var(--text-primary);
  background: var(--bg-surface);

  &:hover {
    background: var(--bg-hover);
    box-shadow: var(--glow-cyan);
  }
}

// Tailwind（shadcn 组件内部使用）
<div className="bg-background text-foreground border rounded-md">
  shadcn 组件内容
</div>
```

完整 CSS 变量列表见 [附录 A](#附录-acss-变量速查表)。

---

## 十一、组件库（shadcn/ui）

### 11.1 已安装的组件

`Button` · `Input` · `Badge` · `Skeleton` · `Tabs` · `Dialog` · `Table` · `Card` · `Label` · `Form` · `Select`

### 11.2 常用示例

```tsx
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'

// 按钮变体
<Button>默认</Button>
<Button variant="destructive">删除</Button>
<Button variant="outline">边框</Button>
<Button variant="ghost">幽灵</Button>
<Button variant="link">链接</Button>
<Button size="sm">小</Button>
<Button size="lg">大</Button>
<Button disabled>禁用</Button>

// 输入框
<Input placeholder="搜索..." />
<Input type="password" />

// 徽章
<Badge>默认</Badge>
<Badge variant="destructive">错误</Badge>
<Badge variant="outline">边框</Badge>
<Badge variant="secondary">次要</Badge>

// 加载骨架屏
<Skeleton className="h-4 w-[200px]" />
<Skeleton className="h-12 w-full rounded-md" />

// 对话框
<Dialog>
  <DialogTrigger asChild>
    <Button>打开弹窗</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>确认删除</DialogTitle>
    </DialogHeader>
    <p>确定要删除吗？此操作不可撤销。</p>
    <div className="flex justify-end gap-2">
      <Button variant="outline">取消</Button>
      <Button variant="destructive">删除</Button>
    </div>
  </DialogContent>
</Dialog>

// 下拉选择
<Select value={role} onValueChange={setRole}>
  <SelectTrigger>
    <SelectValue placeholder="选择角色" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="user">普通用户</SelectItem>
    <SelectItem value="admin">管理员</SelectItem>
  </SelectContent>
</Select>
```

### 11.3 添加新的 shadcn 组件

```bash
npx shadcn@canary add tooltip -y
npx shadcn@canary add dropdown-menu -y
npx shadcn@canary add checkbox -y
npx shadcn@canary add switch -y
npx shadcn@canary add textarea -y
```

组件自动安装到 `src/components/ui/`，包括所有需要的 `@radix-ui/*` 依赖。

---

## 十二、动画（Framer Motion）

### 12.1 预定义 Variants

```tsx
import { motion } from 'framer-motion'
import { pageVariants, cardVariants, listVariants, itemVariants } from '@/lib/motion'

// 页面入场/退场
<motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
  <h1>页面内容</h1>
</motion.div>

// 列表交错动画（子元素依次出现，间隔 60ms）
<motion.div variants={listVariants} initial="initial" animate="animate">
  {items.map((item) => (
    <motion.div key={item.id} variants={itemVariants}>
      {item.name}
    </motion.div>
  ))}
</motion.div>

// 卡片缩放动画
<motion.div variants={cardVariants} initial="initial" animate="animate" exit="exit">
  <Card>卡片内容</Card>
</motion.div>
```

### 12.2 Variants 定义

| Variant        | initial                        | animate                    | exit                   |
| -------------- | ------------------------------ | -------------------------- | ---------------------- |
| `pageVariants` | opacity: 0, y: 12              | opacity: 1, y: 0           | opacity: 0, y: -8      |
| `cardVariants` | opacity: 0, y: 16, scale: 0.96 | opacity: 1, y: 0, scale: 1 | opacity: 0, scale: 0.9 |
| `listVariants` | —                              | staggerChildren: 0.06      | —                      |
| `itemVariants` | opacity: 0, y: 16              | opacity: 1, y: 0           | —                      |

### 12.3 动画与主题

- `classic` 主题：`MotionConfig reducedMotion="always"` → 所有动画自动禁用
- 其他主题：`reducedMotion="user"` → 尊重操作系统的「减少动态效果」设置

---

## 十三、WebSocket

### 13.1 在组件中使用

```tsx
import { useWebSocket } from '@/hooks/useWebSocket'

function LiveNotifications() {
  const { connected, send } = useWebSocket({
    url: '/ws/notifications',
    enabled: true, // false 则不连接
    onMessage: (data) => {
      console.log('收到消息', data) // 已自动 JSON.parse
    },
  })

  return (
    <div>
      <p>状态: {connected ? '已连接' : '断开'}</p>
      <button onClick={() => send({ type: 'subscribe', channel: 'ocr' })}>订阅 OCR 通知</button>
    </div>
  )
}
```

### 13.2 底层能力（SocketClient）

```tsx
import { SocketClient } from '@/lib/socket'

const ws = new SocketClient({
  url: '/ws/data',
  reconnectDelay: 3000, // 初始重连延迟（自动指数退避到 30s）
  heartbeatInterval: 30000, // 心跳间隔
  onOpen: () => console.log('已连接'),
  onClose: () => console.log('已断开'),
  onError: (err) => console.error(err),
})

ws.connect()

// 监听特定类型的消息
ws.on<{ progress: number }>('ocr-progress', (data) => {
  console.log(`进度: ${data.progress}%`)
})

// 监听所有消息
ws.on('*', (data) => console.log('任意消息', data))

// 发送消息
ws.send({ type: 'start-ocr', fileId: '123' })

// 断开
ws.disconnect()
```

**自动功能：** 心跳 ping（30s）、断线重连（3s → 6s → 12s → ... → 30s 上限）、消息去重。

---

## 十四、国际化（i18n）

### 14.1 添加翻译

```json
// src/locales/zh-CN/common.json
{
  "welcome": "欢迎使用",
  "login": {
    "title": "登录",
    "username": "用户名",
    "password": "密码",
    "submit": "登录"
  }
}
```

```json
// src/locales/en-US/common.json
{
  "welcome": "Welcome",
  "login": {
    "title": "Login",
    "username": "Username",
    "password": "Password",
    "submit": "Sign In"
  }
}
```

### 14.2 在组件中使用

```tsx
import { useTranslation } from 'react-i18next'

function LoginForm() {
  const { t, i18n } = useTranslation()

  return (
    <div>
      <h1>{t('login.title')}</h1>
      <label>{t('login.username')}</label>
      <button>{t('login.submit')}</button>

      {/* 切换语言 */}
      <button
        onClick={() => {
          void i18n.changeLanguage('en-US')
        }}
      >
        English
      </button>
      <button
        onClick={() => {
          void i18n.changeLanguage('zh-CN')
        }}
      >
        中文
      </button>
    </div>
  )
}
```

### 14.3 配置

i18n 在 `src/lib/i18n.ts` 中初始化：

- 默认语言：`zh-CN`
- 回退语言：`en-US`
- 命名空间：`common`
- 自动检测浏览器语言

---

## 十五、运行时配置

`src/lib/config.ts` 提供不需要重新构建即可修改的配置。

```tsx
import { getConfig } from '@/lib/config'

const config = getConfig()
console.log(config.apiBaseUrl) // API 地址
console.log(config.wsUrl) // WebSocket 地址
console.log(config.sentryDsn) // Sentry DSN
console.log(config.features.ocrBatchUpload) // 功能开关
console.log(config.features.adminPanel) // 功能开关
```

**配置来源优先级：**

1. `window.__APP_CONFIG__`（运行时注入，如 Nginx / 后端模板）
2. `VITE_*` 环境变量（构建时）
3. 代码中的默认值

---

## 十六、错误监控（Sentry）

在 `main.tsx` 中初始化，仅生产环境启用：

```tsx
import * as Sentry from '@sentry/react'

// 自动捕获：
// - 未处理的 JS 异常
// - React ErrorBoundary 捕获的渲染错误
// - 性能追踪（tracesSampleRate: 0.2）

// 手动上报：
Sentry.captureException(error)
Sentry.captureMessage('自定义警告')
```

---

## 十七、版本更新检测

`src/lib/version.ts` 定期轮询服务器版本号，当检测到新版本时，`UpdateNotifier` 组件弹出提示。

构建版本号通过 `vite.config.ts` 注入：

```tsx
// 在代码中使用
declare const __APP_VERSION__: string
console.log(__APP_VERSION__) // '0.0.0'（来自 package.json version）
```

---

## 十八、测试

### 18.1 测试框架

- **Vitest**：测试运行器
- **@testing-library/react**：React 组件测试
- **@testing-library/user-event**：用户交互模拟
- **MSW**：API Mock（自动集成到测试环境）

### 18.2 运行

```bash
pnpm test                          # 运行所有测试
pnpm test -- --watch               # 监听模式
pnpm test:coverage                 # 覆盖率报告
pnpm test -- src/stores/           # 只跑某个目录
pnpm test -- --grep "should login" # 只跑匹配的测试
```

### 18.3 写 Store 测试

```tsx
// src/stores/__tests__/theme.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useThemeStore } from '../theme'

describe('ThemeStore', () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: 'cyberpunk' })
  })

  it('should switch theme', () => {
    useThemeStore.getState().setTheme('ocean')
    expect(useThemeStore.getState().theme).toBe('ocean')
  })

  it('should update DOM attribute', () => {
    useThemeStore.getState().setTheme('classic')
    expect(document.documentElement.getAttribute('data-theme')).toBe('classic')
  })
})
```

### 18.4 写组件测试

```tsx
// src/components/__tests__/PermissionGate.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PermissionGate from '../PermissionGate/PermissionGate'
import { useAuthStore } from '@/stores/auth'

describe('PermissionGate', () => {
  it('renders children when user has permission', () => {
    useAuthStore.setState({
      user: { id: '1', username: 'admin', role: 'admin' },
    })

    render(
      <PermissionGate permission="admin:users">
        <p>Admin Panel</p>
      </PermissionGate>
    )

    expect(screen.getByText('Admin Panel')).toBeInTheDocument()
  })

  it('renders fallback when no permission', () => {
    useAuthStore.setState({
      user: { id: '2', username: 'user', role: 'user' },
    })

    render(
      <PermissionGate permission="admin:users" fallback={<p>No Access</p>}>
        <p>Admin Panel</p>
      </PermissionGate>
    )

    expect(screen.getByText('No Access')).toBeInTheDocument()
    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument()
  })
})
```

### 18.5 在测试中覆盖 MSW Handler

默认情况下，测试会使用 `src/mocks/handlers/` 中定义的 mock 数据。单个测试需要不同响应时：

```tsx
import { server } from '@/mocks/server'
import { http, HttpResponse } from 'msw'

it('handles server error gracefully', async () => {
  // 仅在这个测试中替换 handler
  server.use(
    http.get('/api/auth/users', () => {
      return HttpResponse.json({ error: '服务器错误' }, { status: 500 })
    })
  )

  // ... 渲染组件 & 断言错误处理
  // afterEach 会自动 resetHandlers()，不影响其他测试
})
```

---

## 十九、Storybook 组件文档

### 19.1 写 Story

```tsx
// src/components/ui/button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '@/components/ui/button'

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'], // 自动生成文档
}
export default meta

type Story = StoryObj<typeof Button>

export const Default: Story = {
  args: { children: '按钮' },
}

export const Destructive: Story = {
  args: { children: '删除', variant: 'destructive' },
}

export const Outline: Story = {
  args: { children: '边框', variant: 'outline' },
}

export const Small: Story = {
  args: { children: '小按钮', size: 'sm' },
}

export const Loading: Story = {
  args: { children: '加载中...', disabled: true },
}
```

### 19.2 需要 Store 的 Story

```tsx
// src/components/PermissionGate/PermissionGate.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import PermissionGate from './PermissionGate'
import { useAuthStore } from '@/stores/auth'

const meta: Meta<typeof PermissionGate> = {
  title: 'Components/PermissionGate',
  component: PermissionGate,
}
export default meta

export const AdminUser: StoryObj<typeof PermissionGate> = {
  decorators: [
    (Story) => {
      useAuthStore.setState({
        user: { id: '1', username: 'admin', role: 'admin' },
      })
      return <Story />
    },
  ],
  args: {
    permission: 'admin:users',
    children: <div>管理面板（admin 可见）</div>,
    fallback: <div>无权限</div>,
  },
}
```

### 19.3 运行

```bash
pnpm storybook         # http://localhost:6006
pnpm build-storybook   # 构建到 storybook-static/
```

---

## 二十、Git 工作流

### 20.1 代码质量门禁

```
git commit
  ↓ husky pre-commit
  ↓ lint-staged（仅检查暂存文件）
    ├── eslint --fix（自动修复）
    └── prettier --write（自动格式化）
  ↓ commitlint（校验 commit 格式）
  ↓ 提交成功
```

### 20.2 Commit Message 规范

采用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat: add user management page          # 新功能
fix: resolve login redirect loop        # Bug 修复
refactor: simplify auth store logic     # 重构（不改变行为）
chore: update dependencies              # 杂务
ci: add GitHub Actions workflow         # CI/CD
perf: optimize bundle splitting         # 性能优化
test: add permission gate tests         # 测试
docs: update usage guide                # 文档
```

### 20.3 GitHub Actions CI

每次 PR 或推送到 `main`/`develop` 自动运行：

```
TypeScript 检查 → ESLint → 单元测试 → 生产构建 → Storybook 构建
```

配置文件：`.github/workflows/ci.yml`

---

## 二十一、构建与部署

### 21.1 生产构建

```bash
pnpm build
# 产物在 dist/，包含以下 chunk：
#   vendor-react.js    — React + ReactDOM + React Router
#   vendor-motion.js   — Framer Motion
#   vendor-query.js    — TanStack React Query
#   vendor-sentry.js   — Sentry
#   vendor-ui.js       — Radix + Lucide + CVA + Tailwind Merge + clsx
#   index.js           — 应用主入口
#   Login.js           — 登录页（按需加载）
#   OcrTool.js         — OCR 页（按需加载）
#   AdminUsers.js      — 用户管理页（按需加载）
#   ...
```

### 21.2 运行时配置注入

部署时可通过 `public/config.js` 或 Nginx 模板注入配置，无需重新构建：

```html
<!-- index.html 中 -->
<script>
  window.__APP_CONFIG__ = {
    apiBaseUrl: 'https://api.production.com',
    wsUrl: 'wss://ws.production.com',
    sentryDsn: 'https://xxx@sentry.io/123',
    features: {
      ocrBatchUpload: true,
      adminPanel: true,
    },
  }
</script>
```

### 21.3 环境变量

开发时在 `.env` 或 `.env.local` 中设置（不要提交到 Git）：

```
VITE_API_BASE_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
VITE_SENTRY_DSN=
```

---

## 二十二、新增功能的标准流程

以「添加项目管理模块」为例：

| 步骤             | 文件                                   | 说明                                                  |
| ---------------- | -------------------------------------- | ----------------------------------------------------- |
| 1. 定义类型      | `src/types/project.ts`                 | `interface Project { id: string; name: string; ... }` |
| 2. Zod Schema    | `src/schemas/project.ts`               | `CreateProjectSchema = z.object({ ... })`             |
| 3. Service       | `src/services/projects.ts`             | `list()`, `create()`, `update()`, `remove()`          |
| 4. MSW Mock      | `src/mocks/handlers/projects.ts`       | 开发/测试用的 mock 数据                               |
| 5. 页面组件      | `src/pages/Projects.tsx`               | React Query + shadcn 组件                             |
| 6. 路由常量      | `src/constants/routes.ts`              | `REPORTS: '/reports'`                                 |
| 7. 注册路由      | `src/router/routes.ts`                 | `lazy(() => import(...))`，加入 `routeCategories`     |
| 8. 测试          | `src/pages/__tests__/Projects.test.ts` | 渲染测试 + 交互测试                                   |
| 9. Story（可选） | `src/pages/Projects.stories.tsx`       | 组件文档                                              |

**每层职责：types 定义形状 → schemas 校验输入 → services 调 API → pages 组合一切。**

---

## 附录 A：CSS 变量速查表

### 背景色

| 变量             | 用途                     |
| ---------------- | ------------------------ |
| `--bg-primary`   | 页面主背景               |
| `--bg-secondary` | 页面次要背景（如内容区） |
| `--bg-surface`   | 卡片/面板背景            |
| `--bg-panel`     | 侧边栏/Header 背景       |
| `--bg-hover`     | 悬浮状态背景             |

### 文本色

| 变量               | 用途                     |
| ------------------ | ------------------------ |
| `--text-primary`   | 主文本                   |
| `--text-secondary` | 次要文本（说明文字）     |
| `--text-muted`     | 弱化文本（占位符、禁用） |

### 强调色

| 变量             | 用途                         |
| ---------------- | ---------------------------- |
| `--accent-cyan`  | 主强调色（按钮、链接、高亮） |
| `--accent-pink`  | 辅助强调色（警告、删除）     |
| `--accent-green` | 成功色                       |
| `--accent-gold`  | 警告色                       |

### 边框与装饰

| 变量             | 用途                       |
| ---------------- | -------------------------- |
| `--border-color` | 边框颜色                   |
| `--radius`       | 默认圆角                   |
| `--transition`   | 默认过渡时间               |
| `--glow-cyan`    | 青色发光效果（box-shadow） |
| `--glow-pink`    | 粉色发光效果               |

---

## 附录 B：常见问题

### Q: 为什么不用 axios？

当前的 `request.ts` 仅 120 行，功能完整（泛型、token 注入、401 静默刷新、FormData、Blob），引入 axios 会增加 ~13KB 依赖但不增加能力。本项目是纯 SPA，不需要 SSR 的 http adapter。

### Q: ErrorBoundary 为什么是 class 组件？

React 至今没有提供函数组件版的 Error Boundary API。`getDerivedStateFromError` 和 `componentDidCatch` 只有 class 组件能用，这是 React 官方的限制，不是遗留问题。

### Q: 如何添加新主题？

1. 在 `src/index.css` 中添加 `[data-theme="my-theme"]` 块，定义所有 CSS 变量
2. 在 `src/stores/theme.ts` 的 `Theme` 类型和 `THEME_LABELS` 中添加新主题

### Q: 开发时不需要后端？

可以。项目集成了 MSW，开发环境自动拦截 `/api/*` 请求返回 mock 数据。在 `main.tsx` 中通过 `enableMocking()` 条件启动。

### Q: 如何关闭 MSW 使用真实后端？

在 `main.tsx` 中注释掉 `enableMocking()` 调用，或设置环境变量控制。开发服务器已配置代理 `/api → localhost:3000`。

### Q: 样式用 LESS 还是 Tailwind？

两者并存。现有布局组件（Header、Sidebar、Layout 等）使用 LESS + BEM 命名。新增的 shadcn 组件使用 Tailwind。建议新组件优先用 Tailwind，逐步统一。
