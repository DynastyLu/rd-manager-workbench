# P1-01D Base Business Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a validated five-template catalog that creates editable custom tables with fields and views but no sample records.

**Architecture:** Keep immutable versioned template definitions in the backend as the single source of truth. A validator checks definitions at request time; a transactional instantiation service resolves preset relation targets and creates normal `CUSTOM` tables that no longer depend on the catalog.

**Tech Stack:** NestJS, Prisma/PostgreSQL advisory locks, React 19, Semi Design, TanStack Query, Jest/Supertest, Vitest/Testing Library.

---

### Task 1: Define and validate the template catalog

**Files:**
- Create: `backend/src/modules/workbench/base/templates/base-template.types.ts`
- Create: `backend/src/modules/workbench/base/templates/base-template-catalog.ts`
- Create: `backend/src/modules/workbench/base/templates/base-template-validator.ts`
- Create: `backend/test/unit/modules/workbench/base/base-template-validator.spec.ts`

- [ ] Write failing tests for duplicate template/field/view keys, missing or multiple primary fields, non-required primary, invalid view field references, duplicate option values, missing preset targets, and attempted mutation of returned definitions.
- [ ] Define `DataTableTemplateDefinition`, `TemplateFieldDefinition`, and `TemplateViewDefinition` with literal `version: 1` and the five approved categories.
- [ ] Implement `validateTemplateCatalog()` and recursively freeze returned definitions.
- [ ] Declare all five templates with exact fields, option labels/values/colors, and GRID/KANBAN/CALENDAR/GANTT/GALLERY configs from the D spec.
- [ ] Run `cd backend && pnpm test:unit -- --runInBand base-template-validator`; expect PASS.
- [ ] Commit with `feat: define multidimensional table templates`.

### Task 2: Implement catalog and instantiation APIs

**Files:**
- Create: `backend/src/modules/workbench/base/templates/base-template.service.ts`
- Modify: `backend/src/modules/workbench/base/base.module.ts`
- Modify: `backend/src/modules/workbench/base/base.controller.ts`
- Modify: `backend/src/modules/workbench/base/dto/base.dto.ts`
- Modify: `backend/test/integration/modules/workbench/base.controller.spec.ts`

- [ ] Add failing API tests for catalog summary, detail, unknown key/workspace, five successful instantiations, zero records, relation target resolution, repeat-name suffixing, explicit names, and transaction rollback.
- [ ] Implement name selection under a workspace advisory transaction lock:

```ts
await tx.$executeRaw(Prisma.sql`
  SELECT pg_advisory_xact_lock(hashtext(${`base-template:${workspaceId}`}))
`)
```

- [ ] Resolve `PROJECTS` through `presetKey='projects'`, replace template relation placeholders with the actual table ID, and create table/fields/views in one nested Prisma create.
- [ ] Return summaries without mutable internal references and complete tables with the existing `tableInclude()` response shape.
- [ ] Run `cd backend && pnpm test:integration -- --runInBand base.controller`; expect PASS.
- [ ] Commit with `feat: instantiate multidimensional table templates`.

### Task 3: Add frontend catalog APIs and query hooks

**Files:**
- Modify: `frontend/src/modules/base/types.ts`
- Modify: `frontend/src/modules/base/api.ts`
- Modify: `frontend/src/modules/base/hooks.ts`
- Modify: `frontend/src/modules/base/__tests__/api.test.ts`
- Modify: `frontend/src/modules/base/__tests__/hooks.test.tsx`

- [ ] Write failing contract tests for list/detail/instantiate URLs and cache invalidation of workspaces after creation.
- [ ] Add typed `DataTableTemplateSummary`, `DataTableTemplateDetail`, `listBaseTemplates`, `getBaseTemplate`, and `instantiateBaseTemplate`.
- [ ] Add queries disabled until the template center opens and a mutation that invalidates `['base', 'workspaces']`.
- [ ] Run `cd frontend && pnpm test -- api.test hooks.test`; expect PASS.
- [ ] Commit with `feat: connect table template catalog`.

### Task 4: Build the Feishu-style template center

**Files:**
- Create: `frontend/src/modules/base/components/TemplateCenter.tsx`
- Create: `frontend/src/modules/base/components/TemplatePreview.tsx`
- Modify: `frontend/src/modules/base/components/BaseSidebar.tsx`
- Modify: `frontend/src/pages/LibraryHomePage.tsx`
- Modify: `frontend/src/pages/LibraryHomePage.less`
- Create: `frontend/src/modules/base/__tests__/TemplateCenter.test.tsx`

- [ ] Write failing tests for blank/template tabs, five cards, category/use/field/view summaries, preview, custom name, pending duplicate prevention, failed-state preservation, successful close/select/default-view, and zero sample records.
- [ ] Replace the direct new-table modal entry with `TemplateCenter`; keep the existing blank-table form under the “空白表格” tab.
- [ ] Render compact Semi cards and a preview side panel; do not copy template field definitions into frontend constants.
- [ ] On success refresh workspaces, select the new table, select its default view, and leave record count at zero.
- [ ] Run `cd frontend && pnpm test -- TemplateCenter && pnpm typecheck && pnpm lint && pnpm build`; expect PASS.
- [ ] Commit with `feat: add table template center`.

### Task 5: Complete D and cross-batch acceptance

**Files:**
- Modify: `progress.md`
- Modify: `task_plan.md`
- Modify: `docs/product/2026-07-18-local-feishu-style-functional-backlog.md`

- [ ] Run all backend unit/integration/E2E/lint/build and Prisma validate/generate/migration status checks.
- [ ] Run all frontend typecheck/contracts/tests/lint/build and Electron packaging smoke checks affected by new dependencies.
- [ ] In the real browser create all five templates, verify zero records, duplicate one template, add/edit a record, switch Gantt/Gallery, and perform CSV/XLSX import/export.
- [ ] Remove all acceptance template tables and files; verify five system preset tables are unchanged.
- [ ] Mark P1-01A/B/C/D and the four P1-01 backlog bullets complete, record exact test/migration/browser evidence in `progress.md`, and commit with `docs: record P1-01 delivery`.
