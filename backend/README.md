# RD Manager Workbench backend

Local, single-user NestJS backend for the engineering manager workbench. It retains the core platform's Nest bootstrap, request context, Prisma, logging, filters, response envelope, health check, and local storage/queue boundaries without IAM, tenants, external queues, or remote storage.

## Local database

`DATABASE_URL` must use the local PostgreSQL target below. Configuration rejects other roles, hosts, databases, and schemas.

```text
postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench?schema=app
```

The existing `app.app_metadata` migration is a baseline. Do not run `prisma db push`, `prisma migrate reset`, or destructive database commands.

## Run and verify

```bash
cp .env.example .env
pnpm prisma:generate
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm lint
pnpm build
pnpm start:dev
```

默认后端地址为 `http://127.0.0.1:4311`。若已有本地 `.env`，请确认其中是 `PORT=4311`。

Endpoints are loopback-only in production by default:

- `GET /api/health`
- `GET /api/health/ready`
- `GET /api/workbench/status`
