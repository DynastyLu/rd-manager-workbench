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
