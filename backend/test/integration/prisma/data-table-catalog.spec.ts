import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('multi-dimensional data table catalog', () => {
  const schema = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');
  const integrityMigration = readFileSync(
    join(
      __dirname,
      '../../../prisma/migrations/20260719030001_enforce_data_table_integrity/migration.sql',
    ),
    'utf8',
  );
  const computedFieldsMigration = readFileSync(
    join(
      __dirname,
      '../../../prisma/migrations/20260719040000_add_computed_data_fields/migration.sql',
    ),
    'utf8',
  );
  const dataFieldTypeEnumMatch = schema.match(/enum DataFieldType\s*\{([\s\S]*?)\n\}/);

  if (!dataFieldTypeEnumMatch) {
    throw new Error('Could not extract the DataFieldType enum from the Prisma schema');
  }

  const dataFieldTypeMembers = dataFieldTypeEnumMatch[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('@@'));
  const computedFieldMigrationStatements = computedFieldsMigration
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((statement) => `${statement};`);
  const expectedComputedFieldMigrationStatements = ['LOOKUP', 'ROLLUP', 'FORMULA'].map(
    (fieldType) =>
      `ALTER TYPE "app"."DataFieldType" ADD VALUE IF NOT EXISTS '${fieldType}';`,
  );

  it.each(['DataWorkspace', 'DataTable', 'DataField', 'DataRecord', 'DataView'])(
    'declares %s in the Prisma schema',
    (model) => expect(schema).toContain(`model ${model}`),
  );

  it.each(['DataTableSource', 'DataFieldType', 'DataViewType'])(
    'declares %s in the Prisma schema',
    (type) => expect(schema).toContain(`enum ${type}`),
  );

  it.each(['LOOKUP', 'ROLLUP', 'FORMULA'])(
    'declares the %s computed field type',
    (fieldType) => expect(dataFieldTypeMembers).toContain(fieldType),
  );

  it.each(expectedComputedFieldMigrationStatements)(
    'applies the computed field migration statement %s',
    (statement) => expect(computedFieldMigrationStatements).toContain(statement),
  );

  it('contains no additional computed field migration statements', () => {
    expect(computedFieldMigrationStatements).toEqual(expectedComputedFieldMigrationStatements);
  });

  it('keeps custom records and saved views attached to their table', () => {
    expect(schema).toContain('records     DataRecord[]');
    expect(schema).toContain('views       DataView[]');
    expect(schema).toContain('@@unique([tableId, key])');
  });

  it('enforces one active primary field per table at the database boundary', () => {
    expect(integrityMigration).toContain('CREATE UNIQUE INDEX');
    expect(integrityMigration).toContain('"is_primary" = true');
    expect(integrityMigration).toContain('"archived_at" IS NULL');
  });
});
