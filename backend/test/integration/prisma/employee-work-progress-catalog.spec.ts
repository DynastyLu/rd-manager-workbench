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
      /code\s+String\s+@unique\s+@default\(dbgenerated\("app\.generate_task_code\(\)"\)\)/,
    );
    expect(schemaBlock(schema, 'model', 'ResourceLoadEntry')).toMatch(
      /employeeWorkItemId\s+String\?\s+@unique/,
    );
    expect(schemaBlock(schema, 'model', 'EmployeeWorkItem')).toMatch(
      /riskId\s+String\?\s+@unique/,
    );
    expect(schemaBlock(schema, 'model', 'ResourceProfile')).toContain(
      '@@index([employmentStatus, archivedAt, displayName], map: "resource_profiles_employment_status_archived_at_display_name_id")',
    );
  });

  it('keeps the migration data-safe and aligned with the Prisma catalog', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION "app"\."generate_task_code"\(\)[\s\S]*LANGUAGE SQL[\s\S]*VOLATILE/,
    );
    expect(migration).toContain('RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT');
    expect(migration).not.toContain('TXID_CURRENT');
    expect(migration).toMatch(
      /UPDATE "app"\."tasks"\s+SET "code" = 'TASK-' \|\| UPPER\(SUBSTRING\(MD5\("id"\), 1, 10\)\)/,
    );
    expect(migration).toContain(
      'ALTER COLUMN "code" SET DEFAULT "app"."generate_task_code"()',
    );
    expect(migration).toContain(
      'CREATE INDEX "resource_profiles_employment_status_archived_at_display_name_id"',
    );
    expect(migration).toMatch(
      /employee_work_items_employee_id_fkey"[^;]*ON DELETE RESTRICT/,
    );
    expect(migration).toMatch(
      /employee_work_items_import_batch_id_fkey"[^;]*ON DELETE RESTRICT/,
    );
    for (const foreignKey of ['project_id', 'task_id', 'risk_id']) {
      expect(migration).toMatch(
        new RegExp(`employee_work_items_${foreignKey}_fkey"[^;]*ON DELETE SET NULL`),
      );
    }
  });
});
