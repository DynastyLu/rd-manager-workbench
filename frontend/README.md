# Treasure Box Frontend Template

基于 React 19 + TypeScript + Vite 的业务前端工程模板，内置路由、权限、状态管理、请求层、运行时配置、Mock、单测、E2E、Storybook、CI 和 Docker 部署样例。

## 环境要求

- Node.js >= 20
- pnpm 9.x，项目锁定 `pnpm@9.15.1`

## 快速开始

```bash
pnpm install
pnpm dev
```

默认开发地址为 http://localhost:5173。开发态默认启用 MSW Mock；如需直连后端，在 `.env.local` 中设置：

```bash
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://localhost:3000
```

## 常用命令

```bash
pnpm check             # lint + typecheck + unit test + build + storybook build
pnpm lint              # ESLint
pnpm typecheck         # TypeScript
pnpm test              # Vitest
pnpm test:coverage     # Vitest coverage
pnpm test:e2e          # Playwright smoke
pnpm build             # Production build + dist/version.json
pnpm preview           # Preview dist
pnpm storybook         # Storybook dev server
pnpm build-storybook   # Storybook static build
pnpm analyze           # Bundle report at stats.html
```

## 工程能力

- **质量门禁**：`pnpm check` 统一本地和 CI 的基础验证。
- **测试体系**：Vitest + Testing Library + MSW 覆盖单测；Playwright 覆盖浏览器 smoke。
- **运行时配置**：`public/config.js` 可在部署后修改 API、WebSocket、Sentry 和 feature flags，无需重新打包。
- **请求层**：`src/lib/request.ts` 统一 token 注入、401 refresh、错误归一化，并将 `/api/...` 解析到运行时 `apiBaseUrl`。
- **组件文档**：Storybook 已接入，可逐步补齐业务组件和基础组件 stories。
- **部署模板**：`Dockerfile` + `nginx.conf` 提供 SPA fallback、静态资源缓存、`config.js`/`version.json` no-store。
- **依赖维护**：提供 Dependabot 和 Renovate 配置，可按团队习惯启用。

## 生产部署

构建静态产物：

```bash
pnpm build
```

构建 Docker 镜像：

```bash
docker build -t treasure-box-frontend .
docker run --rm -p 8080:80 treasure-box-frontend
```

部署后可通过覆盖 `/usr/share/nginx/html/config.js` 调整环境配置。
