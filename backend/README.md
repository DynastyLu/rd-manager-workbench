# backend-core-platform

NestJS + TypeScript + Prisma + PostgreSQL scaffold for a SaaS admin backend.

## Bootstrap

```bash
pnpm install
cp .env.example .env
pnpm prisma:generate
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm lint
pnpm build
pnpm start:dev
```

## Environment

Required variables:

- `NODE_ENV=local|dev|test|prod`
- `PORT`
- `DATABASE_URL`

## Request Context

Request handling starts with provisional transport metadata only.

- `x-trace-id`
- `x-request-scope`
- `x-tenant-id`
- `x-tenant-key`
- `x-operator-id`
- `x-operator-type`

Trusted tenant/operator identity is promoted later through the explicit policy/resolver path. Raw headers stay transport metadata and should not be treated as canonical business identity.

## Modules

Runnable example endpoints:

- `GET /api/health`
- `POST /api/platform/tenants`
- `GET /api/platform/tenants`
- `POST /api/iam/users`
- `GET /api/iam/users`
- `POST /api/iam/roles`
- `GET /api/iam/roles`
- `POST /api/system/audit/logs`
- `GET /api/system/audit/logs`

## Verification

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm lint
pnpm build
```

## Notes

- Prisma is isolated behind stateless platform/tenant database targeting abstractions.
- Tenant schema derivation is deterministic and collision-safe.
- The repository intentionally starts as a modular monolith with clear boundaries.
