import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function schemaBlock(schema: string, kind: 'enum' | 'model', name: string): string {
  const match = schema.match(new RegExp(`${kind} ${name} \\{([\\s\\S]*?)\\n\\}`));

  if (!match) {
    throw new Error(`Missing ${name} ${kind}`);
  }

  return match[1];
}

describe('employee work progress Prisma catalog contract', () => {
  const schemaPath = resolve(__dirname, '../../../prisma/schema.prisma');
  const migrationPath = resolve(
    __dirname,
    '../../../prisma/migrations/20260723010000_employee_work_progress/migration.sql',
  );
  const compatibilityMigrationPath = resolve(
    __dirname,
    '../../../prisma/migrations/20260723011000_task_code_sequence_compatibility/migration.sql',
  );
  const collisionSafeCompatibilityMigrationPath = resolve(
    __dirname,
    '../../../prisma/migrations/20260723012000_task_code_collision_safe_compatibility/migration.sql',
  );
  const workbookV2MigrationPath = resolve(
    __dirname,
    '../../../prisma/migrations/20260728110000_employee_weekly_workbook_v2/migration.sql',
  );

  it('defines the employee import, work-item, snapshot, and compatibility catalog', () => {
    const schema = readFileSync(schemaPath, 'utf8');

    for (const enumName of [
      'EmployeeWorkImportStatus',
      'EmployeeSnapshotStatus',
      'EmployeeWorkStatus',
      'EmployeeProgressScope',
    ]) {
      expect(schemaBlock(schema, 'enum', enumName)).toContain('@@schema("app")');
    }

    for (const modelName of [
      'EmployeeWorkImportBatch',
      'EmployeeWorkImportRow',
      'EmployeeWorkItem',
      'EmployeeProgressSnapshot',
    ]) {
      expect(schemaBlock(schema, 'model', modelName)).toContain('@@schema("app")');
    }

    expect(schemaBlock(schema, 'model', 'WorkTask')).toMatch(
      /code\s+String\s+@unique\s+@default\(dbgenerated\("generate_task_code\(\)"\)\)/,
    );
    const resourceLoadEntry = schemaBlock(schema, 'model', 'ResourceLoadEntry');
    expect(resourceLoadEntry).toMatch(/employeeWorkItemId\s+String\?\s+@unique/);
    expect(resourceLoadEntry).toContain('@@index([employeeWorkImportBatchId, archivedAt])');
    expect(schemaBlock(schema, 'model', 'EmployeeWorkItem')).toMatch(/riskId\s+String\?\s+@unique/);
    expect(schemaBlock(schema, 'model', 'ResourceProfile')).toContain(
      '@@index([employmentStatus, archivedAt, displayName], map: "resource_profiles_employment_status_archived_at_display_name_id")',
    );
  });

  it('defines the V2 weekly workbook source, work-kind, and next-week plan catalog', () => {
    const schema = readFileSync(schemaPath, 'utf8');

    for (const enumName of [
      'EmployeeWorkKind',
      'EmployeeWorkSourceSection',
      'EmployeePlanPriority',
      'EmployeePlanCarryStatus',
    ]) {
      expect(schemaBlock(schema, 'enum', enumName)).toContain('@@schema("app")');
    }

    const employee = schemaBlock(schema, 'model', 'ResourceProfile');
    expect(employee).toMatch(/workDirection\s+String\?\s+@map\("work_direction"\)/);
    expect(employee).toContain('employeeWeekPlanItems');

    const importRow = schemaBlock(schema, 'model', 'EmployeeWorkImportRow');
    expect(importRow).toMatch(/sourceSheetName\s+String\?\s+@map\("source_sheet_name"\)/);
    expect(importRow).toMatch(
      /sourceSection\s+EmployeeWorkSourceSection\?\s+@map\("source_section"\)/,
    );
    expect(importRow).toMatch(/sourceRowNumber\s+Int\?\s+@map\("source_row_number"\)/);
    expect(importRow).toMatch(/sourceKey\s+String\?\s+@map\("source_key"\)/);
    expect(importRow).toMatch(/workKind\s+EmployeeWorkKind\?\s+@map\("work_kind"\)/);
    expect(importRow).toMatch(
      /plannedHours\s+Decimal\?\s+@map\("planned_hours"\)\s+@db\.Decimal\(6, 2\)/,
    );
    expect(importRow).toMatch(
      /actualHours\s+Decimal\?\s+@map\("actual_hours"\)\s+@db\.Decimal\(6, 2\)/,
    );
    expect(importRow).toMatch(/profileAction\s+String\?\s+@map\("profile_action"\)/);
    expect(importRow).toMatch(/riskDecision\s+String\?\s+@map\("risk_decision"\)/);
    expect(importRow).toMatch(/riskText\s+String\?\s+@map\("risk_text"\)/);
    expect(importRow).toContain('@@unique([batchId, sourceKey])');

    const currentWork = schemaBlock(schema, 'model', 'EmployeeWorkItem');
    expect(currentWork).toMatch(/workKind\s+EmployeeWorkKind\?\s+@map\("work_kind"\)/);
    expect(currentWork).toMatch(
      /plannedCompletionAt\s+DateTime\?\s+@map\("planned_completion_at"\)\s+@db\.Date/,
    );
    expect(currentWork).toContain('matchedWeekPlans');

    const nextPlan = schemaBlock(schema, 'model', 'EmployeeWeekPlanItem');
    expect(nextPlan).toMatch(/sourceRowId\s+String\s+@unique\s+@map\("source_row_id"\)/);
    expect(nextPlan).toMatch(/workKind\s+EmployeeWorkKind\s+@map\("work_kind"\)/);
    expect(nextPlan).toMatch(
      /priority\s+EmployeePlanPriority\s+@default\(UNSPECIFIED\)/,
    );
    expect(nextPlan).toMatch(
      /carryStatus\s+EmployeePlanCarryStatus\s+@default\(PLANNED\)/,
    );
    expect(nextPlan).toMatch(
      /matchedWorkItemId\s+String\?\s+@unique\s+@map\("matched_work_item_id"\)/,
    );
    expect(nextPlan).toContain('@@index([employeeId, periodStartAt, archivedAt])');
    expect(nextPlan).toContain('@@index([projectId, periodStartAt, archivedAt])');
  });

  it('adds the V2 weekly workbook catalog through an additive migration', () => {
    const migration = readFileSync(workbookV2MigrationPath, 'utf8');

    expect(migration).toContain('CREATE TYPE "app"."EmployeeWorkKind"');
    expect(migration).toContain('CREATE TYPE "app"."EmployeeWorkSourceSection"');
    expect(migration).toContain('CREATE TYPE "app"."EmployeePlanPriority"');
    expect(migration).toContain('CREATE TYPE "app"."EmployeePlanCarryStatus"');
    expect(migration).toContain(
      'ADD COLUMN "work_direction" TEXT',
    );
    expect(migration).toContain(
      'CREATE TABLE "app"."employee_week_plan_items"',
    );
    expect(migration).toMatch(
      /employee_week_plan_items_source_row_id_fkey"[^;]*ON DELETE RESTRICT/,
    );
    expect(migration).toMatch(
      /employee_week_plan_items_matched_work_item_id_fkey"[^;]*ON DELETE SET NULL/,
    );
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE)\b/i);
  });

  it('keeps the migration data-safe and aligned with the Prisma catalog', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    const compatibilityMigration = readFileSync(compatibilityMigrationPath, 'utf8');
    const collisionSafeCompatibilityMigration = readFileSync(
      collisionSafeCompatibilityMigrationPath,
      'utf8',
    );

    expect(migration).toMatch(
      /BEGIN;\s+LOCK TABLE "app"\."tasks" IN ACCESS EXCLUSIVE MODE;[\s\S]*ALTER COLUMN "code" SET NOT NULL;[\s\S]*CREATE UNIQUE INDEX "tasks_code_key" ON "app"\."tasks"\("code"\);\s+COMMIT;\s+CREATE TABLE "app"\."employee_work_import_batches"/,
    );
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION "app"\."generate_task_code"\(\)[\s\S]*LANGUAGE SQL[\s\S]*VOLATILE/,
    );
    expect(migration).toContain('CREATE SEQUENCE "app"."task_code_seq"');
    expect(migration).toContain(`NEXTVAL('app.task_code_seq')`);
    expect(migration).toMatch(/LPAD\(\s*UPPER\(TO_HEX\(/);
    expect(migration).toMatch(/ROW_NUMBER\(\) OVER \(ORDER BY "id"\)/);
    expect(migration).not.toContain('MD5(');
    expect(migration).toContain('ALTER COLUMN "code" SET DEFAULT "app"."generate_task_code"()');
    expect(migration).toContain(
      'CREATE INDEX "resource_profiles_employment_status_archived_at_display_name_id"',
    );
    expect(migration).toContain(
      'CREATE INDEX "resource_load_entries_employee_work_import_batch_id_archive_idx"',
    );
    expect(compatibilityMigration).toContain('CREATE SEQUENCE IF NOT EXISTS "app"."task_code_seq"');
    expect(compatibilityMigration).toContain(`NEXTVAL('app.task_code_seq')`);
    expect(compatibilityMigration).not.toContain('"max_code_number"');
    expect(compatibilityMigration).toContain('WHERE "tasks"."code" = "candidates"."code"');
    expect(compatibilityMigration).toContain(
      'ALTER COLUMN "code" SET DEFAULT "app"."generate_task_code"()',
    );
    expect(compatibilityMigration).toMatch(
      /ALTER COLUMN "code" SET DEFAULT "app"\."generate_task_code"\(\);\s+COMMIT;\s+CREATE INDEX IF NOT EXISTS "resource_load_entries_employee_work_import_batch_id_archive_idx"/,
    );
    expect(collisionSafeCompatibilityMigration).toContain(
      'LOCK TABLE "app"."tasks" IN ACCESS EXCLUSIVE MODE',
    );
    expect(collisionSafeCompatibilityMigration).toContain('EXISTS(SELECT 1 FROM "app"."tasks")');
    expect(collisionSafeCompatibilityMigration).toContain(
      'WHERE "tasks"."code" = "candidates"."code"',
    );
    expect(collisionSafeCompatibilityMigration).toMatch(
      /ALTER COLUMN "code" SET DEFAULT "app"\."generate_task_code"\(\);\s+COMMIT;\s+CREATE INDEX IF NOT EXISTS "resource_load_entries_employee_work_import_batch_id_archive_idx"/,
    );
    expect(migration).toMatch(/employee_work_items_employee_id_fkey"[^;]*ON DELETE RESTRICT/);
    expect(migration).toMatch(/employee_work_items_import_batch_id_fkey"[^;]*ON DELETE RESTRICT/);
    for (const foreignKey of ['project_id', 'task_id', 'risk_id']) {
      expect(migration).toMatch(
        new RegExp(`employee_work_items_${foreignKey}_fkey"[^;]*ON DELETE SET NULL`),
      );
    }
  });
});
