import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function modelBlock(schema: string, modelName: string): string {
  const match = schema.match(new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`));

  if (!match) {
    throw new Error(`Missing ${modelName} model`);
  }

  return match[1];
}

describe('project progress linkage catalog contract', () => {
  const schemaPath = resolve(__dirname, '../../../prisma/schema.prisma');
  const migrationPath = resolve(
    __dirname,
    '../../../prisma/migrations/20260728093000_project_progress_linkage/migration.sql',
  );

  it('declares progress linkage enums, fields, relations, and indexes', () => {
    const schema = readFileSync(schemaPath, 'utf8');
    const project = modelBlock(schema, 'Project');
    const milestone = modelBlock(schema, 'Milestone');
    const workTask = modelBlock(schema, 'WorkTask');
    const progressReport = modelBlock(schema, 'ProgressReport');

    expect(schema).toMatch(/enum ProjectWeightMode/);
    expect(schema).toMatch(/enum ProgressReportSourceType/);
    expect(project).toMatch(/weightMode\s+ProjectWeightMode/);
    expect(milestone).toMatch(/plannedStartAt\s+DateTime\?/);
    expect(milestone).toMatch(/plannedEndAt\s+DateTime\?/);
    expect(milestone).toMatch(/weightPercent\s+Decimal\?/);
    expect(milestone).toMatch(/manualCompletionPercent\s+Decimal\?/);
    expect(milestone).toMatch(/progressReports\s+ProgressReport\[\]/);
    expect(workTask).toMatch(/progressReports\s+ProgressReport\[\]/);
    expect(progressReport).toMatch(/sourceType\s+ProgressReportSourceType/);
    expect(progressReport).toMatch(/completionPercent\s+Decimal/);
    expect(progressReport).toMatch(/previousPercent\s+Decimal\?/);
    expect(progressReport).toMatch(/milestoneId\s+String\?/);
    expect(progressReport).toMatch(/taskId\s+String\?/);
    expect(progressReport).toMatch(/nextSteps\s+String\?/);
    expect(progressReport).toMatch(/completedResults\s+String\?/);
    expect(progressReport).toMatch(/changeSnapshot\s+Json\?/);
    expect(progressReport).toContain('@@index([projectId, sourceType, reportedAt])');
  });

  it('ships an additive migration that backfills legacy dates and report sources', () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toContain('CREATE TYPE "app"."ProjectWeightMode"');
    expect(migration).toContain('CREATE TYPE "app"."ProgressReportSourceType"');
    expect(migration).toContain('SET "planned_end_at" = "planned_at"');
    expect(migration).toContain('SET "source_type" = \'MANUAL\'');
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE)/i);
  });
});
