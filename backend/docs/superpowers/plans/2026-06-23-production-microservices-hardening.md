# Production Microservices Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing API Gateway + OCR Worker prototype into a production-ready microservice baseline.

**Architecture:** Keep the current Nest API Gateway and OCR Worker split, with BullMQ/Redis for async work, Postgres/Prisma for durable state, and a StoragePort that can use local disk or S3-compatible object storage. Add operational HTTP endpoints for queue status, dead-letter handling, readiness checks, metrics, and a lightweight queue dashboard.

**Tech Stack:** NestJS, BullMQ, Prisma, Postgres, Redis, MinIO/S3-compatible storage, Jest, Docker Compose.

---

### Task 1: Formal Prisma Migration

**Files:**
- Create: `prisma/migrations/20260623000000_init_platform_jobs/migration.sql`
- Modify: `package.json`

- [ ] Add SQL migration containing the current platform, job, and generated file tables.
- [ ] Add `prisma:migrate:deploy` script for production startup.
- [ ] Verify with `pnpm prisma:generate`.

### Task 2: Storage Driver Hardening

**Files:**
- Modify: `src/infrastructure/config/env.schema.ts`
- Modify: `src/infrastructure/storage/storage.module.ts`
- Create: `src/infrastructure/storage/s3-storage.adapter.ts`
- Test: `test/unit/infrastructure/storage/s3-storage.adapter.spec.ts`
- Test: `test/integration/infrastructure/storage/storage.module.spec.ts`

- [ ] Add S3/MinIO env schema keys.
- [ ] Add S3-compatible storage adapter.
- [ ] Select local or S3 adapter based on `STORAGE_DRIVER`.
- [ ] Verify adapter behavior with mocked S3 client.

### Task 3: Queue Operations

**Files:**
- Create: `src/modules/system/queue-admin/queue-admin.module.ts`
- Create: `src/modules/system/queue-admin/interface/http/queue-admin.controller.ts`
- Modify: `src/app.module.ts`
- Test: `test/e2e/queue-admin.spec.ts`

- [ ] Add OCR queue counts endpoint.
- [ ] Add failed jobs list endpoint.
- [ ] Add retry endpoint.
- [ ] Add archive endpoint.
- [ ] Add lightweight HTML dashboard endpoint.

### Task 4: Health, Metrics, and Logging

**Files:**
- Modify: `src/modules/system/health/interface/http/health.controller.ts`
- Modify: `src/modules/system/health/health.module.ts`
- Create: `src/modules/system/metrics/metrics.module.ts`
- Create: `src/modules/system/metrics/interface/http/metrics.controller.ts`
- Modify: `src/infrastructure/logger/app-logger.service.ts`
- Modify: `src/main.ts`
- Test: `test/e2e/app.spec.ts`

- [ ] Add `/api/health/live`.
- [ ] Add `/api/health/ready` checking Postgres, Redis queue, and storage config.
- [ ] Add `/api/system/metrics`.
- [ ] Add service name and instance id to logger.
- [ ] Support `HOST=0.0.0.0` for containers.

### Task 5: OCR Provider Error Governance

**Files:**
- Modify: `src/infrastructure/config/env.schema.ts`
- Modify: `src/workers/ocr/services/baidu-ocr.service.ts`
- Modify: `src/workers/ocr/ocr.processor.ts`
- Test: `test/unit/workers/ocr/baidu-ocr.service.spec.ts`
- Test: `test/unit/workers/ocr/ocr.processor.spec.ts`

- [ ] Add configurable Baidu endpoints and OCR input limits.
- [ ] Add stable internal OCR error codes.
- [ ] Ensure Worker persists provider error codes.

### Task 6: Compose One-Command Runtime

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `package.json`

- [ ] Add API and worker services.
- [ ] Add MinIO service and bucket bootstrap.
- [ ] Add migrate service running `prisma migrate deploy`.
- [ ] Wire health checks and environment variables.
- [ ] Verify Docker if daemon is available.

### Task 7: Full Verification

- [ ] Run `pnpm test:unit`.
- [ ] Run `pnpm test:integration`.
- [ ] Run `pnpm test:e2e`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm build`.
- [ ] Run local HTTP checks for health, metrics, queue dashboard, export, and hairstyle jobs.
