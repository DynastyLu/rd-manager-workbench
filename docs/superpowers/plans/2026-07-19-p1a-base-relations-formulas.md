# P1-01A Base Relations and Formulas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bidirectional relations, LOOKUP, ROLLUP, and a safe read-time formula engine to multidimensional tables.

**Architecture:** Extend the existing Prisma field enum and keep relation IDs in `DataRecord.values`. Put relation synchronization, field configuration validation, formula parsing/evaluation, and computed record resolution in separate injectable services; `BaseService` coordinates them and keeps system-record adapters as the only source for preset objects.

**Tech Stack:** NestJS 10, Prisma 6/PostgreSQL, TypeScript, React 19, Semi Design, TanStack Query, Jest/Supertest, Vitest/Testing Library.

---

### Task 1: Extend the schema and shared field contracts

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260719040000_add_computed_data_fields/migration.sql`
- Modify: `backend/test/integration/prisma/data-table-catalog.spec.ts`
- Modify: `frontend/src/modules/base/types.ts`

- [x] **Step 1: Add a failing schema catalog assertion**

```ts
expect(schema).toContain('LOOKUP')
expect(schema).toContain('ROLLUP')
expect(schema).toContain('FORMULA')
```

- [x] **Step 2: Run the catalog test and confirm it fails**

Run: `cd backend && pnpm test:integration -- --runInBand test/integration/prisma/data-table-catalog.spec.ts`  
Expected: FAIL because the three enum members are absent.

- [x] **Step 3: Add enum members and typed frontend configs**

```ts
export type DataFieldType =
  | 'TEXT' | 'LONG_TEXT' | 'NUMBER' | 'DATETIME' | 'SINGLE_SELECT'
  | 'MULTI_SELECT' | 'CHECKBOX' | 'LINK' | 'ATTACHMENT' | 'RELATION'
  | 'LOOKUP' | 'ROLLUP' | 'FORMULA' | 'CREATED_AT' | 'UPDATED_AT'

export interface RelationFieldConfig {
  targetTableId: string
  multiple: boolean
  relationMode: 'ONE_WAY' | 'TWO_WAY'
  inverseFieldId?: string
}
```

Migration SQL must use `ALTER TYPE "app"."DataFieldType" ADD VALUE IF NOT EXISTS` for each new member and must not edit an applied migration.

- [x] **Step 4: Generate Prisma and run the catalog test**

Run: `cd backend && pnpm prisma:generate && pnpm test:integration -- --runInBand test/integration/prisma/data-table-catalog.spec.ts`  
Expected: PASS.

- [x] **Step 5: Commit the schema slice**

```bash
git add backend/prisma frontend/src/modules/base/types.ts backend/test/integration/prisma/data-table-catalog.spec.ts
git commit -m "feat: add computed data field types"
```

### Task 2: Build the safe formula parser and evaluator

**Files:**
- Create: `backend/src/modules/workbench/base/domain/formula.types.ts`
- Create: `backend/src/modules/workbench/base/domain/formula-parser.ts`
- Create: `backend/src/modules/workbench/base/domain/formula-evaluator.ts`
- Create: `backend/test/unit/modules/workbench/base/formula-parser.spec.ts`
- Create: `backend/test/unit/modules/workbench/base/formula-evaluator.spec.ts`

- [x] **Step 1: Write failing parser tests**

```ts
expect(parser.parse('IF({score} >= 80, "通过", "继续评估")', fields).dependencies)
  .toEqual(['score-field-id'])
expect(() => parser.parse('process.env.SECRET', fields)).toThrow('Unexpected token')
expect(() => parser.parse('CONCAT(' + '"x",'.repeat(300) + '"x")', fields)).toThrow('Formula is too complex')
```

- [x] **Step 2: Run focused tests and confirm missing modules fail**

Run: `cd backend && pnpm test:unit -- --runInBand formula-parser formula-evaluator`  
Expected: FAIL with unresolved imports.

- [x] **Step 3: Implement immutable AST types and parser limits**

```ts
export type FormulaAst =
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'field'; fieldId: string }
  | { kind: 'unary'; operator: '+' | '-'; operand: FormulaAst }
  | { kind: 'binary'; operator: '+' | '-' | '*' | '/' | '%' | '=' | '!=' | '>' | '>=' | '<' | '<='; left: FormulaAst; right: FormulaAst }
  | { kind: 'call'; name: FormulaFunctionName; args: FormulaAst[] }
```

The parser must enforce 2,000 characters, 256 AST nodes, depth 32, exact field-key resolution, function allow-list, and token positions in errors.

- [x] **Step 4: Implement evaluator semantics**

Implement `IF`, `COALESCE`, `ROUND`, `ABS`, `SUM`, `COUNT`, `CONCAT`, `LOWER`, `UPPER`, `LEN`, `DATE_ADD`, and `DATE_DIFF`; return typed `FormulaEvaluationError` codes instead of throwing page-level errors.

- [x] **Step 5: Run focused tests and commit**

Run: `cd backend && pnpm test:unit -- --runInBand formula-parser formula-evaluator`  
Expected: PASS.

```bash
git add backend/src/modules/workbench/base/domain backend/test/unit/modules/workbench/base
git commit -m "feat: add safe table formula engine"
```

### Task 3: Validate relation and computed field configurations

**Files:**
- Create: `backend/src/modules/workbench/base/field-config.service.ts`
- Modify: `backend/src/modules/workbench/base/dto/base.dto.ts`
- Modify: `backend/src/modules/workbench/base/base.module.ts`
- Modify: `backend/src/modules/workbench/base/base.service.ts`
- Create: `backend/test/unit/modules/workbench/base/field-config.service.spec.ts`

- [x] **Step 1: Test legal and illegal configurations**

```ts
await expect(service.normalizeCreate(tableId, {
  key: 'project_name', name: '项目名称', type: DataFieldType.LOOKUP,
  config: { relationFieldId, targetFieldId },
})).resolves.toMatchObject({ config: { relationFieldId, targetFieldId } })
await expect(service.normalizeCreate(tableId, formulaDependingOnItself)).rejects.toThrow('Circular computed field dependency')
```

- [x] **Step 2: Confirm the test fails, then implement the service**

Run: `cd backend && pnpm test:unit -- --runInBand field-config.service`  
Expected before implementation: FAIL; after implementation: PASS.

`FieldConfigService` must normalize server-owned formula AST/dependencies, forbid computed primary/required fields, keep `key` immutable on update, restrict LOOKUP/ROLLUP targets to base fields, and validate the complete same-table dependency graph.

- [x] **Step 3: Wire normalized configs into field CRUD and preview**

```ts
@Post('tables/:tableId/formula-preview')
previewFormula(@Param('tableId') tableId: string, @Body() dto: FormulaPreviewDto) {
  return this.baseService.previewFormula(tableId, dto)
}
```

- [x] **Step 4: Run unit and existing integration tests**

Run: `cd backend && pnpm test:unit -- --runInBand field-config.service && pnpm test:integration -- --runInBand base.controller`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add backend/src/modules/workbench/base backend/test/unit/modules/workbench/base
git commit -m "feat: validate relational and computed fields"
```

### Task 4: Synchronize bidirectional relations transactionally

**Files:**
- Create: `backend/src/modules/workbench/base/relation-sync.service.ts`
- Modify: `backend/src/modules/workbench/base/base.service.ts`
- Modify: `backend/src/modules/workbench/base/base.module.ts`
- Modify: `backend/test/integration/modules/workbench/base.controller.spec.ts`

- [x] **Step 1: Add failing integration cases**

Create two custom tables and assert: paired inverse field creation, one-to-many add/remove, one-to-one conflict returns 409, deleting one field converts its inverse to one-way, and rollback leaves both records unchanged.

- [x] **Step 2: Run the integration test and confirm failure**

Run: `cd backend && pnpm test:integration -- --runInBand base.controller`  
Expected: FAIL on inverse relation assertions.

- [x] **Step 3: Implement stable-lock synchronization**

```ts
const affectedIds = [...new Set([...previousIds, ...nextIds, sourceRecordId])].sort()
await tx.$executeRaw(Prisma.sql`
  SELECT id FROM "app"."data_records"
  WHERE id IN (${Prisma.join(affectedIds)})
  ORDER BY id FOR UPDATE
`)
```

Compute added/removed ID sets once, update inverse JSON values without recursive hooks, and reject cardinality violations before writes.

- [x] **Step 4: Run integration tests and commit**

Run: `cd backend && pnpm test:integration -- --runInBand base.controller`  
Expected: PASS.

```bash
git add backend/src/modules/workbench/base backend/test/integration/modules/workbench/base.controller.spec.ts
git commit -m "feat: sync bidirectional table relations"
```

### Task 5: Resolve LOOKUP, ROLLUP, and FORMULA values in record responses

**Files:**
- Create: `backend/src/modules/workbench/base/computed-field-resolver.service.ts`
- Modify: `backend/src/modules/workbench/base/domain/base.types.ts`
- Modify: `backend/src/modules/workbench/base/base.service.ts`
- Modify: `backend/src/modules/workbench/base/base.module.ts`
- Create: `backend/test/unit/modules/workbench/base/computed-field-resolver.spec.ts`
- Modify: `backend/test/integration/modules/workbench/base.controller.spec.ts`

- [ ] **Step 1: Write failing resolver tests**

Assert ordered multi-LOOKUP values, COUNT/SUM/AVG/MIN/MAX, same-table formula dependency order, `MISSING_TARGET`, `DIV_ZERO`, and defensive `CYCLE` output.

- [ ] **Step 2: Implement request-scoped batch loading and memoization**

```ts
export interface ComputedFieldError {
  code: 'INVALID_FORMULA' | 'TYPE_ERROR' | 'DIV_ZERO' | 'CYCLE' | 'MISSING_TARGET'
  message: string
}
```

Group relation IDs by target table, load each target set once, compute LOOKUP/ROLLUP before FORMULA, and attach errors under `computedErrors[field.key]`.

- [ ] **Step 3: Reject writes to computed keys**

Update `validateRecordValues` so any supplied LOOKUP/ROLLUP/FORMULA key returns 400 while omitted computed required checks never run.

- [ ] **Step 4: Run tests and commit**

Run: `cd backend && pnpm test:unit -- --runInBand computed-field-resolver && pnpm test:integration -- --runInBand base.controller`  
Expected: PASS.

```bash
git add backend/src/modules/workbench/base backend/test
git commit -m "feat: resolve computed table values"
```

### Task 6: Add relation and computation controls to the frontend

**Files:**
- Modify: `frontend/src/modules/base/types.ts`
- Modify: `frontend/src/modules/base/api.ts`
- Modify: `frontend/src/modules/base/hooks.ts`
- Modify: `frontend/src/modules/base/components/FieldManager.tsx`
- Modify: `frontend/src/modules/base/components/FieldEditor.tsx`
- Modify: `frontend/src/modules/base/components/GridView.tsx`
- Modify: `frontend/src/modules/base/components/FormView.tsx`
- Modify: `frontend/src/modules/base/components/KanbanView.tsx`
- Modify: `frontend/src/pages/LibraryHomePage.tsx`
- Create: `frontend/src/modules/base/components/RelationPicker.tsx`
- Create: `frontend/src/modules/base/components/FormulaEditor.tsx`
- Create: `frontend/src/modules/base/__tests__/ComputedFields.test.tsx`

- [ ] **Step 1: Write failing UI tests**

```tsx
expect(screen.getByRole('option', { name: '查找引用' })).toBeInTheDocument()
expect(screen.getByText('#DIV/0!')).toHaveAttribute('title', expect.stringContaining('除零'))
expect(screen.queryByLabelText('计算结果')).not.toBeInTheDocument()
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `cd frontend && pnpm test -- src/modules/base/__tests__/ComputedFields.test.tsx`  
Expected: FAIL because controls do not exist.

- [ ] **Step 3: Implement field configuration and formula preview**

`RelationPicker` must search target records and save IDs; `FormulaEditor` must insert `{field_key}`, call formula preview, keep drafts after errors, and prevent duplicate preview requests.

- [ ] **Step 4: Make computed values read-only everywhere**

Grid renders values/errors without editor; Form omits computed fields; Kanban excludes computed grouping; detail sheet shows computed values and explanations.

- [ ] **Step 5: Run frontend gates and commit**

Run: `cd frontend && pnpm test -- src/modules/base && pnpm typecheck && pnpm lint && pnpm build`  
Expected: PASS.

```bash
git add frontend/src/modules/base frontend/src/pages/LibraryHomePage.tsx
git commit -m "feat: manage table relations and formulas"
```

### Task 7: Apply migration and perform A acceptance

**Files:**
- Modify: `progress.md`
- Modify: `task_plan.md`

- [ ] Run `cd backend && pnpm exec prisma validate && pnpm prisma:generate && pnpm prisma:migrate:deploy` and confirm the migration is applied.
- [ ] Run `cd backend && pnpm test:unit -- --runInBand && pnpm test:integration -- --runInBand && pnpm lint && pnpm build`.
- [ ] Run `cd frontend && pnpm typecheck && pnpm typecheck:contracts && pnpm test && pnpm lint && pnpm build`.
- [ ] In the real browser create 岗位/候选人 tables, bidirectional relation, LOOKUP, COUNT/AVG, and `IF({avg_score} >= 80, "通过", "继续评估")`; verify updates and errors.
- [ ] Remove acceptance records/tables, record exact test totals in `progress.md`, mark P1-01A complete in `task_plan.md`, and commit with `docs: record P1-01A acceptance`.
