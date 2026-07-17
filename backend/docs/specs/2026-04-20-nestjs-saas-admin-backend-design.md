# NestJS SaaS Admin Backend Design

This document is the repo-local copy of the approved design spec for `backend-core-platform`.

## Goal

Build a runnable NestJS + TypeScript + Prisma + PostgreSQL modular monolith for a SaaS admin platform with platform/tenant boundaries, tenant-aware request context, and example business modules.

## Core Principles

- Modular monolith with clear DDD-lite boundaries
- REST-first API design
- Explicit trust boundaries for request context and tenant identity
- Shared database, multiple schemas tenancy model
- Prisma behind infrastructure abstractions
- Business modules remain runnable before Prisma-backed persistence is introduced

## Request Context

Request context is first created from provisional transport metadata.

- `traceId`
- `requestScope` (`platform` or `tenant`)
- raw tenant/operator transport metadata

Trusted tenant/operator identity is populated later through explicit resolver/policy flow.

## Tenancy

Tenant schema derivation is deterministic and collision-safe, using a normalized tenant key plus a stable hash suffix.

## Repository and Persistence

The first runnable example modules may use in-memory repository adapters behind stable repository interfaces.

That choice is a staging implementation detail, not a change to the architectural boundary. The repository interfaces and module boundaries remain ready for Prisma-backed adapters later.

## Runnable Example Modules

The approved runnable demonstration surface includes:

- `platform/tenant`
- `iam/user`
- `iam/role`
- `system/audit`
- `system/health`

These modules are intended to show:

- platform versus tenant separation
- trusted context promotion through policy/resolver flow
- scoped tenant/user/role/audit behavior
- health and bootstrap endpoints

## Verification Expectations

The repository should include unit, integration, e2e smoke, lint, and build verification that all pass from the repo root.

