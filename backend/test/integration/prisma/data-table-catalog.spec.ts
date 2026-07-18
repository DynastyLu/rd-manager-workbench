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

  it.each(['DataWorkspace', 'DataTable', 'DataField', 'DataRecord', 'DataView'])(
    'declares %s in the Prisma schema',
    (model) => expect(schema).toContain(`model ${model}`),
  );

  it.each(['DataTableSource', 'DataFieldType', 'DataViewType'])(
    'declares %s in the Prisma schema',
    (type) => expect(schema).toContain(`enum ${type}`),
  );

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
