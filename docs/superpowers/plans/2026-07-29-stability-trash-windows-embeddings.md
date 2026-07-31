# Stability, Trash, and Windows Embeddings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the observed backend scheduling failures, complete the knowledge trash workflow, and make local semantic retrieval usable on Windows with a safe fallback.

**Architecture:** Three independent backend changes are implemented behind focused services and HTTP contracts, while the main thread integrates the trash workspace UI. Existing storage and indexing abstractions remain authoritative so clients never provide file-system paths.

**Tech Stack:** NestJS, Prisma/PostgreSQL, React 19, TanStack Query, Semi Design, Hugging Face Transformers, ONNX Runtime, Vitest.

---

### Task 1: Bound the database pool and make reminder scheduling non-blocking

**Files:**
- Modify: `backend/.env.example`
- Modify: `backend/src/infrastructure/config/env.schema.ts`
- Modify: `backend/src/modules/workbench/notifications/application/reminder-scheduling-lock.ts`
- Modify: `backend/src/modules/workbench/notifications/application/reminder-scheduler.service.ts`
- Modify: `backend/src/modules/workbench/notifications/application/employee-week-plan-reminder-sync.service.ts`
- Test: `backend/test/unit/infrastructure/config/env.schema.spec.ts`
- Test: reminder scheduler unit specifications under `backend/test/unit/modules/workbench/`

- [ ] Add failing tests proving the approved URL contains `connection_limit=5`, a missed advisory lock skips work, and overlapping scans do not start twice.
- [ ] Run the focused unit tests and verify they fail for the missing behavior.
- [ ] Add the connection limit, replace the blocking lock with `pg_try_advisory_xact_lock`, add per-service running guards, and configure bounded interactive transactions.
- [ ] Run the focused tests, backend type/build checks, and verify the new behavior passes.

### Task 2: Add permanent document deletion and empty-trash contracts

**Files:**
- Modify: `backend/src/modules/workbench/content/application/documents.service.ts`
- Modify: `backend/src/modules/workbench/content/interface/http/content.controller.ts`
- Test: `backend/test/unit/modules/workbench/documents.service.spec.ts`
- Test: `backend/test/integration/modules/workbench/content.controller.spec.ts`

- [ ] Add failing tests for rejecting active documents, deleting trashed uploads and their storage keys, retaining local source files, and clearing every trashed document.
- [ ] Run the focused tests and verify they fail because the service and routes do not exist.
- [ ] Inject `StoragePort`, collect authoritative storage keys, delete the trashed document graph transactionally, and clean stored upload/preview files with explicit failure handling.
- [ ] Add `DELETE /documents/:id/permanent` and `DELETE /documents/trash` routes, then run focused tests and backend build.

### Task 3: Support Windows local embeddings and readable lifecycle state

**Files:**
- Modify: `backend/src/modules/workbench/knowledge/application/embedding.service.ts`
- Modify: `backend/src/modules/workbench/knowledge/interface/http/knowledge.controller.ts`
- Modify: `frontend/src/modules/knowledge/components/KnowledgeEmbeddingStatus.tsx`
- Modify: `frontend/src/modules/knowledge/api.ts`
- Test: embedding service and component specifications

- [ ] Add failing tests for native-loader failure followed by WASM fallback, normalized user-facing errors, and one-time unavailable logging.
- [ ] Run focused backend and frontend tests and verify the expected failures.
- [ ] Implement a platform-aware loader with WASM fallback, stable cache directory resolution, concise status/error data, and log deduplication.
- [ ] Update the status card copy and progress states, then run focused tests and builds.

### Task 4: Rebuild the trash workspace interaction

**Files:**
- Modify: `frontend/src/modules/workbench/api/documents.ts`
- Modify: `frontend/src/pages/KnowledgeHomePage.tsx`
- Modify: `frontend/src/pages/KnowledgeHomePage.less`
- Test: `frontend/src/pages/__tests__/KnowledgeHomePage.test.tsx`

- [ ] Add failing tests for a trash header/count, hidden upload controls, permanent deletion confirmation, batch restore/delete, empty trash confirmation, and a read-only detail.
- [ ] Run the page test and verify the missing controls fail.
- [ ] Implement the API functions, selection state, mutations, confirmations, success/error feedback, and query invalidation.
- [ ] Apply a restrained Feishu-like white workspace layout with consistent spacing, danger semantics, scroll regions, and trash-specific empty state.
- [ ] Run focused tests, typecheck, lint, and production build.

### Task 5: Integrate and verify

**Files:**
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

- [ ] Review every agent diff against the design before accepting it.
- [ ] Run backend focused tests, full build, Prisma validation, and lint.
- [ ] Run frontend focused tests, typecheck, lint, contracts, and build.
- [ ] Use the local browser to verify trash selection, restore, permanent deletion confirmation, clear confirmation, and model status placement.
- [ ] Record exact commands, results, and any remaining environmental Windows validation boundary.

### Task 6: Guarantee fair reminder maintenance ordering

**Files:**
- Create: `backend/src/modules/workbench/notifications/application/reminder-maintenance-coordinator.service.ts`
- Modify: `backend/src/modules/workbench/notifications/application/reminder-scheduler.service.ts`
- Modify: `backend/src/modules/workbench/notifications/application/employee-week-plan-reminder-sync.service.ts`
- Modify: `backend/src/modules/workbench/notifications/notifications.module.ts`
- Create: `backend/test/unit/modules/workbench/reminder-maintenance-coordinator.service.spec.ts`

- [x] Add a failing coordinator test proving one lifecycle tick always calls employee-plan synchronization before due-reminder scanning.
- [x] Add a failing test proving an overlapping tick is skipped, while a failed tick releases the running guard for the next invocation.
- [x] Run the coordinator test and verify it fails because no coordinator exists.
- [x] Implement the single lifecycle owner, remove lifecycle timers from both child services, and register the coordinator after both children.
- [x] Run coordinator and existing reminder tests and verify ordering, process guards, PostgreSQL try-lock behavior, and user-facing 409 behavior.

### Task 7: Persist the real WASM model cache across restarts

**Files:**
- Create: `backend/src/modules/workbench/knowledge/infrastructure/filesystem-response-cache.ts`
- Modify: `backend/src/modules/workbench/knowledge/application/embedding.service.ts`
- Create: `backend/test/unit/modules/workbench/filesystem-response-cache.spec.ts`
- Modify: `backend/test/unit/modules/workbench/embedding.service.spec.ts`

- [x] Add a failing real-filesystem test that writes a `Response`, constructs a second cache instance for the same directory, and reads the identical body and headers without a network or mocked model loader.
- [x] Add failing corruption and maximum-entry-size tests; corrupt or oversized entries must miss safely without logging paths.
- [x] Run the cache tests and verify they fail because the adapter does not exist.
- [x] Implement SHA-256 keys, atomic body/metadata writes, bounded entry size, header/status persistence, and corrupt-entry cleanup.
- [x] Configure the real `transformers.web.js` module with `useCustomCache=true` and this disk cache before creating the WASM pipeline.
- [x] Add a real-module test proving the web runtime receives a persistent custom cache at the configured Windows path, then run embedding tests, backend build, and scoped lint.
