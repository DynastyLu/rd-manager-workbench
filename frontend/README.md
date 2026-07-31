# 研发主管工作台

本地单用户研发工作台入口，保留 Treasure Box 的 React 19、TypeScript、Vite、Tailwind/shadcn、React Query、Zustand 主题、i18n、错误边界、Layout/Sidebar/Header 和通用构建测试能力。

## 快速开始

```bash
cp .env.example .env
pnpm install --ignore-workspace
pnpm dev
```

默认开发地址为 `http://127.0.0.1:4312/#/`，并且只监听本机回环地址；端口被占用时会直接报错，不会自动改用其他端口。开发环境默认请求后端 `http://127.0.0.1:4311/api`。应用使用 HashRouter，入口为 `#/` 和 `#/settings`。

## 常用命令

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

## 认证与会话

前端使用内存 Access Token + HttpOnly Refresh Cookie 的会话模型。登录后 access token 保存在 `useAuthStore` 中，刷新由请求拦截器在并发 401 时单例完成，避免多请求同时刷新。

- 首次启动且数据库无用户时，前端自动进入 `/setup-admin` 一次性管理员初始化。
- 首次登录使用临时密码后，必须强制修改密码才能进入应用。
- 账号被停用、会话被撤销或 refresh token 过期后，客户端会清除本地会话并返回登录页。
- 个人安全页（`#/settings/security`）可修改密码、查看当前会话并强制退出全部设备。

## 开发边界

- `public/config.js` 仅保留可在部署后修改的 Sentry DSN。
- 开发环境默认请求 `http://127.0.0.1:4311/api`；Electron 正式包通过 preload 注入运行时 API 基址，不能依赖 `import.meta.env.DEV` 判断基址。
- 当前工作台已移除旧 Mock、OCR 和其他不相关业务能力。
