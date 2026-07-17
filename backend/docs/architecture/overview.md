# Architecture Overview

`backend-core-platform` is a NestJS modular monolith scaffold for a SaaS admin backend.

## Layers

- `src/main.ts` bootstraps the HTTP application, global validation, and response/error shaping.
- `src/app.module.ts` wires the root modules.
- `src/infrastructure` holds cross-cutting concerns such as config, request context, logging, Prisma boundaries, and response/error handling.
- `src/modules` contains business modules with DDD-lite boundaries:
  - `application` for use cases
  - `domain` for entities and repository contracts
  - `infrastructure` for in-memory or persistence adapters
  - `interface/http` for REST controllers and DTOs
- `src/shared` contains shared contracts, decorators, kernel types, and error primitives.

## Request Context

Request handling starts with a provisional transport-aware context:

- `traceId`
- `requestScope`
- raw transport metadata

Tenant/operator identity is promoted only through the explicit policy resolver path. Business modules should not trust raw headers directly.

## Tenancy

The platform is modeled as shared database plus multiple schemas.

- Platform-scoped data stays in the platform boundary.
- Tenant-scoped data is routed through a stateless tenant target resolver.
- Tenant schema derivation is deterministic and collision-safe.

## Example Modules

The first runnable business modules are intentionally small and use in-memory repository adapters behind stable repository interfaces:

- `platform/tenant`
- `iam/user`
- `iam/role`
- `system/audit`
- `system/health`

This keeps the modules runnable while preserving the interfaces needed for later Prisma-backed adapters.

## API Shape

The current HTTP surface is REST-first and grouped by area:

- `GET /api/health`
- `POST /api/platform/tenants`
- `GET /api/platform/tenants`
- `POST /api/iam/users`
- `GET /api/iam/users`
- `POST /api/iam/roles`
- `GET /api/iam/roles`
- `POST /api/system/audit/logs`
- `GET /api/system/audit/logs`

## Tests

The repository includes:

- unit tests for core foundations and use cases
- integration tests for request context and audit behavior
- an e2e smoke test that exercises the Nest HTTP stack without requiring an open network socket

