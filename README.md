# 研发主管本地工作台

此仓库直接迁入并保留两个真实工程：

- `frontend/`：基于 treasure-box 的 Vite、React 和 TypeScript 前端工程。
- `backend/`：基于 backend-core-platform 的 NestJS、Prisma 和 PostgreSQL 后端工程。

二者均是独立项目，各自维护自己的 `package.json`、锁文件、配置和命令；根目录不是 pnpm workspace。

## 前端

```sh
cd frontend
cp .env.example .env
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm dev
```

前端仅监听 `http://127.0.0.1:4312/#/`，端口被占用时会直接报错；开发环境默认请求后端 `http://127.0.0.1:4311/api`。

## 后端

先从 `backend/.env.example` 创建本地环境文件并按本机 PostgreSQL 配置 `DATABASE_URL`，再运行：

```sh
cd backend
cp .env.example .env
pnpm install
pnpm prisma:generate
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm lint
pnpm build
pnpm start:dev
```

后端仅监听 `http://127.0.0.1:4311`。两个端口均与旧项目的默认端口隔离，不会自动切换到其他端口。

可用 `pnpm prisma migrate status` 检查本地数据库迁移状态。

## 本地文件

根目录及两个项目的 `.env`、`.env.*` 本地环境文件均被忽略，`.env.example` 不受忽略规则影响，仍可提交。当前可用模板为 `frontend/.env.example` 与 `backend/.env.example`；请不要提交真实凭据。根 `.worktrees/`、两个项目的 `node_modules/`、构建与测试产物及运行时数据也均被忽略。
