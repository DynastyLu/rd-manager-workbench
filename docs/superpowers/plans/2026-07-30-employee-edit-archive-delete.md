# Employee Edit, Archive, Restore, and Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** Complete the employee profile lifecycle so active employees can be edited and archived, archived employees can be restored for editing, and unused archived profiles can be permanently deleted safely.

**Architecture:** Extend the existing NestJS employee module with explicit archive-state queries and transactional restore/delete operations. Keep `displayName` globally unique, return a recoverable conflict for archived names, preserve activity records through nullable employee links, and reuse the existing React employee form in an archived-directory view.

**Tech Stack:** NestJS, Prisma/PostgreSQL, React, TypeScript, TanStack Query, Semi Design, Vitest, Jest, Playwright.

---

## Task 1: Define employee lifecycle API contracts

**Files:**
- Modify: `backend/src/shared/errors/error-codes.ts`
- Modify: `backend/src/modules/workbench/employees/interface/http/dto/employees.dto.ts`
- Modify: `frontend/src/modules/employees/types.ts`
- Modify: `frontend/src/modules/employees/api.ts`
- Modify: `frontend/src/modules/employees/queryKeys.ts`
- Test: `frontend/src/modules/employees/__tests__/api.test.ts`
- Test: `frontend/src/modules/employees/__tests__/queryKeys.test.ts`

1. Add failing frontend API tests for `archiveState=ARCHIVED`, `POST /employees/:id/restore`, and `DELETE /employees/:id/permanent`.
2. Run `pnpm --dir frontend test -- --run src/modules/employees/__tests__/api.test.ts src/modules/employees/__tests__/queryKeys.test.ts` and confirm the new expectations fail.
3. Add `ACTIVE | ARCHIVED` archive-state types, query-key participation, API methods, and the `EMPLOYEE_ARCHIVED_EXISTS` / `EMPLOYEE_DELETE_BLOCKED` error codes.
4. Run the same focused frontend tests and confirm they pass.

## Task 2: Implement transactional backend lifecycle rules

**Files:**
- Modify: `backend/src/modules/workbench/employees/application/employees.service.ts`
- Modify: `backend/src/modules/workbench/employees/interface/http/employees.controller.ts`
- Modify: `backend/src/modules/workbench/employees/employees.module.ts`
- Test: `backend/test/unit/modules/workbench/employees.service.spec.ts`
- Test: `backend/test/integration/modules/workbench/employees.controller.spec.ts`

1. Add failing unit tests for active/archived list filtering, archived-name conflict details, idempotent restore, active-profile permanent-delete rejection, reference-count deletion blocking, and unused-profile deletion.
2. Run `pnpm --dir backend test -- --runInBand test/unit/modules/workbench/employees.service.spec.ts` and confirm the new tests fail.
3. Implement archive-state filtering and archived-name conflict translation while retaining the unique constraint as the source of truth.
4. Implement `restore()` and `permanentDelete()` inside Prisma transactions with row locks. Count work items, week-plan items, resolved import rows, and resource-load entries before deletion.
5. Record edit/archive/restore/delete activities without making activity rows deletion blockers; delete employee skills before the profile.
6. Add controller routes and integration coverage for the new query and lifecycle endpoints.
7. Run the focused unit and integration suites and confirm they pass.

## Task 3: Add the archived employee directory and recovery UX

**Files:**
- Modify: `frontend/src/pages/EmployeesPage.tsx`
- Modify: `frontend/src/pages/EmployeesPage.less`
- Modify: `frontend/src/modules/employees/components/EmployeeProfileForm.tsx` only if archived recovery needs a reusable initial-state adjustment
- Test: `frontend/src/pages/__tests__/EmployeesPage.test.tsx`

1. Add failing page tests for the URL-backed active/archived switch, archived-row actions, restore-and-edit, and permanent-delete confirmations.
2. Run `pnpm --dir frontend test -- --run src/pages/__tests__/EmployeesPage.test.tsx` and confirm the new tests fail.
3. Add an archive-state segmented control that writes to the URL and participates in the employee list query.
4. Keep active-row “查看 / 编辑 / 归档” actions. Render archived-row “查看 / 恢复并编辑 / 永久删除” actions.
5. On restore success, invalidate employee-dependent queries and open the existing editor with the restored record.
6. On permanent delete, show the employee name and irreversibility warning; show categorized reference counts if the backend blocks deletion.
7. When create returns `EMPLOYEE_ARCHIVED_EXISTS`, offer “恢复并编辑” using the employee ID from error details.
8. Add loading, empty, disabled, and error states and run the focused page tests until they pass.

## Task 4: Verify lifecycle behavior end to end

**Files:**
- Modify: `frontend/e2e/employee-work-progress.spec.ts`

1. Add an isolated browser scenario: create employee, edit department, archive, switch to archived view, restore and edit, archive again, permanently delete.
2. Add a second scenario that attempts to delete an employee with imported/work history and verifies the record remains visible with a blocking reason.
3. Run `pnpm --dir frontend exec playwright test e2e/employee-work-progress.spec.ts`.
4. Run backend type/build validation with `pnpm --dir backend build`.
5. Run frontend type/build validation with `pnpm --dir frontend build`.
6. Run the complete focused backend and frontend test sets touched by this change and review the final diff for unrelated files.

## Task 5: Allow safe permanent deletion from the active directory

**Files:**
- Modify: `backend/src/modules/workbench/employees/application/employees.service.ts`
- Modify: `frontend/src/pages/EmployeesPage.tsx`
- Test: `backend/test/unit/modules/workbench/employees.service.spec.ts`
- Test: `backend/test/integration/modules/workbench/employees.controller.spec.ts`
- Test: `frontend/src/pages/__tests__/EmployeesPage.test.tsx`
- Test: `frontend/e2e/employee-lifecycle.spec.ts`

1. Add a failing backend test proving that an unused active employee may be permanently deleted while all four historical-reference checks still run.
2. Add a failing frontend test proving that active rows expose a danger “删除” action and use the existing permanent-delete confirmation.
3. Remove the archived-only precondition from `permanentDelete()` without weakening the transactional row lock or reference-count guard.
4. Render “查看 / 编辑 / 归档 / 删除” for active rows and retain “查看 / 恢复并编辑 / 永久删除” for archived rows.
5. Extend the browser lifecycle scenario to delete one unused active employee directly.
6. Run the focused unit, integration, frontend, browser, lint, and build checks.
