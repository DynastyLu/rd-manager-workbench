# Employee Import Grouped Association Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make employee association a grouped, defaulted operation across all imported rows belonging to the same employee name.

**Architecture:** Keep row-level work drafts, but introduce a normalized employee grouping key and group-update helpers inside `EmployeeImportAssociationModal`. Render one employee control per visible employee group using table row spans, while preserving the existing backend resolution contract and create-directive de-duplication.

**Tech Stack:** React, TypeScript, Semi UI Table, Vitest, Testing Library

---

### Task 1: Add grouped-default behavior tests

**Files:**

- Test: `frontend/src/modules/employees/__tests__/EmployeeImportAssociationModal.test.tsx`

- [ ] **Step 1: Write a failing test for default creation and one employee control**

Add two unresolved rows with the same normalized employee name and assert that:

```tsx
expect(screen.getAllByText("将新建：新员工")).toHaveLength(1);
expect(screen.getByText("共 2 条工作/计划")).toBeInTheDocument();
expect(
  screen.getAllByRole("button", { name: "改为关联现有员工：新员工" }),
).toHaveLength(1);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run src/modules/employees/__tests__/EmployeeImportAssociationModal.test.tsx --reporter=dot
```

Expected: FAIL because the current modal renders and stores employee creation per row.

- [ ] **Step 3: Add a failing test for group-wide employee selection**

Switch the grouped employee from automatic creation to an existing employee and submit. Assert both resolutions contain the same `employeeId` and none contain `createEmployee`.

- [ ] **Step 4: Re-run and verify RED**

Run the same focused Vitest command. Expected: the group-wide selection assertion fails.

### Task 2: Implement normalized employee groups and safe defaults

**Files:**

- Modify: `frontend/src/modules/employees/components/EmployeeImportAssociationModal.tsx`

- [ ] **Step 1: Add a shared employee-name key**

Add:

```ts
function normalizedEmployeeNameKey(row: EmployeeWorkImportRow): string {
  return normalizedEmployeeName(row)
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase();
}
```

- [ ] **Step 2: Default unresolved V2 rows to create by sheet name**

Change `makeDraft` so `createEmployee` is true when `resolvedEmployeeId` is null. Preserve resolved IDs and profile actions.

- [ ] **Step 3: Add group-wide draft updater**

Implement:

```ts
function updateEmployeeGroup(
  row: EmployeeWorkImportRow,
  update: Pick<
    AssociationDraft,
    "employeeId" | "createEmployee" | "updateEmployeeProfile"
  >,
) {
  const key = normalizedEmployeeNameKey(row);
  setDrafts((current) =>
    Object.fromEntries(
      rows.map((candidate) => [
        candidate.id,
        normalizedEmployeeNameKey(candidate) === key
          ? { ...current[candidate.id]!, ...update }
          : current[candidate.id]!,
      ]),
    ),
  );
}
```

- [ ] **Step 4: Compute visible group row spans**

Build a memoized map from visible row ID to `{ rowSpan, groupCount }`, where only the first visible row receives a positive span and later rows receive `rowSpan: 0`.

- [ ] **Step 5: Render one employee control per group**

Use the employee column `onCell`/cell props supported by Semi Table to set `rowSpan`. Replace row-level employee update callbacks with `updateEmployeeGroup`. Display “共 N 条工作/计划”.

- [ ] **Step 6: Keep create de-duplication on submit**

Retain `toResolutions`, but reuse `normalizedEmployeeNameKey` so the render and submission grouping rules cannot diverge.

### Task 3: Verify behavior and regression safety

**Files:**

- Test: `frontend/src/modules/employees/__tests__/EmployeeImportAssociationModal.test.tsx`
- Test: `frontend/src/modules/employees/__tests__/EmployeeImportWizard.test.tsx`

- [ ] **Step 1: Run focused modal tests**

```bash
pnpm exec vitest run src/modules/employees/__tests__/EmployeeImportAssociationModal.test.tsx --reporter=dot
```

Expected: all modal tests pass.

- [ ] **Step 2: Run the complete import wizard regression**

```bash
pnpm exec vitest run src/modules/employees/__tests__/EmployeeImportWizard.test.tsx src/modules/employees/__tests__/EmployeeImportAssociationModal.test.tsx --reporter=dot
```

Expected: all tests pass, including V2 automatic field-completion opening and resolution submission.

- [ ] **Step 3: Run type checking**

```bash
pnpm typecheck
```

Expected: exit code 0.

- [ ] **Step 4: Run production build**

```bash
pnpm build
```

Expected: Vite build and relative-build verification both succeed.
