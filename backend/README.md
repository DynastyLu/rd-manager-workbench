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

开发服务固定监听 `http://127.0.0.1:4311`，避免占用旧项目的默认端口。请先从 `.env.example` 复制出 `.env`；Vite 前端默认请求 `http://127.0.0.1:4311/api`。

DOC/DOCX、XLS/XLSX、PPT/PPTX 等 Office 文件的保真 PDF 预览依赖 LibreOffice。系统会自动查找常见安装位置；如果安装在自定义目录，请在 `.env` 中设置 `LIBREOFFICE_BIN` 为 `soffice` 的绝对路径。未安装时原文件仍可下载或用本机应用打开，页面会显示可读提示，不会嵌入后端错误响应。

Endpoints are loopback-only by default:

- `GET /api/health`
- `GET /api/health/ready`
- `GET /api/workbench/status`

## Authentication and authorization

The backend now enforces enterprise authentication and RBAC on all non-public routes:

- Passwords are hashed with Argon2id (19456 KiB, time cost 2, parallelism 1) and must be at least 10 characters with a letter and a digit.
- Access Tokens are short-lived JWTs signed with `JWT_SECRET`. Refresh Tokens are 256-bit random values, stored as SHA-256 hashes, and rotated on every use.
- Refresh tokens are delivered as `HttpOnly`, `Secure`, `SameSite=Strict` cookies. A matching `X-CSRF-Token` header is required for refresh and state-changing requests.
- Global `AuthenticationGuard` rejects anonymous requests; `PermissionGuard` enforces permission codes and data scopes (`SELF`, `INVOLVED`, `DEPARTMENT`, `PROJECT`, `ALL`).
- Public endpoints are limited to health checks, bootstrap status, login, CSRF, refresh, and logout.

## Operations

### One-time bootstrap

When the `users` table is empty, the backend automatically creates a default super administrator on startup:

- Default username: `admin`
- Default employee number: `ADMIN`
- Default password: `RdManager2026!`
- The account is bound to an auto-created `ResourceProfile` named `系统管理员`.
- First login requires a password change (`mustChangePassword: true`).

Override the defaults in `.env` with `DEFAULT_ADMIN_USERNAME` and `DEFAULT_ADMIN_PASSWORD`. In `NODE_ENV=prod`, using the default password is rejected; you must set a strong value before the application will start.

### Reset a password

An administrator can call `POST /api/admin/users/:id/reset-password` to generate a temporary password. The target user must change it on the next login.

### Rotate JWT secrets

1. Update `JWT_SECRET` and `JWT_REFRESH_SECRET` in `.env`.
2. Restart the backend process.
3. Existing access tokens expire naturally; call `POST /api/admin/users/:id/revoke-sessions` to force all active sessions for a user to re-authenticate.

### Recover when the last administrator is locked

If the only super administrator is locked out, use a database administrator connection to update the user's record:

```sql
UPDATE "app"."users"
SET "failed_login_count" = 0,
    "locked_until" = NULL,
    "status" = 'ACTIVE'
WHERE "username" = 'admin';
```

Then have the user log in again. If the password is forgotten, there is no back-door reset; you must either know the password or set a new Argon2id hash directly in the database and force a password change on next login.

### Clean migration verification

Use the following command to verify that a fresh temporary database can run all migrations from baseline:

```bash
pnpm verify:migrations:clean
```

This creates and drops a database prefixed with `rdmw_verify_`. If the application role cannot create databases, set `DATABASE_ADMIN_URL` to a PostgreSQL superuser connection.
