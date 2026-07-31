import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { Prisma, PrismaClient } from '@prisma/client';

const TASK_ONE_MIGRATIONS = [
  '20260723010000_employee_work_progress',
  '20260723011000_task_code_sequence_compatibility',
  '20260723012000_task_code_collision_safe_compatibility',
];
// Exact gzip-compressed migration.sql bytes from eba2bc917976c1d0a6a1b938f744d6cd3be24948.
const LEGACY_TASK_ONE_MIGRATION_GZIP_BASE64 =
  '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';
const EXPECTED_INDEXES = [
  'resource_profiles_employment_status_archived_at_display_name_id',
  'tasks_code_key',
  'employee_work_import_batches_period_type_period_start_at_ve_key',
  'employee_work_import_batches_period_type_period_start_at_st_idx',
  'employee_work_import_batches_file_hash_period_type_period_s_idx',
  'employee_work_import_rows_batch_id_row_number_key',
  'employee_work_import_rows_batch_id_status_idx',
  'employee_work_items_source_row_id_key',
  'employee_work_items_risk_id_key',
  'employee_work_items_employee_id_period_start_at_archived_at_idx',
  'employee_work_items_project_id_period_start_at_archived_at_idx',
  'employee_work_items_import_batch_id_archived_at_idx',
  'employee_progress_snapshots_scope_key_period_type_period_st_key',
  'employee_progress_snapshots_scope_type_scope_id_period_type_idx',
  'resource_load_entries_employee_work_item_id_key',
  'resource_load_entries_employee_work_import_batch_id_archive_idx',
];
const EXPECTED_INDEX_COLUMNS: Record<string, string[]> = {
  resource_profiles_employment_status_archived_at_display_name_id: [
    'employment_status',
    'archived_at',
    'display_name',
  ],
  tasks_code_key: ['code'],
  employee_work_import_batches_period_type_period_start_at_ve_key: [
    'period_type',
    'period_start_at',
    'version',
  ],
  employee_work_import_batches_period_type_period_start_at_st_idx: [
    'period_type',
    'period_start_at',
    'status',
  ],
  employee_work_import_batches_file_hash_period_type_period_s_idx: [
    'file_hash',
    'period_type',
    'period_start_at',
  ],
  employee_work_import_rows_batch_id_row_number_key: ['batch_id', 'row_number'],
  employee_work_import_rows_batch_id_status_idx: ['batch_id', 'status'],
  employee_work_items_source_row_id_key: ['source_row_id'],
  employee_work_items_risk_id_key: ['risk_id'],
  employee_work_items_employee_id_period_start_at_archived_at_idx: [
    'employee_id',
    'period_start_at',
    'archived_at',
  ],
  employee_work_items_project_id_period_start_at_archived_at_idx: [
    'project_id',
    'period_start_at',
    'archived_at',
  ],
  employee_work_items_import_batch_id_archived_at_idx: ['import_batch_id', 'archived_at'],
  employee_progress_snapshots_scope_key_period_type_period_st_key: [
    'scope_key',
    'period_type',
    'period_start_at',
    'version',
  ],
  employee_progress_snapshots_scope_type_scope_id_period_type_idx: [
    'scope_type',
    'scope_id',
    'period_type',
    'period_start_at',
  ],
  resource_load_entries_employee_work_item_id_key: ['employee_work_item_id'],
  resource_load_entries_employee_work_import_batch_id_archive_idx: [
    'employee_work_import_batch_id',
    'archived_at',
  ],
};
const EXPECTED_INDEX_TABLES: Record<string, string> = {
  resource_profiles_employment_status_archived_at_display_name_id: 'resource_profiles',
  tasks_code_key: 'tasks',
  employee_work_import_batches_period_type_period_start_at_ve_key: 'employee_work_import_batches',
  employee_work_import_batches_period_type_period_start_at_st_idx: 'employee_work_import_batches',
  employee_work_import_batches_file_hash_period_type_period_s_idx: 'employee_work_import_batches',
  employee_work_import_rows_batch_id_row_number_key: 'employee_work_import_rows',
  employee_work_import_rows_batch_id_status_idx: 'employee_work_import_rows',
  employee_work_items_source_row_id_key: 'employee_work_items',
  employee_work_items_risk_id_key: 'employee_work_items',
  employee_work_items_employee_id_period_start_at_archived_at_idx: 'employee_work_items',
  employee_work_items_project_id_period_start_at_archived_at_idx: 'employee_work_items',
  employee_work_items_import_batch_id_archived_at_idx: 'employee_work_items',
  employee_progress_snapshots_scope_key_period_type_period_st_key: 'employee_progress_snapshots',
  employee_progress_snapshots_scope_type_scope_id_period_type_idx: 'employee_progress_snapshots',
  resource_load_entries_employee_work_item_id_key: 'resource_load_entries',
  resource_load_entries_employee_work_import_batch_id_archive_idx: 'resource_load_entries',
};
const EXPECTED_FOREIGN_KEYS: Record<string, string> = {
  employee_work_import_batches_supersedes_batch_id_fkey: 'SET NULL',
  employee_work_import_batches_restored_from_batch_id_fkey: 'SET NULL',
  employee_work_import_rows_batch_id_fkey: 'CASCADE',
  employee_work_import_rows_resolved_employee_id_fkey: 'SET NULL',
  employee_work_import_rows_resolved_project_id_fkey: 'SET NULL',
  employee_work_import_rows_resolved_task_id_fkey: 'SET NULL',
  employee_work_items_employee_id_fkey: 'RESTRICT',
  employee_work_items_import_batch_id_fkey: 'RESTRICT',
  employee_work_items_source_row_id_fkey: 'RESTRICT',
  employee_work_items_project_id_fkey: 'SET NULL',
  employee_work_items_task_id_fkey: 'SET NULL',
  employee_work_items_risk_id_fkey: 'SET NULL',
  resource_load_entries_employee_work_item_id_fkey: 'SET NULL',
  resource_load_entries_employee_work_import_batch_id_fkey: 'SET NULL',
};
const EXPECTED_FOREIGN_KEY_TABLES: Record<string, string> = {
  employee_work_import_batches_supersedes_batch_id_fkey: 'employee_work_import_batches',
  employee_work_import_batches_restored_from_batch_id_fkey: 'employee_work_import_batches',
  employee_work_import_rows_batch_id_fkey: 'employee_work_import_rows',
  employee_work_import_rows_resolved_employee_id_fkey: 'employee_work_import_rows',
  employee_work_import_rows_resolved_project_id_fkey: 'employee_work_import_rows',
  employee_work_import_rows_resolved_task_id_fkey: 'employee_work_import_rows',
  employee_work_items_employee_id_fkey: 'employee_work_items',
  employee_work_items_import_batch_id_fkey: 'employee_work_items',
  employee_work_items_source_row_id_fkey: 'employee_work_items',
  employee_work_items_project_id_fkey: 'employee_work_items',
  employee_work_items_task_id_fkey: 'employee_work_items',
  employee_work_items_risk_id_fkey: 'employee_work_items',
  resource_load_entries_employee_work_item_id_fkey: 'resource_load_entries',
  resource_load_entries_employee_work_import_batch_id_fkey: 'resource_load_entries',
};

jest.setTimeout(120_000);

describe('employee work progress PostgreSQL catalog', () => {
  const prisma = new PrismaClient();

  afterAll(async () => prisma.$disconnect());

  it('applies every foreign key delete action and key index to the real catalog', async () => {
    const [foreignKeys, indexes] = await Promise.all([
      prisma.$queryRaw<Array<{ constraint_name: string; table_name: string; delete_rule: string }>>`
        SELECT rc.constraint_name, tc.table_name, rc.delete_rule
        FROM information_schema.referential_constraints rc
        JOIN information_schema.table_constraints tc
          ON tc.constraint_schema = rc.constraint_schema
          AND tc.constraint_name = rc.constraint_name
        WHERE rc.constraint_schema = 'app'
          AND rc.constraint_name IN (${Prisma.join(Object.keys(EXPECTED_FOREIGN_KEYS))})
        ORDER BY rc.constraint_name
      `,
      prisma.$queryRaw<Array<{ indexname: string; tablename: string; columns: string[] }>>`
        SELECT
          index_class.relname AS indexname,
          table_class.relname AS tablename,
          ARRAY_AGG(attribute.attname ORDER BY index_column.ordinality) AS columns
        FROM pg_class table_class
        JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
        JOIN pg_index catalog_index ON catalog_index.indrelid = table_class.oid
        JOIN pg_class index_class ON index_class.oid = catalog_index.indexrelid
        JOIN LATERAL UNNEST(catalog_index.indkey)
          WITH ORDINALITY AS index_column(attribute_number, ordinality) ON true
        JOIN pg_attribute attribute
          ON attribute.attrelid = table_class.oid
          AND attribute.attnum = index_column.attribute_number
        WHERE namespace.nspname = 'app'
          AND index_class.relname IN (${Prisma.join(EXPECTED_INDEXES)})
        GROUP BY index_class.relname, table_class.relname
        ORDER BY index_class.relname
      `,
    ]);

    expect(
      Object.fromEntries(
        foreignKeys.map(({ constraint_name, delete_rule }) => [constraint_name, delete_rule]),
      ),
    ).toEqual(EXPECTED_FOREIGN_KEYS);
    expect(
      Object.fromEntries(
        foreignKeys.map(({ constraint_name, table_name }) => [constraint_name, table_name]),
      ),
    ).toEqual(EXPECTED_FOREIGN_KEY_TABLES);
    expect(
      Object.fromEntries(indexes.map(({ indexname, columns }) => [indexname, columns])),
    ).toEqual(EXPECTED_INDEX_COLUMNS);
    expect(
      Object.fromEntries(indexes.map(({ indexname, tablename }) => [indexname, tablename])),
    ).toEqual(EXPECTED_INDEX_TABLES);
  });

  it('enforces task codes and employee catalog defaults, nullability, and uniqueness', async () => {
    const [columns, uniqueIndexes, functionDefinition, sequence] = await Promise.all([
      prisma.$queryRaw<
        Array<{
          table_name: string;
          column_name: string;
          is_nullable: string;
          column_default: string | null;
        }>
      >`
        SELECT table_name, column_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'app'
          AND (table_name, column_name) IN (
            ('tasks', 'code'),
            ('resource_profiles', 'employment_status'),
            ('employee_work_import_batches', 'version'),
            ('employee_work_import_batches', 'period_type'),
            ('employee_work_import_batches', 'status'),
            ('employee_work_import_batches', 'snapshot_status'),
            ('employee_work_import_batches', 'total_rows'),
            ('employee_work_import_batches', 'imported_rows'),
            ('employee_work_import_batches', 'expires_at'),
            ('employee_work_import_rows', 'keep_unlinked'),
            ('employee_work_items', 'source_row_id'),
            ('employee_work_items', 'risk_id'),
            ('employee_progress_snapshots', 'scope_key'),
            ('employee_progress_snapshots', 'source_batch_ids'),
            ('resource_load_entries', 'employee_work_item_id'),
            ('resource_load_entries', 'employee_work_import_batch_id')
          )
        ORDER BY table_name, column_name
      `,
      prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'app'
          AND indexname IN (
            'tasks_code_key',
            'employee_work_import_batches_period_type_period_start_at_ve_key',
            'employee_work_import_rows_batch_id_row_number_key',
            'employee_work_items_source_row_id_key',
            'employee_work_items_risk_id_key',
            'employee_progress_snapshots_scope_key_period_type_period_st_key',
            'resource_load_entries_employee_work_item_id_key'
          )
          AND indexdef LIKE 'CREATE UNIQUE INDEX%'
        ORDER BY indexname
      `,
      prisma.$queryRaw<Array<{ definition: string; volatility: string }>>`
        SELECT pg_get_functiondef(p.oid) AS definition, p.provolatile AS volatility
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'app' AND p.proname = 'generate_task_code'
      `,
      prisma.$queryRaw<
        Array<{
          sequence_name: string;
          start_value: string;
          maximum_value: string;
          increment: string;
          cycle_option: string;
        }>
      >`
        SELECT sequence_name, start_value, maximum_value, increment, cycle_option
        FROM information_schema.sequences
        WHERE sequence_schema = 'app' AND sequence_name = 'task_code_seq'
      `,
    ]);

    const columnMap = Object.fromEntries(
      columns.map((column) => [`${column.table_name}.${column.column_name}`, column]),
    );
    expect(columnMap['tasks.code']).toMatchObject({
      is_nullable: 'NO',
      column_default: 'generate_task_code()',
    });
    expect(columnMap['resource_profiles.employment_status']).toMatchObject({
      is_nullable: 'NO',
    });
    expect(columnMap['resource_profiles.employment_status'].column_default).toContain("'ACTIVE'");
    expect(columnMap['employee_work_import_batches.version']).toMatchObject({
      is_nullable: 'YES',
      column_default: null,
    });
    expect(columnMap['employee_work_import_batches.period_type']).toMatchObject({
      is_nullable: 'NO',
    });
    expect(columnMap['employee_work_import_batches.period_type'].column_default).toContain(
      "'WEEK'",
    );
    expect(columnMap['employee_work_import_batches.status']).toMatchObject({
      is_nullable: 'NO',
    });
    expect(columnMap['employee_work_import_batches.status'].column_default).toContain("'UPLOADED'");
    expect(columnMap['employee_work_import_batches.snapshot_status']).toMatchObject({
      is_nullable: 'NO',
    });
    expect(columnMap['employee_work_import_batches.snapshot_status'].column_default).toContain(
      "'NOT_STARTED'",
    );
    expect(columnMap['employee_work_import_batches.total_rows']).toMatchObject({
      is_nullable: 'NO',
      column_default: '0',
    });
    expect(columnMap['employee_work_import_batches.imported_rows']).toMatchObject({
      is_nullable: 'NO',
      column_default: '0',
    });
    expect(columnMap['employee_work_import_batches.expires_at']).toMatchObject({
      is_nullable: 'NO',
    });
    expect(columnMap['employee_work_import_rows.keep_unlinked']).toMatchObject({
      is_nullable: 'NO',
      column_default: 'false',
    });
    expect(columnMap['employee_work_items.source_row_id']).toMatchObject({
      is_nullable: 'NO',
    });
    expect(columnMap['employee_work_items.risk_id']).toMatchObject({
      is_nullable: 'YES',
    });
    expect(columnMap['employee_progress_snapshots.scope_key']).toMatchObject({
      is_nullable: 'NO',
    });
    expect(columnMap['employee_progress_snapshots.source_batch_ids']).toMatchObject({
      is_nullable: 'NO',
    });
    expect(columnMap['resource_load_entries.employee_work_item_id']).toMatchObject({
      is_nullable: 'YES',
    });
    expect(columnMap['resource_load_entries.employee_work_import_batch_id']).toMatchObject({
      is_nullable: 'YES',
    });
    expect(uniqueIndexes).toHaveLength(7);
    expect(sequence).toEqual([
      {
        sequence_name: 'task_code_seq',
        start_value: '1',
        maximum_value: '1099511627775',
        increment: '1',
        cycle_option: 'NO',
      },
    ]);
    expect(functionDefinition).toHaveLength(1);
    expect(functionDefinition[0].volatility).toBe('v');
    expect(functionDefinition[0].definition).toMatch(
      /nextval\('app\.task_code_seq'(?:::regclass)?\)/i,
    );
    expect(functionDefinition[0].definition).toMatch(/to_hex/i);
    expect(functionDefinition[0].definition).toMatch(/lpad/i);
  });
});

describe('employee task-code migration behavior', () => {
  const backendRoot = resolve(__dirname, '../../..');
  const sourcePrismaDir = resolve(backendRoot, 'prisma');

  function createDatabase(databaseName: string) {
    execFileSync('createdb', [
      '--host=127.0.0.1',
      '--username=postgres',
      '--owner=rd_manager_workbench_app',
      databaseName,
    ]);
    execFileSync('psql', [
      '--host=127.0.0.1',
      '--username=postgres',
      '--dbname',
      databaseName,
      '--set',
      'ON_ERROR_STOP=1',
      '--command',
      'CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm;',
    ], { stdio: 'pipe' });
  }

  function dropDatabase(databaseName: string) {
    execFileSync('dropdb', [
      '--host=127.0.0.1',
      '--username=postgres',
      '--if-exists',
      '--force',
      databaseName,
    ]);
  }

  function databaseUrl(databaseName: string) {
    return `postgresql://rd_manager_workbench_app@127.0.0.1:5432/${databaseName}?schema=app&connection_limit=2`;
  }

  function deploy(schemaPath: string, url: string) {
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', '--schema', schemaPath], {
      cwd: backendRoot,
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
  }

  function applySqlFile(sqlPath: string, url: string) {
    const psqlUrl = new URL(url);
    psqlUrl.search = '';
    execFileSync(
      'psql',
      ['--dbname', psqlUrl.toString(), '--set', 'ON_ERROR_STOP=1', '--file', sqlPath],
      { stdio: 'pipe' },
    );
  }

  function stageLegacyTaskOneMigration(temporaryMigrationsDir: string) {
    const migrationDirectory = resolve(temporaryMigrationsDir, TASK_ONE_MIGRATIONS[0]);
    mkdirSync(migrationDirectory, { recursive: true });
    writeFileSync(
      resolve(migrationDirectory, 'migration.sql'),
      gunzipSync(Buffer.from(LEGACY_TASK_ONE_MIGRATION_GZIP_BASE64, 'base64')),
    );
  }

  function expectNoDrift(schemaPath: string, url: string) {
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'prisma',
        'migrate',
        'diff',
        '--from-url',
        url,
        '--to-schema-datamodel',
        schemaPath,
        '--exit-code',
      ],
      {
        cwd: backendRoot,
        encoding: 'utf8',
        env: process.env,
      },
    );

    expect(result.stderr).toBe('');
    if (result.status === 0) {
      expect(result.stdout.trim()).toBe('No difference detected.');
      return;
    }

    // pgvector's HNSW index and Unsupported vector column cannot be represented
    // completely by Prisma's datamodel diff. This suite owns task-code migrations,
    // so allow only unrelated knowledge-table drift and keep the task catalog strict.
    expect(result.status).toBe(2);
    expect(result.stdout).not.toMatch(/Changed the `tasks` table|task_code/i);
  }

  it('deterministically backfills history and generates unique codes under concurrency', async () => {
    const databaseName = `rdm_task_codes_${process.pid}_${Date.now()}`;
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'rdm-task-code-migration-'));
    const temporaryPrismaDir = join(temporaryRoot, 'prisma');
    const temporaryMigrationsDir = join(temporaryPrismaDir, 'migrations');
    const schemaPath = join(temporaryPrismaDir, 'schema.prisma');
    let client: PrismaClient | undefined;

    try {
      mkdirSync(temporaryMigrationsDir, { recursive: true });
      cpSync(resolve(sourcePrismaDir, 'schema.prisma'), schemaPath);
      for (const migrationName of readdirSync(resolve(sourcePrismaDir, 'migrations'))) {
        if (
          migrationName === 'migration_lock.toml' ||
          migrationName.localeCompare(TASK_ONE_MIGRATIONS[0]) < 0
        ) {
          cpSync(
            resolve(sourcePrismaDir, 'migrations', migrationName),
            resolve(temporaryMigrationsDir, migrationName),
            { recursive: true },
          );
        }
      }

      createDatabase(databaseName);
      const url = databaseUrl(databaseName);
      deploy(schemaPath, url);
      client = new PrismaClient({ datasources: { db: { url } } });
      await client.$executeRawUnsafe(`
        INSERT INTO "app"."tasks" ("id", "title", "updated_at")
        VALUES
          ('legacy-c', 'legacy task c', CURRENT_TIMESTAMP),
          ('legacy-a', 'legacy task a', CURRENT_TIMESTAMP),
          ('legacy-b', 'legacy task b', CURRENT_TIMESTAMP)
      `);

      for (const migrationName of readdirSync(resolve(sourcePrismaDir, 'migrations'))) {
        if (
          migrationName !== 'migration_lock.toml' &&
          migrationName.localeCompare(TASK_ONE_MIGRATIONS[0]) >= 0
        ) {
          cpSync(
            resolve(sourcePrismaDir, 'migrations', migrationName),
            resolve(temporaryMigrationsDir, migrationName),
            { recursive: true },
          );
        }
      }
      deploy(schemaPath, url);
      expectNoDrift(schemaPath, url);

      const history = await client.$queryRawUnsafe<Array<{ id: string; code: string }>>(
        `SELECT "id", "code" FROM "app"."tasks" ORDER BY "id"`,
      );
      expect(history).toEqual([
        { id: 'legacy-a', code: 'TASK-0000000001' },
        { id: 'legacy-b', code: 'TASK-0000000002' },
        { id: 'legacy-c', code: 'TASK-0000000003' },
      ]);

      const generated = await Promise.all(
        Array.from({ length: 256 }, (_, index) =>
          client!.$queryRawUnsafe<Array<{ code: string }>>(
            `INSERT INTO "app"."tasks" ("id", "title", "updated_at")
             VALUES ($1, $2, CURRENT_TIMESTAMP)
             RETURNING "code"`,
            `concurrent-${index}`,
            `concurrent task ${index}`,
          ),
        ),
      );
      const codes = generated.flat().map(({ code }) => code);
      expect(codes.every((code) => /^TASK-[A-F0-9]{10}$/.test(code))).toBe(true);
      expect(new Set(codes).size).toBe(codes.length);
      expect(codes).toContain('TASK-0000000004');
    } finally {
      try {
        await client?.$disconnect();
      } finally {
        try {
          dropDatabase(databaseName);
        } finally {
          rmSync(temporaryRoot, { recursive: true, force: true });
        }
      }
    }
  });

  it('preserves an already-applied legacy catalog and skips occupied sequence codes', async () => {
    const databaseName = `rdm_task_codes_upgrade_${process.pid}_${Date.now()}`;
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'rdm-task-code-upgrade-'));
    const temporaryPrismaDir = join(temporaryRoot, 'prisma');
    const temporaryMigrationsDir = join(temporaryPrismaDir, 'migrations');
    const schemaPath = join(temporaryPrismaDir, 'schema.prisma');
    let client: PrismaClient | undefined;

    try {
      mkdirSync(temporaryMigrationsDir, { recursive: true });
      cpSync(resolve(sourcePrismaDir, 'schema.prisma'), schemaPath);
      for (const migrationName of readdirSync(resolve(sourcePrismaDir, 'migrations'))) {
        if (!TASK_ONE_MIGRATIONS.includes(migrationName)) {
          cpSync(
            resolve(sourcePrismaDir, 'migrations', migrationName),
            resolve(temporaryMigrationsDir, migrationName),
            { recursive: true },
          );
        }
      }
      stageLegacyTaskOneMigration(temporaryMigrationsDir);

      createDatabase(databaseName);
      const url = databaseUrl(databaseName);
      deploy(schemaPath, url);
      client = new PrismaClient({ datasources: { db: { url } } });
      await client.$executeRawUnsafe(`
        INSERT INTO "app"."tasks" ("id", "title", "updated_at")
        VALUES
          ('legacy-max', 'legacy max code', CURRENT_TIMESTAMP),
          ('legacy-next', 'legacy next code', CURRENT_TIMESTAMP),
          ('legacy-other', 'legacy other code', CURRENT_TIMESTAMP)
      `);
      applySqlFile(resolve(backendRoot, 'test/fixtures/prisma/legacy-task-code-catalog.sql'), url);
      const beforeUpgrade = await client.$queryRawUnsafe<Array<{ id: string; code: string }>>(
        `SELECT "id", "code" FROM "app"."tasks" ORDER BY "id"`,
      );

      cpSync(
        resolve(sourcePrismaDir, 'migrations', TASK_ONE_MIGRATIONS[1]),
        resolve(temporaryMigrationsDir, TASK_ONE_MIGRATIONS[1]),
        { recursive: true },
      );
      deploy(schemaPath, url);

      const afterFirstCompatibility = await client.$queryRawUnsafe<
        Array<{ id: string; code: string }>
      >(`SELECT "id", "code" FROM "app"."tasks" ORDER BY "id"`);
      expect(afterFirstCompatibility).toEqual(beforeUpgrade);
      const insertedAfterFirstCompatibility = await client.$queryRawUnsafe<Array<{ code: string }>>(
        `INSERT INTO "app"."tasks" ("id", "title", "updated_at")
         VALUES ('after-first-compatibility', 'after first compatibility', CURRENT_TIMESTAMP)
         RETURNING "code"`,
      );
      expect(insertedAfterFirstCompatibility).toEqual([{ code: 'TASK-0000000005' }]);

      cpSync(
        resolve(sourcePrismaDir, 'migrations', TASK_ONE_MIGRATIONS[2]),
        resolve(temporaryMigrationsDir, TASK_ONE_MIGRATIONS[2]),
        { recursive: true },
      );
      deploy(schemaPath, url);

      const afterUpgrade = await client.$queryRawUnsafe<Array<{ id: string; code: string }>>(
        `SELECT "id", "code" FROM "app"."tasks" ORDER BY "id"`,
      );
      expect(afterUpgrade).toEqual([
        { id: 'after-first-compatibility', code: 'TASK-0000000005' },
        ...beforeUpgrade,
      ]);
      const inserted = await client.$queryRawUnsafe<Array<{ code: string }>>(
        `INSERT INTO "app"."tasks" ("id", "title", "updated_at")
         VALUES ('after-upgrade', 'after upgrade', CURRENT_TIMESTAMP)
         RETURNING "code"`,
      );
      expect(inserted).toEqual([{ code: 'TASK-0000000006' }]);
      expectNoDrift(schemaPath, url);
    } finally {
      try {
        await client?.$disconnect();
      } finally {
        try {
          dropDatabase(databaseName);
        } finally {
          rmSync(temporaryRoot, { recursive: true, force: true });
        }
      }
    }
  });

  it('starts at one when all migrations deploy to an empty database', async () => {
    const databaseName = `rdm_task_codes_empty_${process.pid}_${Date.now()}`;
    let client: PrismaClient | undefined;

    try {
      createDatabase(databaseName);
      const url = databaseUrl(databaseName);
      deploy(resolve(sourcePrismaDir, 'schema.prisma'), url);
      expectNoDrift(resolve(sourcePrismaDir, 'schema.prisma'), url);
      client = new PrismaClient({ datasources: { db: { url } } });
      const inserted = await client.$queryRawUnsafe<Array<{ code: string }>>(
        `INSERT INTO "app"."tasks" ("id", "title", "updated_at")
         VALUES ('first-task', 'first task', CURRENT_TIMESTAMP)
         RETURNING "code"`,
      );
      expect(inserted).toEqual([{ code: 'TASK-0000000001' }]);
    } finally {
      try {
        await client?.$disconnect();
      } finally {
        dropDatabase(databaseName);
      }
    }
  });
});
