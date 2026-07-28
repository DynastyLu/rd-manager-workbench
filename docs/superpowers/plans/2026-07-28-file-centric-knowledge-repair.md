# File-Centric Knowledge Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mixed document-editor implementation with a reliable file-centric knowledge base whose uploaded and watched local files retain their originals, render high-fidelity previews, and serve as unified keyword and semantic search sources.

**Architecture:** `ContentDocument` remains the knowledge catalog entry while `FileAsset/FileVersion` owns uploaded originals and `FolderFile` points to watched originals. A source resolver feeds independent preview, extraction, and indexing services; durable jobs track indexing progress. Local Transformers.js embeddings and PostgreSQL keyword search are merged before DeepSeek generates an answer.

**Tech Stack:** NestJS 10, Prisma 6, PostgreSQL 16 with pgvector/pg_trgm, `@huggingface/transformers`, LibreOffice headless, React 19, Semi UI, React Query, Vitest, Jest, Playwright.

---

## File structure

New backend units:

- `backend/src/modules/workbench/knowledge/domain/knowledge-file.types.ts` — source, preview, extraction, indexing status contracts.
- `backend/src/modules/workbench/knowledge/application/knowledge-source.service.ts` — resolves uploaded and watched originals without exposing storage details.
- `backend/src/modules/workbench/knowledge/application/knowledge-ingestion.service.ts` — atomically creates catalog/file records and schedules processing.
- `backend/src/modules/workbench/knowledge/application/preview.service.ts` — creates and reads preview cache artifacts.
- `backend/src/modules/workbench/knowledge/application/local-embedding.service.ts` — explicit local model lifecycle and vector generation.
- `backend/src/modules/workbench/knowledge/application/hybrid-search.service.ts` — combines vector and keyword recall.
- `backend/src/modules/workbench/knowledge/application/index-job.service.ts` — durable reindex job orchestration.
- `backend/src/modules/workbench/knowledge/application/keyed-task-lock.ts` — serializes directory and file work.
- `backend/src/modules/workbench/knowledge/interface/http/dto/knowledge-file.dto.ts` — validated upload, filtering, and model preparation DTOs.
- `frontend/src/modules/knowledge/components/KnowledgeFilePreview.tsx` — routes files to the correct read-only renderer.
- `frontend/src/modules/knowledge/components/KnowledgeProcessingStatus.tsx` — preview/index/model status.
- `frontend/src/modules/knowledge/sse.ts` — stateful SSE parser independent of React.

Existing responsibilities retained:

- `FilesService` continues serving normal attachment uploads/downloads.
- `DocumentsService` continues catalog metadata, favorites, tags, projects, trash and restore.
- `FolderWatchService` only discovers changes and delegates ingestion.
- `RagService` builds context and calls DeepSeek after `HybridSearchService` returns matches.

### Task 1: Restore a clean engineering baseline

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/src/modules/workbench/knowledge/application/folder-watch.service.ts`
- Modify: `backend/src/modules/workbench/knowledge/application/document-import.service.ts`
- Test: `backend/test/integration/modules/workbench/knowledge.controller.spec.ts`
- Test: `frontend/src/pages/__tests__/WorkspaceDirectoryPages.test.tsx`

- [ ] **Step 1: Pin Chokidar to its CommonJS-compatible v4 line and remove the stale types package**

```json
"dependencies": {
  "chokidar": "4.0.3"
}
```

Remove `@types/chokidar`; Chokidar publishes its own types.

- [ ] **Step 2: Update dependencies and prove the integration loader works**

Run:

```bash
cd backend
pnpm install
pnpm test:integration --runInBand test/integration/modules/workbench/knowledge.controller.spec.ts
```

Expected: Jest loads `AppModule` without `Cannot use import statement outside a module`.

- [ ] **Step 3: Remove the unused `existsSync` import and obsolete eslint suppression**

```ts
import { execFile } from 'node:child_process';
```

The later preview task replaces `execSync`; for this baseline step only remove unused imports without changing behavior.

- [ ] **Step 4: Align the workspace test with the approved file-reader product**

Replace the deleted rich-text toolbar expectation with:

```ts
expect(screen.queryByRole('toolbar', { name: '文档格式工具栏' })).not.toBeInTheDocument();
expect(screen.getByRole('region', { name: '文档编辑区' })).toBeInTheDocument();
```

- [ ] **Step 5: Run baseline gates**

Run:

```bash
cd backend && pnpm lint && pnpm build
cd ../frontend && pnpm test src/pages/__tests__/WorkspaceDirectoryPages.test.tsx
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/pnpm-lock.yaml backend/src/modules/workbench/knowledge/application/folder-watch.service.ts backend/src/modules/workbench/knowledge/application/document-import.service.ts frontend/src/pages/__tests__/WorkspaceDirectoryPages.test.tsx
git commit -m "fix: restore knowledge engineering baseline"
```

### Task 2: Make fresh database migrations self-contained

**Files:**
- Create: `backend/prisma/migrations/20260726100321_knowledge_extensions/migration.sql`
- Create: `backend/prisma/migrations/20260728090000_file_centric_knowledge/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/test/integration/prisma/knowledge-rag-catalog.spec.ts`

- [ ] **Step 1: Write failing catalog assertions**

```ts
it('installs required extensions before the first vector table migration', () => {
  const extensionSql = migration('20260726100321_knowledge_extensions');
  expect(extensionSql).toContain('CREATE EXTENSION IF NOT EXISTS vector');
  expect(extensionSql).toContain('CREATE EXTENSION IF NOT EXISTS pg_trgm');
});

it('tracks file processing and durable index jobs', () => {
  expect(schema).toMatch(/enum KnowledgeProcessingStatus/);
  expect(schema).toMatch(/model KnowledgeIndexJob/);
  expect(schema).toMatch(/previewStatus\\s+KnowledgeProcessingStatus/);
});
```

- [ ] **Step 2: Run the catalog test and verify RED**

Run:

```bash
cd backend
pnpm test:integration --runInBand test/integration/prisma/knowledge-rag-catalog.spec.ts
```

Expected: FAIL because the extension migration and processing models do not exist.

- [ ] **Step 3: Add the extension migration before the existing RAG migration**

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

- [ ] **Step 4: Add file processing fields and durable jobs**

Add Prisma contracts equivalent to:

```prisma
enum KnowledgeSourceKind {
  UPLOAD
  LOCAL_FILE
  LEGACY
  @@schema("app")
}

enum KnowledgeProcessingStatus {
  PENDING
  PROCESSING
  READY
  PARTIAL
  FAILED
  MISSING
  @@schema("app")
}

enum KnowledgeIndexJobStatus {
  QUEUED
  RUNNING
  SUCCEEDED
  PARTIAL
  FAILED
  INTERRUPTED
  @@schema("app")
}

model KnowledgeIndexJob {
  id             String                  @id @default(cuid())
  status         KnowledgeIndexJobStatus @default(QUEUED)
  totalFiles     Int                     @default(0) @map("total_files")
  processedFiles Int                     @default(0) @map("processed_files")
  failedFiles    Int                     @default(0) @map("failed_files")
  currentFile    String?                 @map("current_file")
  errors         Json                    @default("[]")
  startedAt      DateTime?               @map("started_at") @db.Timestamptz(6)
  finishedAt     DateTime?               @map("finished_at") @db.Timestamptz(6)
  createdAt      DateTime                @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime                @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([status, createdAt])
  @@map("knowledge_index_jobs")
  @@schema("app")
}
```

Extend `ContentDocument` with source MIME/name/size/hash, preview and index status, preview storage metadata, source modification time and indexed time. Make `DocumentChunk.embedding` use `public.vector(384)` and add `pageNumber`, `sheetName`, and `locationLabel`.

```prisma
model ContentDocument {
  // existing fields remain unchanged
  sourceKind        KnowledgeSourceKind       @default(LEGACY) @map("source_kind")
  originalName      String?                   @map("original_name")
  mimeType          String?                   @map("mime_type")
  fileSize          BigInt?                   @map("file_size")
  sourceSha256      String?                   @map("source_sha256")
  sourceModifiedAt  DateTime?                 @map("source_modified_at") @db.Timestamptz(6)
  previewStatus     KnowledgeProcessingStatus @default(PENDING) @map("preview_status")
  previewStorageKey String?                   @map("preview_storage_key")
  previewMimeType   String?                   @map("preview_mime_type")
  indexStatus       KnowledgeProcessingStatus @default(PENDING) @map("index_status")
  processingError   String?                   @map("processing_error")
  indexedAt         DateTime?                 @map("indexed_at") @db.Timestamptz(6)
}

model DocumentChunk {
  // existing fields remain unchanged
  embedding     Unsupported("public.vector(384)")
  pageNumber    Int?    @map("page_number")
  sheetName     String? @map("sheet_name")
  locationLabel String? @map("location_label")
}
```

- [ ] **Step 5: Add the SQL migration**

The migration must:

1. Create the three enums and `knowledge_index_jobs`.
2. Add nullable source fields with safe defaults for legacy rows.
3. Assert existing embeddings are null before changing vector dimension.
4. Drop and recreate the HNSW index around `vector(384)`.
5. Add processing-status indexes.

Use:

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.document_chunks WHERE embedding IS NOT NULL) THEN
    RAISE EXCEPTION 'Existing document embeddings must be reindexed before dimension migration';
  END IF;
END $$;
```

- [ ] **Step 6: Generate Prisma and verify migrations**

Run:

```bash
cd backend
pnpm prisma:generate
pnpm test:integration --runInBand test/integration/prisma/knowledge-rag-catalog.spec.ts
pnpm prisma migrate status
```

Expected: catalog test passes; current database reports the two new migrations pending until Task 11 clean-database verification.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma backend/test/integration/prisma/knowledge-rag-catalog.spec.ts
git commit -m "feat: make knowledge database migrations self-contained"
```

### Task 3: Store uploaded originals and unify file sources

**Files:**
- Create: `backend/src/modules/workbench/knowledge/domain/knowledge-file.types.ts`
- Create: `backend/src/modules/workbench/knowledge/application/knowledge-source.service.ts`
- Create: `backend/src/modules/workbench/knowledge/application/knowledge-ingestion.service.ts`
- Create: `backend/src/modules/workbench/knowledge/interface/http/dto/knowledge-file.dto.ts`
- Modify: `backend/src/modules/workbench/knowledge/interface/http/knowledge.controller.ts`
- Modify: `backend/src/modules/workbench/knowledge/knowledge.module.ts`
- Test: `backend/src/modules/workbench/knowledge/application/knowledge-ingestion.service.spec.ts`
- Test: `backend/test/integration/modules/workbench/knowledge.controller.spec.ts`

- [ ] **Step 1: Write failing upload tests**

```ts
it('stores the original and returns metadata without extracted plain text', async () => {
  const result = await service.ingestUpload(upload, { spaceId });
  expect(result).toMatchObject({
    documentId: expect.any(String),
    fileAssetId: expect.any(String),
    originalName: '方案.docx',
    processingStatus: 'PENDING',
  });
  expect(result).not.toHaveProperty('plainText');
  expect(result).not.toHaveProperty('plainTextPreview');
});

it('removes stored bytes when the database transaction fails', async () => {
  prisma.$transaction.mockRejectedValue(new Error('db failed'));
  await expect(service.ingestUpload(upload, {})).rejects.toThrow('db failed');
  expect(storage.delete).toHaveBeenCalledWith(expect.any(String));
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd backend
pnpm test:unit --runInBand src/modules/workbench/knowledge/application/knowledge-ingestion.service.spec.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Define a source abstraction**

```ts
export interface KnowledgeFileSource {
  documentId: string;
  kind: 'UPLOAD' | 'LOCAL_FILE';
  originalName: string;
  mimeType: string;
  size: number;
  sha256: string;
  modifiedAt?: Date;
  read(): Promise<Buffer>;
}
```

`KnowledgeSourceService.resolve(documentId)` must read uploaded bytes through `StoragePort` and watched bytes through `node:fs/promises`, verify hashes where applicable, and return `MISSING` when a local original no longer exists.

- [ ] **Step 4: Implement atomic ingestion**

Write uploaded bytes first, then use one Prisma transaction to create:

- `ContentDocument` with `sourceKind=UPLOAD`.
- `FileAsset`.
- Initial `FileVersion` pointing to the storage key.

Delete the storage key if the transaction fails. Schedule preview/index processing only after the transaction commits.

- [ ] **Step 5: Replace the upload controller response**

```ts
return this.ingestion.ingestUpload(file, {
  spaceId: dto.spaceId,
  projectId: dto.projectId,
  tags: dto.tags,
});
```

The response must contain IDs, file metadata and processing status only.

- [ ] **Step 6: Verify integration**

Run:

```bash
cd backend
pnpm test:unit --runInBand src/modules/workbench/knowledge/application/knowledge-ingestion.service.spec.ts
pnpm test:integration --runInBand test/integration/modules/workbench/knowledge.controller.spec.ts
```

Expected: uploaded original downloads byte-for-byte and JSON never includes full extracted text.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/workbench/knowledge backend/test/integration/modules/workbench/knowledge.controller.spec.ts
git commit -m "feat: preserve knowledge source files"
```

### Task 4: Build high-fidelity preview generation

**Files:**
- Create: `backend/src/modules/workbench/knowledge/application/preview.service.ts`
- Modify: `backend/src/modules/workbench/content/application/documents.service.ts`
- Modify: `backend/src/modules/workbench/content/interface/http/content.controller.ts`
- Modify: `backend/src/modules/workbench/knowledge/knowledge.module.ts`
- Test: `backend/src/modules/workbench/knowledge/application/preview.service.spec.ts`
- Test: `backend/test/integration/modules/workbench/knowledge.controller.spec.ts`

- [ ] **Step 1: Write failing preview routing tests**

```ts
it.each([
  ['application/pdf', 'application/pdf'],
  ['image/png', 'image/png'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/pdf'],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/pdf'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf'],
])('previews %s as %s', async (sourceMime, previewMime) => {
  const preview = await service.ensurePreview(makeSource({ mimeType: sourceMime }));
  expect(preview.mimeType).toBe(previewMime);
});
```

The test-local `makeSource` factory returns a complete `KnowledgeFileSource` with an in-memory `read()` implementation.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd backend
pnpm test:unit --runInBand src/modules/workbench/knowledge/application/preview.service.spec.ts
```

Expected: FAIL because `PreviewService` does not exist.

- [ ] **Step 3: Implement safe process execution**

Use `spawn`/`execFile`, never shell command interpolation:

```ts
await runProcess(sofficePath, [
  '--headless',
  '--convert-to',
  'pdf',
  '--outdir',
  outputDirectory,
  inputPath,
], PREVIEW_TIMEOUT_MS);
```

Resolve `soffice` from `LIBREOFFICE_PATH`, macOS application path, then `PATH`. Store generated previews in `StoragePort` under a key containing the source SHA-256.

- [ ] **Step 4: Implement renderer policy**

- PDF and images return original bytes.
- Office formats convert to cached PDF.
- UTF-8/GBK text formats return sanitized UTF-8 text or generated safe HTML.
- Unsupported formats return `UNSUPPORTED` without failing ingestion.
- Conversion errors set `previewStatus=FAILED` and preserve original download/open actions.

- [ ] **Step 5: Replace `preview-html` with a typed preview endpoint**

Add:

```http
GET /api/documents/:id/preview
```

It returns bytes with `Content-Type`, `Content-Disposition: inline`, `X-Knowledge-Preview-Status`, and no embedded base64 page images.

- [ ] **Step 6: Verify**

Run:

```bash
cd backend
pnpm test:unit --runInBand src/modules/workbench/knowledge/application/preview.service.spec.ts
pnpm test:integration --runInBand test/integration/modules/workbench/knowledge.controller.spec.ts
```

Expected: PDF/Office/image/text paths pass and preview failure leaves original retrieval available.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/workbench/content backend/src/modules/workbench/knowledge backend/test/integration/modules/workbench/knowledge.controller.spec.ts
git commit -m "feat: add high fidelity knowledge previews"
```

### Task 5: Serialize folder synchronization and remove blocking I/O

**Files:**
- Create: `backend/src/modules/workbench/knowledge/application/keyed-task-lock.ts`
- Modify: `backend/src/modules/workbench/knowledge/application/folder-watch.service.ts`
- Modify: `backend/src/modules/workbench/knowledge/application/document-import.service.ts`
- Test: `backend/src/modules/workbench/knowledge/application/keyed-task-lock.spec.ts`
- Test: `backend/src/modules/workbench/knowledge/application/folder-watch.service.spec.ts`

- [ ] **Step 1: Write failing concurrency tests**

```ts
it('runs jobs for the same key sequentially', async () => {
  const order: string[] = [];
  await Promise.all([
    lock.run('file-a', async () => { order.push('a-start'); await tick(); order.push('a-end'); }),
    lock.run('file-a', async () => { order.push('b-start'); order.push('b-end'); }),
  ]);
  expect(order).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);
});

it('does not create two documents for concurrent add and full-scan events', async () => {
  await Promise.all([service.handleAdd(path), service.rescan(watchId)]);
  expect(await countDocumentsFor(path)).toBe(1);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd backend
pnpm test:unit --runInBand src/modules/workbench/knowledge/application/keyed-task-lock.spec.ts src/modules/workbench/knowledge/application/folder-watch.service.spec.ts
```

Expected: FAIL because no active lock protects scans/files.

- [ ] **Step 3: Implement keyed lock cleanup**

```ts
async run<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = this.tails.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  this.tails.set(key, current);
  try {
    return await current;
  } finally {
    if (this.tails.get(key) === current) this.tails.delete(key);
  }
}
```

- [ ] **Step 4: Apply directory and file locks**

- Wrap `fullScan` with `scan:${watchId}`.
- Wrap add/change/remove with `file:${watchId}:${normalizedPath}`.
- Make manual rescan reuse an active scan instead of starting another.
- Have `FolderWatchService` delegate creation/update to `KnowledgeIngestionService`.

- [ ] **Step 5: Replace synchronous file operations**

Use `readdir`, `stat`, `readFile`, and streaming SHA-256 from `node:fs/promises`/`createReadStream`. Reject or mark unsupported files exceeding the configured local indexing size before loading bytes.

Replace PDF `execSync` with the same bounded process runner used by preview conversion.

- [ ] **Step 6: Verify**

Run:

```bash
cd backend
pnpm test:unit --runInBand src/modules/workbench/knowledge/application/keyed-task-lock.spec.ts src/modules/workbench/knowledge/application/folder-watch.service.spec.ts
pnpm test:integration --runInBand test/integration/modules/workbench/knowledge.controller.spec.ts
```

Expected: concurrency tests pass with no orphan documents and no synchronous filesystem calls in knowledge services.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/workbench/knowledge
git commit -m "fix: serialize local knowledge synchronization"
```

### Task 6: Add durable indexing jobs

**Files:**
- Create: `backend/src/modules/workbench/knowledge/application/index-job.service.ts`
- Modify: `backend/src/modules/workbench/knowledge/application/indexing.service.ts`
- Modify: `backend/src/modules/workbench/knowledge/interface/http/knowledge.controller.ts`
- Modify: `backend/src/modules/workbench/knowledge/knowledge.module.ts`
- Test: `backend/src/modules/workbench/knowledge/application/index-job.service.spec.ts`
- Test: `backend/test/integration/modules/workbench/knowledge.controller.spec.ts`

- [ ] **Step 1: Write failing job tests**

```ts
it('returns a queued job before any document is indexed', async () => {
  const job = await service.enqueueFullReindex();
  expect(job.status).toBe('QUEUED');
  expect(indexing.indexDocument).not.toHaveBeenCalled();
});

it('reuses the current queued or running full reindex', async () => {
  const first = await service.enqueueFullReindex();
  const second = await service.enqueueFullReindex();
  expect(second.id).toBe(first.id);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd backend
pnpm test:unit --runInBand src/modules/workbench/knowledge/application/index-job.service.spec.ts
```

Expected: FAIL because durable jobs do not exist.

- [ ] **Step 3: Implement the job state machine**

`enqueueFullReindex()` creates/reuses a `QUEUED` job and schedules processing after the HTTP response. `run(jobId)` pages active documents by stable `(updatedAt,id)` order, updates progress after each file, collects bounded error summaries, and finishes as `SUCCEEDED`, `PARTIAL`, or `FAILED`.

On module startup:

```ts
await prisma.knowledgeIndexJob.updateMany({
  where: { status: 'RUNNING' },
  data: { status: 'INTERRUPTED', finishedAt: new Date() },
});
```

- [ ] **Step 4: Change API semantics**

```ts
@Post('reindex')
@HttpCode(HttpStatus.ACCEPTED)
triggerReindex() {
  return this.jobs.enqueueFullReindex();
}

@Get('reindex/:jobId')
getReindexJob(@Param('jobId') jobId: string) {
  return this.jobs.get(jobId);
}
```

- [ ] **Step 5: Verify**

Run:

```bash
cd backend
pnpm test:unit --runInBand src/modules/workbench/knowledge/application/index-job.service.spec.ts
pnpm test:integration --runInBand test/integration/modules/workbench/knowledge.controller.spec.ts
```

Expected: POST returns 202 before indexing completes and progress persists.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/workbench/knowledge backend/test/integration/modules/workbench/knowledge.controller.spec.ts
git commit -m "feat: add durable knowledge indexing jobs"
```

### Task 7: Implement local embeddings and hybrid retrieval

**Files:**
- Modify: `backend/package.json`
- Create: `backend/src/modules/workbench/knowledge/application/local-embedding.service.ts`
- Create: `backend/src/modules/workbench/knowledge/application/hybrid-search.service.ts`
- Modify: `backend/src/modules/workbench/knowledge/application/indexing.service.ts`
- Modify: `backend/src/modules/workbench/knowledge/application/rag.service.ts`
- Modify: `backend/src/modules/workbench/knowledge/knowledge.module.ts`
- Modify: `backend/src/modules/workbench/knowledge/domain/knowledge.types.ts`
- Test: `backend/src/modules/workbench/knowledge/application/local-embedding.service.spec.ts`
- Test: `backend/src/modules/workbench/knowledge/application/hybrid-search.service.spec.ts`
- Test: `backend/src/modules/workbench/knowledge/application/indexing.service.spec.ts`

- [ ] **Step 1: Add Transformers.js**

```bash
cd backend
pnpm add @huggingface/transformers
```

Use the multilingual `Xenova/paraphrase-multilingual-MiniLM-L12-v2` feature-extraction model, mean pooling and normalization. Vector dimension is 384.

- [ ] **Step 2: Write failing provider tests**

```ts
it('does not download the model during status checks', async () => {
  await service.status();
  expect(loadPipeline).not.toHaveBeenCalled();
});

it('normalizes 384-dimensional embeddings', async () => {
  await service.prepare();
  const [vector] = await service.embed(['研发计划']);
  expect(vector).toHaveLength(384);
  expect(l2Norm(vector)).toBeCloseTo(1, 5);
});
```

- [ ] **Step 3: Write failing hybrid-search tests**

```ts
it('merges keyword and vector hits by document chunk id', async () => {
  keywordSearch.mockResolvedValue([{ id: 'a', score: 0.7 }]);
  vectorSearch.mockResolvedValue([{ id: 'a', score: 0.9 }, { id: 'b', score: 0.8 }]);
  expect(await service.search(query)).toEqual([
    expect.objectContaining({ id: 'a' }),
    expect.objectContaining({ id: 'b' }),
  ]);
});

it('falls back to keyword mode when the local model is not ready', async () => {
  embedding.status.mockResolvedValue({ state: 'NOT_READY' });
  const result = await service.search(query);
  expect(result.mode).toBe('KEYWORD');
  expect(vectorSearch).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Run tests and verify RED**

Run:

```bash
cd backend
pnpm test:unit --runInBand src/modules/workbench/knowledge/application/local-embedding.service.spec.ts src/modules/workbench/knowledge/application/hybrid-search.service.spec.ts
```

Expected: FAIL because the services do not exist.

- [ ] **Step 5: Implement explicit model lifecycle**

Expose:

```ts
status(): Promise<{ state: 'NOT_READY' | 'LOADING' | 'READY' | 'FAILED'; model: string }>;
prepare(): Promise<void>;
embed(texts: string[]): Promise<number[][]>;
```

`status()` checks the configured cache only. `prepare()` is the only operation allowed to download/load the model. Cache location comes from `KNOWLEDGE_MODEL_CACHE_DIR` or the workspace cache directory.

- [ ] **Step 6: Store embeddings during indexing**

Generate embeddings before the Prisma transaction. Insert them using parameterized pgvector SQL:

```sql
INSERT INTO app.document_chunks (..., embedding)
VALUES (..., $6::public.vector)
```

When the model is not ready, store chunks with null embeddings and mark the document `PARTIAL`, leaving keyword search available.

- [ ] **Step 7: Implement hybrid search**

- Use Prisma tagged queries for all user inputs.
- Query keyword candidates with `similarity` plus `ILIKE`.
- Query vector candidates with `1 - (embedding <=> queryVector)`.
- Merge with reciprocal rank fusion so score scales do not need manual equivalence.
- Return mode `HYBRID` or `KEYWORD` with citations carrying page/sheet/location.

- [ ] **Step 8: Replace direct SQL in `RagService`**

`RagService.ask()` receives already-ranked hits from `HybridSearchService`. If no hits exist, it returns `{ stream: null, citations: [], relevantCount: 0 }` without calling DeepSeek.

- [ ] **Step 9: Verify**

Run:

```bash
cd backend
pnpm test:unit --runInBand src/modules/workbench/knowledge/application/local-embedding.service.spec.ts src/modules/workbench/knowledge/application/hybrid-search.service.spec.ts src/modules/workbench/knowledge/application/indexing.service.spec.ts
pnpm lint
pnpm build
```

Expected: tests, lint and build pass without calling the network.

- [ ] **Step 10: Commit**

```bash
git add backend/package.json backend/pnpm-lock.yaml backend/src/modules/workbench/knowledge
git commit -m "feat: add local semantic knowledge retrieval"
```

### Task 8: Fix DeepSeek configuration and SSE lifecycle

**Files:**
- Create: `backend/src/modules/workbench/knowledge/application/knowledge-ai-config.service.ts`
- Modify: `backend/src/modules/workbench/knowledge/application/deepseek-http.service.ts`
- Modify: `backend/src/modules/workbench/knowledge/interface/http/knowledge.controller.ts`
- Modify: `backend/src/modules/workbench/knowledge/knowledge.module.ts`
- Modify: `backend/src/modules/workbench/extensions/application/extensions.service.ts`
- Create: `frontend/src/modules/knowledge/sse.ts`
- Modify: `frontend/src/modules/knowledge/components/KnowledgeChatPanel.tsx`
- Test: `backend/src/modules/workbench/knowledge/interface/http/knowledge.controller.spec.ts`
- Test: `frontend/src/modules/knowledge/__tests__/sse.test.ts`
- Test: `frontend/src/modules/knowledge/__tests__/KnowledgeChatPanel.test.tsx`

- [ ] **Step 1: Write failing SSE backend tests**

```ts
it('returns an HTTP error before SSE headers are sent', async () => {
  rag.ask.mockRejectedValue(new Error('configuration missing'));
  await request(app).post(path).send({ question: '问题' }).expect(503);
});

it('writes an SSE error without a second writeHead after streaming begins', async () => {
  stream.getReader.mockImplementation(() => failingReader());
  await controller.chat(sessionId, dto, response);
  expect(response.writeHead).toHaveBeenCalledTimes(1);
  expect(response.write).toHaveBeenCalledWith(expect.stringContaining('event: error'));
});
```

- [ ] **Step 2: Write the split-packet parser test**

```ts
const parser = createSseParser(onEvent);
parser.push('event: status\n');
parser.push('data: {"phase":"empty","message":"无结果"}\n\n');
expect(onEvent).toHaveBeenCalledWith('status', expect.objectContaining({ phase: 'empty' }));
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
cd backend
pnpm test:unit --runInBand src/modules/workbench/knowledge/interface/http/knowledge.controller.spec.ts
cd ../frontend
pnpm test src/modules/knowledge/__tests__/sse.test.ts src/modules/knowledge/__tests__/KnowledgeChatPanel.test.tsx
```

Expected: both fail on the current header and parser behavior.

- [ ] **Step 4: Unify AI configuration**

`KnowledgeAiConfigService` reads the active `DEEPSEEK_CHAT` extension profile and resolves its secret through the credential-vault port. It may fall back to `DEEPSEEK_API_KEY` only when no active profile exists. Model comes from the profile instead of a hardcoded string.

- [ ] **Step 5: Correct the SSE lifecycle**

- Complete validation, session lookup, retrieval and DeepSeek connection before `writeHead(200)`.
- After headers are sent, never call `writeHead` again.
- On stream errors emit `event: error`, cancel the upstream reader and `end()`.
- On client close abort the DeepSeek request.
- Flush the final `TextDecoder` buffer.

- [ ] **Step 6: Use the stateful frontend parser**

Keep `eventName` and buffered text in the parser closure, not inside each `reader.read()` iteration. Emit typed `status`, `token`, `citations`, `done`, and `error` events.

- [ ] **Step 7: Verify**

Run:

```bash
cd backend
pnpm test:unit --runInBand src/modules/workbench/knowledge/interface/http/knowledge.controller.spec.ts
cd ../frontend
pnpm test src/modules/knowledge/__tests__/sse.test.ts src/modules/knowledge/__tests__/KnowledgeChatPanel.test.tsx
```

Expected: pre-header and post-header failures pass and split SSE frames render correctly.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/workbench/knowledge backend/src/modules/workbench/extensions frontend/src/modules/knowledge
git commit -m "fix: harden knowledge AI streaming"
```

### Task 9: Replace the knowledge editor with a file reader

**Files:**
- Create: `frontend/src/modules/knowledge/components/KnowledgeFilePreview.tsx`
- Create: `frontend/src/modules/knowledge/components/KnowledgeProcessingStatus.tsx`
- Modify: `frontend/src/modules/knowledge/api.ts`
- Modify: `frontend/src/modules/knowledge/types.ts`
- Modify: `frontend/src/pages/KnowledgeHomePage.tsx`
- Modify: `frontend/src/pages/KnowledgeHomePage.less`
- Modify: `frontend/src/modules/knowledge/components/KnowledgeFileBrowser.tsx`
- Modify: `frontend/src/modules/knowledge/components/KnowledgeFileDetail.tsx`
- Test: `frontend/src/pages/__tests__/KnowledgeHomePage.test.tsx`
- Test: `frontend/src/pages/__tests__/WorkspaceDirectoryPages.test.tsx`
- Test: `frontend/src/modules/knowledge/__tests__/KnowledgeFileDetail.test.tsx`

- [ ] **Step 1: Write failing file-reader tests**

```tsx
it('renders uploaded PDF through the inline preview endpoint', async () => {
  renderKnowledgeFile(file({ mimeType: 'application/pdf', previewStatus: 'READY' }));
  expect(await screen.findByTitle('方案.pdf 预览')).toHaveAttribute(
    'src',
    expect.stringContaining('/documents/document-1/preview'),
  );
});

it('shows original actions when preview conversion fails', async () => {
  renderKnowledgeFile(file({ previewStatus: 'FAILED' }));
  expect(await screen.findByRole('button', { name: '下载原文件' })).toBeVisible();
  expect(screen.getByText('预览生成失败')).toBeVisible();
});

it('does not expose body editing or rich-text controls', async () => {
  renderPage(<KnowledgeHomePage />);
  expect(screen.queryByRole('toolbar', { name: '文档格式工具栏' })).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: '文档正文' })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd frontend
pnpm test src/pages/__tests__/KnowledgeHomePage.test.tsx src/pages/__tests__/WorkspaceDirectoryPages.test.tsx src/modules/knowledge/__tests__/KnowledgeFileDetail.test.tsx
```

Expected: FAIL because the file preview/status contract is missing.

- [ ] **Step 3: Add frontend contracts and APIs**

```ts
export interface KnowledgeFile {
  id: string;
  title: string;
  sourceKind: 'UPLOAD' | 'LOCAL_FILE' | 'LEGACY';
  originalName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  previewStatus: ProcessingStatus;
  indexStatus: ProcessingStatus;
  processingError: string | null;
  originalActions: { downloadUrl?: string; localPathAvailable?: boolean };
}
```

Add preview URL, processing status, index job, model status and prepare-model APIs.

- [ ] **Step 4: Implement preview routing**

- PDF and converted Office: sandboxed `<iframe>` using `/documents/:id/preview`.
- Image: `<img>` with constrained zoomable container.
- Text/Markdown/CSV/JSON/HTML: safe read-only renderers.
- Pending: processing progress.
- Failed/unsupported/missing: explicit state plus available original actions.

- [ ] **Step 5: Simplify `KnowledgeHomePage`**

Remove document draft state, plain-text body updates, save-body version and restoration controls. Keep title, tags, favorite, project/space associations, trash, file-version history, upload-new-version, and AI question entry.

Keep the three-column layout and give the right pane `role="region" aria-label="文件预览"`.

- [ ] **Step 6: Replace native confirm**

Replace `window.confirm` in index settings with Semi UI `Modal.confirm`, using consistent footer spacing and loading state.

- [ ] **Step 7: Verify**

Run:

```bash
cd frontend
pnpm test src/pages/__tests__/KnowledgeHomePage.test.tsx src/pages/__tests__/WorkspaceDirectoryPages.test.tsx src/modules/knowledge/__tests__/KnowledgeFileDetail.test.tsx
pnpm lint
pnpm typecheck
```

Expected: knowledge reader tests, lint and typecheck pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/modules/knowledge frontend/src/pages/KnowledgeHomePage.tsx frontend/src/pages/KnowledgeHomePage.less frontend/src/pages/__tests__
git commit -m "feat: replace knowledge editor with file reader"
```

### Task 10: Add original-file actions and citation navigation

**Files:**
- Modify: `desktop/src/main.ts`
- Modify: `desktop/src/preload.ts`
- Modify: `desktop/src/types.ts`
- Modify: `frontend/src/vite-env.d.ts`
- Modify: `frontend/src/modules/knowledge/components/KnowledgeFilePreview.tsx`
- Modify: `frontend/src/modules/knowledge/components/KnowledgeCitationCard.tsx`
- Modify: `frontend/src/modules/knowledge/components/KnowledgeChatPanel.tsx`
- Modify: `backend/src/modules/workbench/knowledge/application/chunking.service.ts`
- Test: `desktop/src/main.test.ts`
- Test: `frontend/src/modules/knowledge/__tests__/KnowledgeCitationCard.test.tsx`

- [ ] **Step 1: Write failing desktop boundary tests**

```ts
it('opens only a backend-resolved watched file path', async () => {
  knowledgeApi.resolveLocalOpenPath.mockResolvedValue('/allowed/方案.docx');
  await handler({}, { documentId: 'document-1' });
  expect(shell.openPath).toHaveBeenCalledWith('/allowed/方案.docx');
});
```

The renderer never supplies an arbitrary local path.

- [ ] **Step 2: Write failing citation-location tests**

```tsx
render(<KnowledgeCitationCard citation={{ documentId: 'd1', title: '周报.xlsx', sheetName: '研发部', locationLabel: 'A12:F20' }} />);
await user.click(screen.getByRole('button', { name: /周报.xlsx/ }));
expect(navigate).toHaveBeenCalledWith('/docs?documentId=d1&sheet=研发部&location=A12%3AF20');
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
cd desktop && pnpm test
cd ../frontend && pnpm test src/modules/knowledge/__tests__/KnowledgeCitationCard.test.tsx
```

Expected: FAIL because the safe open bridge and location navigation do not exist.

- [ ] **Step 4: Add the safe Electron bridge**

Expose:

```ts
knowledge: {
  openOriginal(documentId: string): Promise<{ opened: boolean; error?: string }>;
}
```

The main process asks the backend to resolve the document ID to an active watched path, verifies it still exists, then calls `shell.openPath`.

- [ ] **Step 5: Preserve extraction locations**

Chunk metadata carries PDF page, Office page where available, Excel sheet, and text line range. Citation URLs serialize these values; preview renderers highlight or navigate when the format supports it and otherwise display the location label.

- [ ] **Step 6: Verify and commit**

Run:

```bash
cd desktop && pnpm test && pnpm build
cd ../frontend && pnpm test src/modules/knowledge/__tests__/KnowledgeCitationCard.test.tsx
```

Expected: all pass.

```bash
git add desktop frontend/src/modules/knowledge frontend/src/vite-env.d.ts backend/src/modules/workbench/knowledge/application/chunking.service.ts
git commit -m "feat: connect knowledge files and citations"
```

### Task 11: Apply migrations and verify a clean database

**Files:**
- Create: `backend/test/scripts/verify-clean-knowledge-migrations.mjs`
- Modify: `backend/package.json`
- Modify: `README.md`

- [ ] **Step 1: Add a clean-database verifier**

The script must:

1. Create a uniquely named temporary PostgreSQL database using the configured administrative connection.
2. Run `prisma migrate deploy` against it without pre-installing extensions.
3. Query `pg_extension`, `app.document_chunks`, HNSW indexes and knowledge job columns.
4. Drop the explicit temporary database in `finally`.
5. Refuse to run if the generated name does not start with `rdmw_verify_`.

- [ ] **Step 2: Add the package command**

```json
"verify:migrations:clean": "node test/scripts/verify-clean-knowledge-migrations.mjs"
```

- [ ] **Step 3: Apply project migrations**

Run:

```bash
cd backend
pnpm prisma:migrate:deploy
pnpm prisma:generate
pnpm verify:migrations:clean
```

Expected: current database and a clean temporary database both apply all migrations; the temporary database is removed.

- [ ] **Step 4: Document runtime dependencies**

README must state:

- PostgreSQL user needs permission to create `vector` and `pg_trgm`.
- LibreOffice is required for Office high-fidelity previews.
- Local embedding model preparation is explicit and needs network only for the first download.
- Keyword search remains available without LibreOffice or the local model.

- [ ] **Step 5: Commit**

```bash
git add backend/test/scripts/verify-clean-knowledge-migrations.mjs backend/package.json README.md
git commit -m "test: verify clean knowledge database setup"
```

### Task 12: Full regression and acceptance

**Files:**
- No production-code changes are planned in this task.
- If a gate fails, stop this task, add a focused failing regression test to the owning earlier task, repair that task, and restart Task 12 from Step 1.

- [ ] **Step 1: Backend quality gate**

Run:

```bash
cd backend
pnpm lint
pnpm build
pnpm test:unit --runInBand
pnpm test:integration --runInBand
```

Expected: zero lint errors, build exit 0, all unit and integration suites pass.

- [ ] **Step 2: Frontend quality gate**

Run:

```bash
cd frontend
pnpm lint
pnpm typecheck
pnpm typecheck:contracts
pnpm test
pnpm build
```

Expected: every command exits 0 with zero failed tests.

- [ ] **Step 3: Desktop quality gate**

Run:

```bash
cd desktop
pnpm lint
pnpm test
pnpm build
```

Expected: every command exits 0 and startup contains no experimental Chokidar module warning.

- [ ] **Step 4: Manual file acceptance**

Using the running local stack:

1. Upload one PDF, DOCX, XLSX, PPTX, PNG, Markdown and TXT file.
2. Confirm original download SHA-256 equals the source.
3. Confirm previews retain PDF/Office page layout and images.
4. Add a local folder containing the same formats.
5. Modify, rename and remove files and confirm catalog/index states update once.
6. Search exact keywords across uploaded and local files.
7. Prepare the local model and search a semantically related phrase without exact keywords.
8. Ask a question and open every returned citation.
9. Stop a streamed response and confirm the request ends without server errors.

- [ ] **Step 5: Inspect final repository state**

Run:

```bash
git status --short
git diff --check
git log --oneline -15
```

Expected: no unintended files, no whitespace errors, and all planned commits are present.

- [ ] **Step 6: Record acceptance evidence**

Append the exact commands, pass counts and manual file matrix to `docs/superpowers/plans/2026-07-28-file-centric-knowledge-repair.md`, then commit only that file:

```bash
git add docs/superpowers/plans/2026-07-28-file-centric-knowledge-repair.md
git commit -m "test: record file knowledge acceptance"
```

## Acceptance evidence — 2026-07-28

- Backend lint and Nest build: passed.
- Backend unit tests: 95 suites, 666 tests passed.
- Backend integration tests: 44 suites, 197 tests passed after the temporary-database extension fixture was aligned with the new knowledge migrations.
- Frontend lint, TypeScript application contracts and API contracts: passed.
- Frontend serial regression: 106 files, 594 tests passed.
- Frontend production build and relative-build verification: passed.
- Electron desktop tests and typecheck: 18 files, 52 tests passed.
- Current database: all 35 migrations applied.
- Clean temporary database: all migrations applied from zero; `vector`, `pg_trgm`, `vector(384)`, HNSW and durable knowledge job columns verified; the `rdmw_verify_` database was removed in `finally`.
- Original-source integration: uploaded TXT bytes and watched Markdown sources were read back through the source endpoint; watched paths were resolved through the document-ID-only desktop boundary.
- UI product boundary: rich-text document creation, body editing, AI adoption into extracted content and body-version controls were removed; upload, folder sync, original preview, metadata, search and AI Q&A remain.
