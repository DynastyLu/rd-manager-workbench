# Microservice Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `backend-core-platform` into a real BullMQ/Redis-backed task microservice platform while preserving all existing HTTP APIs.

**Architecture:** Keep the existing Nest HTTP app as the API Gateway during the first migration. Add Redis/BullMQ queue infrastructure, durable job/file records, a local storage adapter, and a separate OCR Worker process. Migrate `paper-excel-ocr` backend capabilities behind worker processors and expose additive task APIs plus compatibility routes.

**Tech Stack:** NestJS 10, TypeScript, Prisma, PostgreSQL, Redis, BullMQ, `@nestjs/bullmq`, local filesystem storage, Jest.

---

## File Structure

Create and modify these areas:

- `package.json`: add queue dependencies and scripts.
- `docker-compose.yml`: add local Redis.
- `src/infrastructure/config/env.schema.ts`: add Redis, queue, storage, and worker env validation.
- `src/infrastructure/queue/`: queue module and queue constants.
- `src/shared/contracts/jobs/`: job status, job type, payload/result contracts.
- `src/modules/system/jobs/`: job repository, use cases, controller.
- `src/modules/system/files/`: file metadata repository and download controller.
- `src/infrastructure/storage/`: storage port and local adapter.
- `src/workers/ocr-worker.main.ts`: separate worker process entry.
- `src/workers/ocr/`: worker module and processors.
- `src/modules/tools/ocr/`: API Gateway task and compatibility HTTP controller.
- `src/modules/tools/hairstyle/`: API Gateway task and compatibility HTTP controller.
- `prisma/schema.prisma`: additive `Job` and `GeneratedFile` models.
- `test/unit/**`: contract, storage, processor, and use case tests.
- `test/integration/**`: queue/gateway compatibility tests.
- `test/e2e/app.spec.ts`: prove current endpoints still work.

## Task 1: Add Queue and Runtime Configuration

**Files:**
- Modify: `package.json`
- Modify: `src/infrastructure/config/env.schema.ts`
- Create: `docker-compose.yml`
- Test: `test/unit/infrastructure/config/env.schema.spec.ts`

- [ ] **Step 1: Write failing config tests**

Add test cases that expect these env values to be accepted:

```ts
const validEnv = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/backend_core',
  REDIS_HOST: '127.0.0.1',
  REDIS_PORT: '6379',
  QUEUE_PREFIX: 'backend-core-platform',
  JOB_SYNC_TIMEOUT_MS: '25000',
  STORAGE_DRIVER: 'local',
  LOCAL_STORAGE_ROOT: 'var/storage',
  OCR_WORKER_CONCURRENCY: '2',
};
```

Expected parsed values:

```ts
expect(parsed.REDIS_HOST).toBe('127.0.0.1');
expect(parsed.REDIS_PORT).toBe(6379);
expect(parsed.JOB_SYNC_TIMEOUT_MS).toBe(25000);
expect(parsed.STORAGE_DRIVER).toBe('local');
expect(parsed.OCR_WORKER_CONCURRENCY).toBe(2);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test:unit -- test/unit/infrastructure/config/env.schema.spec.ts
```

Expected: fails because the new env fields are not defined.

- [ ] **Step 3: Add dependencies and scripts**

Modify `package.json`:

```json
{
  "scripts": {
    "start:dev:api": "nest start --watch",
    "start:dev:ocr-worker": "nest start --watch --entryFile workers/ocr-worker.main",
    "dev:redis": "docker compose up redis"
  },
  "dependencies": {
    "@nestjs/bullmq": "^10.2.3",
    "bullmq": "^5.58.5",
    "ioredis": "^5.8.2"
  }
}
```

Preserve all existing scripts and dependencies.

- [ ] **Step 4: Add Redis compose service**

Create `docker-compose.yml`:

```yaml
services:
  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

- [ ] **Step 5: Extend env schema**

Add defaults:

```ts
REDIS_HOST: z.string().default('127.0.0.1'),
REDIS_PORT: z.coerce.number().int().positive().default(6379),
REDIS_PASSWORD: z.string().optional(),
QUEUE_PREFIX: z.string().min(1).default('backend-core-platform'),
JOB_SYNC_TIMEOUT_MS: z.coerce.number().int().positive().default(25000),
STORAGE_DRIVER: z.enum(['local']).default('local'),
LOCAL_STORAGE_ROOT: z.string().min(1).default('var/storage'),
OCR_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
```

- [ ] **Step 6: Run test to verify it passes**

Run:

```bash
pnpm test:unit -- test/unit/infrastructure/config/env.schema.spec.ts
```

Expected: passes.

## Task 2: Add Shared Job Contracts

**Files:**
- Create: `src/shared/contracts/jobs/job-status.ts`
- Create: `src/shared/contracts/jobs/job-type.ts`
- Create: `src/shared/contracts/jobs/job-contracts.ts`
- Create: `src/shared/contracts/jobs/queue-names.ts`
- Test: `test/unit/shared/contracts/jobs/job-contracts.spec.ts`

- [ ] **Step 1: Write failing contract tests**

```ts
import { JobStatus } from '../../../../../src/shared/contracts/jobs/job-status';
import { JobType } from '../../../../../src/shared/contracts/jobs/job-type';
import { QueueNames } from '../../../../../src/shared/contracts/jobs/queue-names';

describe('job contracts', () => {
  it('defines stable job statuses', () => {
    expect(JobStatus.Queued).toBe('queued');
    expect(JobStatus.Processing).toBe('processing');
    expect(JobStatus.Succeeded).toBe('succeeded');
    expect(JobStatus.Failed).toBe('failed');
    expect(JobStatus.Canceled).toBe('canceled');
  });

  it('defines OCR worker queue names and job types', () => {
    expect(QueueNames.Ocr).toBe('ocr');
    expect(JobType.OcrRecognize).toBe('ocr.recognize');
    expect(JobType.ExcelExport).toBe('excel.export');
    expect(JobType.ExcelExportBatch).toBe('excel.exportBatch');
    expect(JobType.HairstyleTransform).toBe('hairstyle.transform');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test:unit -- test/unit/shared/contracts/jobs/job-contracts.spec.ts
```

Expected: fails because contract files do not exist.

- [ ] **Step 3: Implement contracts**

Create:

```ts
export enum JobStatus {
  Queued = 'queued',
  Processing = 'processing',
  Succeeded = 'succeeded',
  Failed = 'failed',
  Canceled = 'canceled',
}
```

```ts
export enum JobType {
  OcrRecognize = 'ocr.recognize',
  ExcelExport = 'excel.export',
  ExcelExportBatch = 'excel.exportBatch',
  HairstyleTransform = 'hairstyle.transform',
}
```

```ts
export const QueueNames = {
  Ocr: 'ocr',
} as const;
```

Create `job-contracts.ts` with payload/result interfaces:

```ts
export interface OcrRecognizePayload {
  imageBase64: string;
  mimeType: string;
  originalName: string;
}

export interface ExcelExportPayload {
  rows: string[][];
  mergedCells: Array<{ startRow: number; startCol: number; endRow: number; endCol: number }>;
}

export interface ExcelExportBatchPayload {
  sheets: Array<{ name: string; rows: string[][]; mergedCells: ExcelExportPayload['mergedCells'] }>;
}

export interface HairstyleTransformPayload {
  imageBase64: string;
  mimeType: string;
  originalName: string;
  style: string;
}

export interface JobFileResult {
  fileId: string;
  filename: string;
  mimeType: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm test:unit -- test/unit/shared/contracts/jobs/job-contracts.spec.ts
```

Expected: passes.

## Task 3: Add Job and File Persistence Models

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `test/unit/modules/system/jobs/job.entity.spec.ts`

- [ ] **Step 1: Add model shape test**

Create a domain test that imports the planned enums and checks status transitions:

```ts
import { JobStatus } from '../../../../../src/shared/contracts/jobs/job-status';

describe('job status transitions', () => {
  it('supports queued to processing to succeeded', () => {
    expect([JobStatus.Queued, JobStatus.Processing, JobStatus.Succeeded]).toEqual([
      'queued',
      'processing',
      'succeeded',
    ]);
  });
});
```

- [ ] **Step 2: Add Prisma models**

Append to `prisma/schema.prisma`:

```prisma
enum JobStatus {
  QUEUED
  PROCESSING
  SUCCEEDED
  FAILED
  CANCELED
}

model Job {
  id           String      @id @default(cuid())
  type         String
  status       JobStatus   @default(QUEUED)
  queueJobId   String?     @map("queue_job_id")
  tenantId     String?     @map("tenant_id")
  tenantKey    String?     @map("tenant_key")
  operatorId   String?     @map("operator_id")
  traceId      String?     @map("trace_id")
  input        Json?
  result       Json?
  errorCode    String?     @map("error_code")
  errorMessage String?     @map("error_message")
  attempts     Int         @default(0)
  progress     Int         @default(0)
  createdAt    DateTime    @default(now()) @map("created_at")
  startedAt    DateTime?   @map("started_at")
  finishedAt   DateTime?   @map("finished_at")
  files        GeneratedFile[]

  @@index([type, status])
  @@index([tenantId])
  @@map("jobs")
}

model GeneratedFile {
  id         String   @id @default(cuid())
  jobId      String   @map("job_id")
  kind       String
  filename   String
  mimeType   String   @map("mime_type")
  size       Int
  storageKey String   @map("storage_key")
  createdAt  DateTime @default(now()) @map("created_at")
  job        Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@index([jobId])
  @@map("generated_files")
}
```

- [ ] **Step 3: Generate Prisma client**

Run:

```bash
pnpm prisma:generate
```

Expected: Prisma client generation succeeds.

## Task 4: Add Storage Adapter

**Files:**
- Create: `src/infrastructure/storage/storage.port.ts`
- Create: `src/infrastructure/storage/local-storage.adapter.ts`
- Create: `src/infrastructure/storage/storage.module.ts`
- Test: `test/unit/infrastructure/storage/local-storage.adapter.spec.ts`

- [ ] **Step 1: Write failing storage test**

```ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageAdapter } from '../../../../src/infrastructure/storage/local-storage.adapter';

describe('LocalStorageAdapter', () => {
  it('writes and reads a file by storage key', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backend-core-storage-'));
    const adapter = new LocalStorageAdapter(root);

    const saved = await adapter.write({
      key: 'jobs/job-1/result.txt',
      content: Buffer.from('hello'),
      mimeType: 'text/plain',
    });

    const read = await adapter.read(saved.storageKey);
    expect(read.content.toString()).toBe('hello');
    expect(read.mimeType).toBe('text/plain');

    await rm(root, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Implement storage port**

```ts
export interface StorageWriteInput {
  key: string;
  content: Buffer;
  mimeType: string;
}

export interface StorageReadOutput {
  content: Buffer;
  mimeType: string;
}

export abstract class StoragePort {
  abstract write(input: StorageWriteInput): Promise<{ storageKey: string; size: number }>;
  abstract read(storageKey: string): Promise<StorageReadOutput>;
  abstract delete(storageKey: string): Promise<void>;
}
```

- [ ] **Step 3: Implement local adapter**

Use `mkdir`, `writeFile`, `readFile`, `rm` from `node:fs/promises`. Keep all paths under `LOCAL_STORAGE_ROOT` by resolving the final path and checking it starts with the resolved root.

- [ ] **Step 4: Run storage test**

Run:

```bash
pnpm test:unit -- test/unit/infrastructure/storage/local-storage.adapter.spec.ts
```

Expected: passes.

## Task 5: Add Queue Module

**Files:**
- Create: `src/infrastructure/queue/queue.module.ts`
- Modify: `src/app.module.ts`
- Test: `test/integration/infrastructure/queue/queue.module.spec.ts`

- [ ] **Step 1: Write module compilation test**

```ts
import { Test } from '@nestjs/testing';
import { QueueInfrastructureModule } from '../../../../src/infrastructure/queue/queue.module';

describe('QueueInfrastructureModule', () => {
  it('compiles without connecting to Redis in test env', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [QueueInfrastructureModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
```

- [ ] **Step 2: Implement queue module**

Use `BullModule.forRootAsync` with `ConfigService`:

```ts
BullModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    connection: {
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: config.getOrThrow<number>('REDIS_PORT'),
      password: config.get<string>('REDIS_PASSWORD'),
    },
    prefix: config.getOrThrow<string>('QUEUE_PREFIX'),
  }),
})
```

Register OCR queue:

```ts
BullModule.registerQueue({ name: QueueNames.Ocr })
```

- [ ] **Step 3: Import queue module in root module**

Add `QueueInfrastructureModule` to `AppModule` imports. Do not modify existing imports besides adding this one.

- [ ] **Step 4: Run module test**

Run:

```bash
pnpm test:integration -- test/integration/infrastructure/queue/queue.module.spec.ts
```

Expected: passes.

## Task 6: Add OCR Worker Process

**Files:**
- Create: `src/workers/ocr-worker.main.ts`
- Create: `src/workers/ocr/ocr-worker.module.ts`
- Create: `src/workers/ocr/ocr.processor.ts`
- Test: `test/unit/workers/ocr/ocr.processor.spec.ts`

- [ ] **Step 1: Write failing processor test**

```ts
import { OcrProcessor } from '../../../../src/workers/ocr/ocr.processor';
import { JobStatus } from '../../../../src/shared/contracts/jobs/job-status';

describe('OcrProcessor', () => {
  it('returns a minimal success result for a recognize job', async () => {
    const processor = new OcrProcessor();
    const result = await processor.handleRecognize({
      id: 'job-1',
      data: { imageBase64: 'ZmFrZQ==', mimeType: 'image/png', originalName: 'a.png' },
    } as never);

    expect(result.status).toBe(JobStatus.Succeeded);
    expect(result.result).toEqual({ rows: [], mergedCells: [] });
  });
});
```

- [ ] **Step 2: Implement minimal processor**

Implement class methods for:

- `handleRecognize`
- `handleExcelExport`
- `handleExcelExportBatch`
- `handleHairstyleTransform`

Each method returns a typed result object and does no external provider call in this task.

- [ ] **Step 3: Add worker bootstrap**

Create `ocr-worker.main.ts`:

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { OcrWorkerModule } from './ocr/ocr-worker.module';
import { AppLoggerService } from '../infrastructure/logger/app-logger.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(OcrWorkerModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(AppLoggerService));
}

void bootstrap();
```

- [ ] **Step 4: Run processor test**

Run:

```bash
pnpm test:unit -- test/unit/workers/ocr/ocr.processor.spec.ts
```

Expected: passes.

## Task 7: Add Job API Module

**Files:**
- Create: `src/modules/system/jobs/jobs.module.ts`
- Create: `src/modules/system/jobs/domain/job.repository.ts`
- Create: `src/modules/system/jobs/infrastructure/in-memory-job.repository.ts`
- Create: `src/modules/system/jobs/application/create-job.use-case.ts`
- Create: `src/modules/system/jobs/application/get-job.use-case.ts`
- Create: `src/modules/system/jobs/interface/http/jobs.controller.ts`
- Modify: `src/app.module.ts`
- Test: `test/unit/modules/system/jobs/create-job.use-case.spec.ts`

- [ ] **Step 1: Write failing use case test**

```ts
import { CreateJobUseCase } from '../../../../../src/modules/system/jobs/application/create-job.use-case';
import { InMemoryJobRepository } from '../../../../../src/modules/system/jobs/infrastructure/in-memory-job.repository';
import { JobType } from '../../../../../src/shared/contracts/jobs/job-type';
import { JobStatus } from '../../../../../src/shared/contracts/jobs/job-status';

describe('CreateJobUseCase', () => {
  it('creates a queued job', async () => {
    const repository = new InMemoryJobRepository();
    const useCase = new CreateJobUseCase(repository);

    const job = await useCase.execute({
      type: JobType.OcrRecognize,
      input: { originalName: 'a.png' },
      traceId: 'trace-1',
    });

    expect(job.status).toBe(JobStatus.Queued);
    expect(job.type).toBe(JobType.OcrRecognize);
  });
});
```

- [ ] **Step 2: Implement repository and use cases**

Use in-memory repository first to keep tests independent from PostgreSQL. Define repository methods:

- `create(input)`
- `findById(id)`
- `markProcessing(id)`
- `markSucceeded(id, result)`
- `markFailed(id, error)`
- `listByTenant(input)`

- [ ] **Step 3: Add jobs controller**

Expose:

- `GET /api/jobs/:jobId`

Return job state without changing global response behavior.

- [ ] **Step 4: Import jobs module**

Add `JobsModule` to `AppModule`.

- [ ] **Step 5: Run test**

Run:

```bash
pnpm test:unit -- test/unit/modules/system/jobs/create-job.use-case.spec.ts
```

Expected: passes.

## Task 8: Add OCR Task HTTP Endpoints

**Files:**
- Create: `src/modules/tools/ocr/ocr-tools.module.ts`
- Create: `src/modules/tools/ocr/interface/http/ocr-jobs.controller.ts`
- Create: `src/modules/tools/ocr/interface/http/legacy-ocr.controller.ts`
- Create: `src/modules/tools/hairstyle/hairstyle-tools.module.ts`
- Create: `src/modules/tools/hairstyle/interface/http/hairstyle-jobs.controller.ts`
- Modify: `src/app.module.ts`
- Test: `test/e2e/tools-ocr.spec.ts`

- [ ] **Step 1: Write failing e2e tests**

Test:

- `POST /api/tools/ocr/jobs` returns `201` with `jobId`.
- `POST /api/recognize` returns either old synchronous success shape or `202` job shape.
- `GET /api/health` still returns current health shape.

- [ ] **Step 2: Implement controllers**

Use `FileInterceptor('image')` for OCR and hairstyle upload endpoints. Convert file buffer to base64 before creating jobs:

```ts
const imageBase64 = file.buffer.toString('base64');
```

- [ ] **Step 3: Add compatibility response shape**

For slow compatibility path:

```ts
{
  success: false,
  pending: true,
  jobId,
  statusUrl: `/api/jobs/${jobId}`,
  resultUrl: `/api/tools/ocr/jobs/${jobId}/result`
}
```

Use HTTP status `202`.

- [ ] **Step 4: Run e2e tests**

Run:

```bash
pnpm test:e2e -- test/e2e/tools-ocr.spec.ts
```

Expected: passes.

## Task 9: Migrate `paper-excel-ocr` Services into Worker Services

**Files:**
- Create: `src/workers/ocr/services/baidu-ocr.service.ts`
- Create: `src/workers/ocr/services/excel-export.service.ts`
- Create: `src/workers/ocr/services/hairstyle-transform.service.ts`
- Test: `test/unit/workers/ocr/excel-export.service.spec.ts`

- [ ] **Step 1: Port Excel service first**

Move Excel generation logic from `paper-excel-ocr/backend/services/excelService.js` into `ExcelExportService` with TypeScript types.

- [ ] **Step 2: Add Excel unit tests**

Assert generated workbook buffer is not empty for:

- single sheet
- multiple sheets
- merged cells

- [ ] **Step 3: Port Baidu OCR service**

Move OCR provider logic into `BaiduOcrService`. Keep provider credentials in env. Normalize provider errors into typed worker errors.

- [ ] **Step 4: Port hairstyle service**

Move current demo/AI transform logic into `HairstyleTransformService`. Keep demo mode if no AI provider is configured.

- [ ] **Step 5: Wire services into processor**

Replace minimal processor return values with real service calls.

## Task 10: Regression Verification

**Files:**
- Existing test suite
- New tests added above

- [ ] **Step 1: Run existing unit tests**

```bash
pnpm test:unit
```

Expected: all existing and new unit tests pass.

- [ ] **Step 2: Run existing integration tests**

```bash
pnpm test:integration
```

Expected: all integration tests pass.

- [ ] **Step 3: Run e2e tests**

```bash
pnpm test:e2e
```

Expected: all e2e tests pass, including current health/platform behavior.

- [ ] **Step 4: Run lint**

```bash
pnpm lint
```

Expected: no lint errors.

- [ ] **Step 5: Run build**

```bash
pnpm build
```

Expected: Nest build succeeds.

## Implementation Notes

- Keep existing global prefix exclusions for `/sys/...`.
- Keep binary response handling local to file/download controllers.
- Avoid changing existing DTOs for tenant/user/role/audit.
- Do not remove in-memory repositories until Prisma-backed replacements are implemented and tested.
- Do not move existing `src/main.ts` until the worker and queue infrastructure are passing.
