# P1-01C Base Import and Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe CSV/XLSX previewed imports, error-row downloads, and current-view/full-table exports.

**Architecture:** Persist only import-session metadata in PostgreSQL and store uploaded/error files behind controlled storage keys. Split parsing, row conversion, import orchestration, and export rendering into focused services; expose them through the existing Base controller and a five-step frontend dialog.

**Tech Stack:** NestJS, Prisma/PostgreSQL, `exceljs`, `@fast-csv/parse`, `@fast-csv/format`, local StoragePort, React/Semi Design, Jest/Supertest, Vitest.

---

### Task 1: Add import dependencies and session persistence

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/pnpm-lock.yaml`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260719060000_add_data_import_sessions/migration.sql`
- Modify: `backend/test/integration/prisma/data-table-catalog.spec.ts`

- [ ] Install backend dependencies with `cd backend && pnpm add exceljs @fast-csv/parse @fast-csv/format`.
- [ ] Add a failing schema assertion for model `DataImportSession` and enums `DataImportFormat`/`DataImportStatus`.
- [ ] Add the schema model with `tableId`, safe storage keys, JSON mapping, counts, status, `expiresAt`, timestamps, relation to `DataTable`, and indexes on `[tableId, createdAt]` and `[expiresAt, status]`.
- [ ] Add the inverse `importSessions DataImportSession[]` relation to `DataTable`, create migration SQL, generate Prisma, and run the catalog test.
- [ ] Commit with `feat: persist table import sessions`.

### Task 2: Parse and inspect CSV/XLSX safely

**Files:**
- Create: `backend/src/modules/workbench/base/import/base-file-parser.service.ts`
- Create: `backend/src/modules/workbench/base/import/import.types.ts`
- Create: `backend/test/unit/modules/workbench/base/base-file-parser.service.spec.ts`
- Modify: `backend/src/modules/workbench/base/base.module.ts`

- [ ] Write failing tests for UTF-8/BOM CSV, invalid UTF-8, XLSX sheet listing, cached formula values, absent formula cache, 20 MiB/50,000-row/200-column/10,000-character limits, and extension/signature mismatch.
- [ ] Define the parser output:

```ts
export interface ParsedSheet {
  sheetNames: string[]
  selectedSheet: string
  columns: string[]
  inferredTypes: Record<string, 'TEXT' | 'NUMBER' | 'DATETIME' | 'CHECKBOX'>
  rows: Array<{ rowNumber: number; values: Record<string, unknown> }>
}
```

- [ ] Implement CSV streaming collection with hard limits and XLSX workbook parsing with macros/external links ignored; never evaluate formula text.
- [ ] Run `cd backend && pnpm test:unit -- --runInBand base-file-parser`; expect PASS.
- [ ] Commit with `feat: parse table import files safely`.

### Task 3: Validate mappings and convert rows

**Files:**
- Create: `backend/src/modules/workbench/base/import/import-row-converter.service.ts`
- Create: `backend/test/unit/modules/workbench/base/import-row-converter.service.spec.ts`

- [ ] Write failing tests for duplicate source/target mappings, required primary mapping, new-field validation, number/date/checkbox/multi-select conversion, unsupported computed/attachment targets, and relation primary-text matching with zero/multiple matches.
- [ ] Implement a pure conversion result:

```ts
export type RowConversionResult =
  | { ok: true; rowNumber: number; values: Record<string, unknown> }
  | { ok: false; rowNumber: number; fields: string[]; message: string; source: Record<string, unknown> }
```

- [ ] Reuse field option and relation config rules from `FieldConfigService`; do not call record writes from the converter.
- [ ] Run `cd backend && pnpm test:unit -- --runInBand import-row-converter`; expect PASS.
- [ ] Commit with `feat: validate table import rows`.

### Task 4: Orchestrate upload, preview, commit, error files, and expiry

**Files:**
- Create: `backend/src/modules/workbench/base/import/base-import.service.ts`
- Create: `backend/src/modules/workbench/base/import/import-cleanup.service.ts`
- Modify: `backend/src/modules/workbench/base/base.module.ts`
- Modify: `backend/src/modules/workbench/base/dto/base.dto.ts`
- Modify: `backend/src/modules/workbench/base/base.controller.ts`
- Create: `backend/test/unit/modules/workbench/base/base-import.service.spec.ts`
- Modify: `backend/test/integration/modules/workbench/base.controller.spec.ts`

- [ ] Write failing service/API tests for upload, sheet preview, zero-write preview, mapping invalidation, 250-row batches, partial failure, completed-session idempotency, importing conflict, error CSV columns, delete, and expiry cleanup.
- [ ] Add multipart upload with `FileInterceptor('file', { limits: { files: 1, fileSize: 20 * 1024 * 1024 } })` and endpoints exactly matching the approved C spec.
- [ ] Import `StorageModule` directly into `BaseModule` so `BaseImportService` can inject `StoragePort`; do not rely on `ContentModule`, which does not re-export storage providers.
- [ ] Store keys as `imports/<sessionId>/source.<ext>` and `imports/<sessionId>/errors.csv`; never return keys or paths to clients.
- [ ] Lock commit with an atomic status transition from `PREVIEWED` to `IMPORTING`; create new fields and the first batch in one transaction, then commit remaining 250-row batches.
- [ ] Generate error CSV with UTF-8 BOM and `__row_number`, `__error_fields`, `__error_message`; always sanitize download headers.
- [ ] Run focused unit/integration tests and commit with `feat: add previewed table imports`.

### Task 5: Export current view and full table

**Files:**
- Create: `backend/src/modules/workbench/base/export/base-export.service.ts`
- Create: `backend/test/unit/modules/workbench/base/base-export.service.spec.ts`
- Modify: `backend/src/modules/workbench/base/base.controller.ts`
- Modify: `backend/src/modules/workbench/base/base.module.ts`
- Modify: `backend/test/integration/modules/workbench/base.controller.spec.ts`

- [ ] Write failing tests for CSV BOM, XLSX typed dates/frozen header/filter, safe filename, full-table field sequence, current-view hidden fields/filter/sort, computed values, arrays, and more than 100 rows.
- [ ] Implement:

```ts
export interface BaseExportResult {
  contentType: string
  fileName: string
  writeTo(output: NodeJS.WritableStream): Promise<void>
}
```

- [ ] For `scope=view`, load the owned view and execute `ViewQueryService` without page limits; for `scope=all`, load all records and active fields.
- [ ] Set RFC 5987 `Content-Disposition` and content type in the controller, then await `writeTo(response)`; CSV uses a fast-csv stream and XLSX uses `ExcelJS.stream.xlsx.WorkbookWriter`, so neither format materializes the complete export in memory.
- [ ] Run focused tests and commit with `feat: export multidimensional tables`.

### Task 6: Build frontend import/export workflows

**Files:**
- Modify: `frontend/src/modules/base/types.ts`
- Modify: `frontend/src/modules/base/api.ts`
- Modify: `frontend/src/modules/base/hooks.ts`
- Modify: `frontend/src/modules/base/components/BaseToolbar.tsx`
- Create: `frontend/src/modules/base/components/ImportDialog.tsx`
- Create: `frontend/src/modules/base/components/ImportMappingStep.tsx`
- Create: `frontend/src/modules/base/components/ExportDialog.tsx`
- Create: `frontend/src/modules/base/__tests__/ImportExport.test.tsx`
- Modify: `frontend/src/pages/LibraryHomePage.tsx`

- [ ] Write failing tests for the five steps, sheet selection, suggestions without auto-submit, mapping-change preview invalidation, duplicate-submit prevention, partial result, error download, preset import hiding, and export parameters.
- [ ] Add `uploadBaseImport`, `previewBaseImport`, `commitBaseImport`, `getBaseImport`, `downloadBaseImportErrors`, and `downloadBaseExport` API functions; multipart calls must let the browser set the boundary.
- [ ] Build the Semi Steps/Modal workflow and preserve selected file, mapping, and custom table name after API errors.
- [ ] Trigger workspace/record invalidation after a successful or partial import; use a browser Blob download for exports and errors.
- [ ] Run `cd frontend && pnpm test -- ImportExport && pnpm typecheck && pnpm lint && pnpm build`; expect PASS.
- [ ] Commit with `feat: add table import and export workflows`.

### Task 7: Complete C verification

**Files:**
- Modify: `progress.md`
- Modify: `task_plan.md`

- [ ] Apply the import-session migration and run full backend unit/integration/lint/build gates.
- [ ] Run frontend typecheck/contracts/all tests/lint/build.
- [ ] In the real browser preview a mixed-validity CSV without writes, commit valid rows, download errors, select a non-first XLSX sheet, and export current/all scopes.
- [ ] Delete sessions and acceptance rows, verify `imports/` has no orphan files, record exact results, mark P1-01C complete, and commit with `docs: record P1-01C acceptance`.
