# Microservice Platform Design

## Goal

Upgrade `backend-core-platform` from a NestJS modular monolith into a real task-oriented microservice platform while keeping the current HTTP API stable. The first production microservice target is the `paper-excel-ocr` backend capability set: OCR recognition, Excel export, batch Excel export, and hairstyle transformation.

## Non-Goals

- Do not break existing platform, IAM, audit, health, or `/sys` mock endpoints.
- Do not move every existing module into separate services in the first pass.
- Do not introduce Kafka or RabbitMQ in the first pass.
- Do not require cloud object storage for local development.
- Do not rewrite the frontend as part of the platform framework change.

## Recommended Architecture

Use a task-based microservice architecture:

```text
Frontend
  -> API Gateway / Platform API
  -> PostgreSQL task state
  -> Redis + BullMQ queue
  -> OCR Worker microservice
  -> Local storage adapter
  -> API Gateway result/status/download endpoints
```

The API Gateway remains the only public HTTP entry point. Workers do not expose public HTTP routes. Redis and BullMQ provide job dispatch, retry, delayed execution, progress, and worker scaling. PostgreSQL stores durable job/file metadata. Storage adapters persist generated files such as Excel workbooks and transformed images.

## Why BullMQ + Redis

OCR, Excel generation, and image transformation are slow or failure-prone operations. They call external services, process binary payloads, and may need retries. A queue-based worker model is a better fit than synchronous RPC because it avoids long HTTP blocking, supports progress and retry, and allows workers to scale independently.

TCP microservices are useful for quick RPC, but they do not solve long-running task durability, retry, or progress. Kafka/RabbitMQ can be introduced in a future transport phase, but they are heavier than needed for this project stage.

## Application Structure

The repository should move toward this structure:

```text
backend-core-platform/
  apps/
    api-gateway/
      src/main.ts
      src/api-gateway.module.ts
      src/modules/tools/
      src/modules/jobs/
      src/modules/files/
    ocr-worker/
      src/main.ts
      src/ocr-worker.module.ts
      src/processors/
      src/services/
  libs/
    contracts/
      src/jobs/
      src/ocr/
      src/excel/
      src/hairstyle/
    storage/
      src/storage.port.ts
      src/local-storage.adapter.ts
    queue/
      src/queue-names.ts
      src/bullmq.module.ts
  src/
    existing platform modules during migration
```

The first implementation can keep existing `src` modules in place and introduce `apps`/`libs` incrementally. `src/main.ts` can be preserved as the API Gateway bootstrap until the app move is complete, to reduce migration risk.

## Public API Contract

Existing endpoints must keep their current paths and response semantics:

- `GET /api/health`
- `POST /api/platform/tenants`
- `GET /api/platform/tenants`
- `POST /api/iam/users`
- `GET /api/iam/users`
- `POST /api/iam/roles`
- `GET /api/iam/roles`
- `POST /api/system/audit/logs`
- `GET /api/system/audit/logs`
- `/sys/...` AI assistant mock endpoints

New task endpoints should be additive:

- `POST /api/tools/ocr/jobs`
- `GET /api/tools/ocr/jobs/:jobId`
- `GET /api/tools/ocr/jobs/:jobId/result`
- `POST /api/tools/excel/jobs`
- `GET /api/tools/excel/jobs/:jobId`
- `POST /api/tools/hairstyle/jobs`
- `GET /api/tools/hairstyle/jobs/:jobId`
- `GET /api/files/:fileId/download`

Compatibility endpoints for `paper-excel-ocr` should also be supported during migration:

- `POST /api/recognize`
- `POST /api/export`
- `POST /api/export-batch`
- `POST /api/hairstyle/transform`

The compatibility endpoints create queue jobs internally and wait briefly for completion. If a job completes within the configured sync timeout, they return the old response shape. If it is still running, they return `202 Accepted` with a `jobId`, status URL, and result URL.

## Job Model

Jobs use these states:

```text
queued -> processing -> succeeded
                    -> failed
                    -> canceled
```

Each job record stores:

- `id`
- `type`
- `status`
- `queueJobId`
- `tenantId`
- `tenantKey`
- `operatorId`
- `traceId`
- `input`
- `result`
- `errorCode`
- `errorMessage`
- `attempts`
- `progress`
- `createdAt`
- `startedAt`
- `finishedAt`

The first migration can store input/result JSON in PostgreSQL. Binary output should be stored through the storage adapter, with only file metadata and storage keys stored in PostgreSQL.

## File Model

Generated files and transformed images use a file metadata record:

- `id`
- `jobId`
- `kind`
- `filename`
- `mimeType`
- `size`
- `storageKey`
- `createdAt`

The first adapter is local disk storage under a configurable directory such as `var/storage`. The interface must allow future S3/OSS/MinIO adapters without changing job processors.

## Worker Responsibilities

The OCR Worker owns:

- Baidu OCR adapter
- Excel generation adapter
- batch Excel generation adapter
- hairstyle transformation adapter
- job progress updates
- retry-safe processor behavior
- generated file persistence

The worker must not import HTTP controllers from the API Gateway. Shared types and queue names must come from `libs/contracts` and `libs/queue`.

## API Gateway Responsibilities

The API Gateway owns:

- HTTP upload and download
- request validation
- request context and trace propagation
- authentication/tenant policy hooks when available
- job creation
- job status/result lookup
- audit event recording
- old endpoint compatibility

The API Gateway does not run OCR or Excel business logic directly after migration, except small input validation and compatibility response shaping.

## Existing Interface Compatibility

Current `backend-core-platform` interfaces are protected by these rules:

- Existing controller paths are not renamed.
- Existing response wrapper behavior is not changed.
- Existing global prefix exclusions for `/sys/...` are preserved.
- Existing tests must still pass after the microservice infrastructure is added.
- New binary download endpoints must bypass JSON response wrapping locally rather than changing the global interceptor for all routes.

## Configuration

Required new environment variables:

- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD` optional
- `QUEUE_PREFIX`
- `JOB_SYNC_TIMEOUT_MS`
- `STORAGE_DRIVER=local`
- `LOCAL_STORAGE_ROOT`
- `OCR_WORKER_CONCURRENCY`

Existing `NODE_ENV`, `PORT`, and `DATABASE_URL` remain unchanged.

## Local Development

Local development should support:

- `pnpm start:dev:api`
- `pnpm start:dev:ocr-worker`
- `pnpm dev:redis` or `docker compose up redis`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:e2e`

The first Docker Compose file should only include Redis unless PostgreSQL is already managed there.

## Error Handling

Worker errors are normalized into job errors:

- external service timeout
- unsupported file type
- OCR provider error
- Excel generation error
- storage write/read error
- validation error

Compatibility endpoints map these back into the old response shape when they complete synchronously. Task endpoints return job status and normalized error fields.

## Idempotency and Retry

Job processors must be retry-safe:

- The API Gateway owns job creation and durable job IDs.
- Worker processors update the same job record instead of creating duplicate logical jobs.
- Generated files should use job-scoped storage keys.
- Retried jobs overwrite or version job-scoped output deterministically.
- External provider calls should not be retried indefinitely.

## Testing Strategy

Required verification:

- Existing unit tests still pass.
- Existing integration tests still pass.
- Existing e2e smoke test still passes.
- New contract tests validate queue names and DTO shapes.
- New API Gateway tests validate job creation, status lookup, and compatibility behavior.
- New worker unit tests validate processor success/failure transitions.
- Storage adapter tests validate local file write/read/delete.

## Migration Phases

1. Add contracts, queue, storage, and job infrastructure without changing existing routes.
2. Add API Gateway job endpoints.
3. Add OCR Worker with minimal runnable processors that update job status, progress, success output, and failure output.
4. Migrate `paper-excel-ocr` OCR/Excel/hairstyle services into worker services.
5. Add compatibility endpoints for old `paper-excel-ocr` routes.
6. Switch frontend gradually from compatibility endpoints to task endpoints.

## Risks

- Redis adds a new runtime dependency.
- Queue jobs require cleanup and retention policies.
- Large file uploads cannot be held only in memory long term.
- Binary downloads need explicit response handling.
- Existing global interceptors and filters must be tested after adding file routes.
- Worker failure modes need clear observability before production.

## Success Criteria

- Existing API behavior remains stable.
- API Gateway and OCR Worker run as separate processes.
- OCR tasks are executed by the worker through BullMQ.
- Job status/result endpoints work end to end.
- Compatibility endpoints allow the existing frontend to keep working during migration.
- The system can run locally with Redis and without cloud storage.
