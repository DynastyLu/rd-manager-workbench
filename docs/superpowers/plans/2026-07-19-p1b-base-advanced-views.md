# P1-01B Base Advanced Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Gantt, Gallery, and persisted multi-filter personal views without duplicating table records.

**Architecture:** Extend `DataViewType` while keeping all view state in `DataView.config`. Normalize and execute saved view queries on the backend before pagination; render Gantt and Gallery as isolated React components that reuse existing record update/open callbacks.

**Tech Stack:** Prisma/PostgreSQL, NestJS, React 19, Semi Design, dnd-kit/pointer events, Jest/Supertest, Vitest/Testing Library.

---

### Task 1: Add advanced view types and normalized configs

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260719050000_add_advanced_data_views/migration.sql`
- Modify: `frontend/src/modules/base/types.ts`
- Modify: `backend/test/integration/prisma/data-table-catalog.spec.ts`

- [ ] Add failing assertions for `GANTT` and `GALLERY`, run `cd backend && pnpm test:integration -- --runInBand data-table-catalog`, and confirm failure.
- [ ] Add enum values with `ALTER TYPE ... ADD VALUE IF NOT EXISTS` and define `ViewFilter`, `ViewSort`, `GanttViewConfig`, and `GalleryViewConfig` exactly as the approved spec.
- [ ] Run Prisma generation and the catalog test; expect PASS.
- [ ] Commit with `feat: add advanced table view types`.

### Task 2: Execute saved views on the backend

**Files:**
- Create: `backend/src/modules/workbench/base/view-query.service.ts`
- Modify: `backend/src/modules/workbench/base/domain/base.types.ts`
- Modify: `backend/src/modules/workbench/base/dto/base.dto.ts`
- Modify: `backend/src/modules/workbench/base/base.service.ts`
- Modify: `backend/src/modules/workbench/base/adapters/system-records.adapter.ts`
- Modify: `backend/src/modules/workbench/base/base.module.ts`
- Create: `backend/test/unit/modules/workbench/base/view-query.service.spec.ts`
- Modify: `backend/test/integration/modules/workbench/base.controller.spec.ts`

- [ ] Write failing tests for legacy conversion, 20-filter/5-sort limits, type-aware operators, ignored archived fields, AND evaluation, `viewId` ownership, and filtered `meta.total`.
- [ ] Implement the normalized shape:

```ts
export interface NormalizedRecordQuery {
  query?: string
  filters: Array<{ fieldKey: string; operator: ViewFilterOperator; value?: unknown }>
  sorts: Array<{ fieldKey: string; direction: 'asc' | 'desc' }>
  page: number
  pageSize: number
}
```

- [ ] Extend `ListRecordsQueryDto` with optional `viewId`; load and normalize its config before applying pagination.
- [ ] Pass the same normalized query to `SystemRecordsAdapter`; reject computed-field filtering/sorting and foreign view IDs.
- [ ] Run `pnpm test:unit -- --runInBand view-query` and `pnpm test:integration -- --runInBand base.controller`; expect PASS.
- [ ] Commit with `feat: execute persisted table views`.

### Task 3: Build the shared view settings drawer

**Files:**
- Create: `frontend/src/modules/base/components/ViewSettingsDrawer.tsx`
- Create: `frontend/src/modules/base/components/ViewFilterBuilder.tsx`
- Modify: `frontend/src/modules/base/components/ViewManager.tsx`
- Modify: `frontend/src/pages/LibraryHomePage.tsx`
- Modify: `frontend/src/modules/base/api.ts`
- Modify: `frontend/src/modules/base/types.ts`
- Create: `frontend/src/modules/base/__tests__/ViewSettings.test.tsx`

- [ ] Write failing tests that add two filters and two sorts, save them, switch views, restore independent configs, set a default, and roll back after a failed save.
- [ ] Build field-type operator maps and value editors; prevent invalid conditions from calling `onSave`.
- [ ] Replace inline view settings with the Semi `SideSheet`, preserving rename/delete and adding default-view action.
- [ ] Query records with `viewId`, while the top search text remains a temporary override.
- [ ] Run `cd frontend && pnpm test -- ViewSettings`; expect PASS, then commit with `feat: add saved personal table views`.

### Task 4: Implement Gantt view

**Files:**
- Create: `frontend/src/modules/base/components/GanttView.tsx`
- Create: `frontend/src/modules/base/components/GanttTimeline.tsx`
- Create: `frontend/src/modules/base/__tests__/GanttView.test.tsx`
- Modify: `frontend/src/pages/LibraryHomePage.tsx`
- Modify: `frontend/src/pages/LibraryHomePage.less`

- [ ] Write failing tests for missing config, unplanned rows, end-before-start errors, day/week/month scale, today marker, read-only preset rows, move/resize payloads, and failed-update rollback.
- [ ] Implement `shiftRange` and `resizeRange` as pure date helpers tested without DOM geometry.
- [ ] Render a frozen record column and scrollable CSS-grid time axis; use pointer capture for move/resize and call existing `onRecordChange` with ISO dates.
- [ ] Connect record click to the existing detail sheet/source path.
- [ ] Run `cd frontend && pnpm test -- GanttView`; expect PASS, then commit with `feat: add gantt table view`.

### Task 5: Implement Gallery view

**Files:**
- Create: `frontend/src/modules/base/components/GalleryView.tsx`
- Create: `frontend/src/modules/base/components/GalleryCard.tsx`
- Create: `frontend/src/modules/base/__tests__/GalleryView.test.tsx`
- Modify: `frontend/src/pages/LibraryHomePage.tsx`
- Modify: `frontend/src/pages/LibraryHomePage.less`

- [ ] Write failing tests for primary-title fallback, attachment/link cover, broken-image fallback, stable gradient placeholder, eight-field limit, three card sizes, and record open.
- [ ] Implement cover resolution with `http/https` validation and deterministic title hashing for placeholder colors.
- [ ] Render typed values and P1-01A computed errors without enabling inline edits.
- [ ] Run `cd frontend && pnpm test -- GalleryView`; expect PASS, then commit with `feat: add gallery table view`.

### Task 6: Complete B verification

**Files:**
- Modify: `progress.md`
- Modify: `task_plan.md`

- [ ] Apply the migration and run all backend unit/integration/lint/build gates.
- [ ] Run frontend typecheck/contracts/all tests/lint/build.
- [ ] In the real browser create Gantt and Gallery views, drag dates, configure cover/fields, save different filters, refresh and restart services.
- [ ] Clean acceptance data, write exact results to `progress.md`, mark P1-01B complete, and commit with `docs: record P1-01B acceptance`.
