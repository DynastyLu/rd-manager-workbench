# 研发主管工作台

本地单用户研发工作台入口，保留 Treasure Box 的 React 19、TypeScript、Vite、Tailwind/shadcn、React Query、Zustand 主题、i18n、错误边界、Layout/Sidebar/Header 和通用构建测试能力。

## 快速开始

```bash
pnpm install --ignore-workspace
pnpm dev
```

默认开发地址为 http://localhost:5173。应用使用 HashRouter，入口为 `#/` 和 `#/settings`。

## 常用命令

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`public/config.js` 仅保留可在部署后修改的 Sentry DSN。当前工作台不包含登录、用户管理、Mock、OCR 或其他旧业务工具。
