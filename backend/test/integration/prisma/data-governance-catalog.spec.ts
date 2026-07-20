import { PrismaClient } from '@prisma/client';

describe('data governance catalog and immutability contract', () => {
  const prisma = new PrismaClient();

  afterAll(async () => prisma.$disconnect());

  it('stores governance settings, backup records, restore preflights and audit logs', async () => {
    const [tables, columns, enumValues, indexes] = await Promise.all([
      prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'app'
          AND table_name IN (
            'governance_settings', 'backup_records', 'restore_preflights', 'audit_logs'
          )
        ORDER BY table_name
      `,
      prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'app'
          AND table_name IN (
            'governance_settings', 'backup_records', 'restore_preflights', 'audit_logs'
          )
        ORDER BY table_name, ordinal_position
      `,
      prisma.$queryRaw<Array<{ type_name: string; enumlabel: string }>>`
        SELECT pg_type.typname AS type_name, pg_enum.enumlabel
        FROM pg_enum
        JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
        JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
        WHERE pg_namespace.nspname = 'app'
          AND pg_type.typname IN (
            'BackupKind', 'BackupStatus', 'RestorePreflightStatus', 'AuditOutcome'
          )
      `,
      prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'app'
          AND indexname IN (
            'backup_records_scheduled_local_date_key',
            'backup_records_status_created_at_idx',
            'restore_preflights_backup_id_status_idx',
            'audit_logs_occurred_at_idx',
            'audit_logs_entity_type_entity_id_occurred_at_idx'
          )
        ORDER BY indexname
      `,
    ]);

    expect(tables.map(({ table_name }) => table_name)).toEqual([
      'audit_logs',
      'backup_records',
      'governance_settings',
      'restore_preflights',
    ]);
    expect(columns).toEqual(
      expect.arrayContaining([
        { table_name: 'governance_settings', column_name: 'auto_backup_time_local' },
        { table_name: 'governance_settings', column_name: 'retention_days' },
        { table_name: 'backup_records', column_name: 'relative_directory' },
        { table_name: 'backup_records', column_name: 'scheduled_local_date' },
        { table_name: 'backup_records', column_name: 'manifest_sha256' },
        { table_name: 'restore_preflights', column_name: 'confirmation_hash' },
        { table_name: 'restore_preflights', column_name: 'expires_at' },
        { table_name: 'audit_logs', column_name: 'changed_fields' },
        { table_name: 'audit_logs', column_name: 'metadata' },
      ]),
    );
    expect(enumValues).toEqual(
      expect.arrayContaining([
        { type_name: 'BackupKind', enumlabel: 'MANUAL' },
        { type_name: 'BackupKind', enumlabel: 'PRE_RESTORE' },
        { type_name: 'BackupStatus', enumlabel: 'VERIFIED' },
        { type_name: 'BackupStatus', enumlabel: 'RESTORED' },
        { type_name: 'RestorePreflightStatus', enumlabel: 'READY' },
        { type_name: 'RestorePreflightStatus', enumlabel: 'CONSUMED' },
        { type_name: 'AuditOutcome', enumlabel: 'SUCCEEDED' },
        { type_name: 'AuditOutcome', enumlabel: 'FAILED' },
      ]),
    );
    expect(indexes.map(({ indexname }) => indexname)).toEqual([
      'audit_logs_entity_type_entity_id_occurred_at_idx',
      'audit_logs_occurred_at_idx',
      'backup_records_scheduled_local_date_key',
      'backup_records_status_created_at_idx',
      'restore_preflights_backup_id_status_idx',
    ]);
  });

  it('exposes every governance table through Prisma Client', () => {
    const delegates = prisma as unknown as Record<string, unknown>;
    expect(delegates.governanceSetting).toBeDefined();
    expect(delegates.backupRecord).toBeDefined();
    expect(delegates.restorePreflight).toBeDefined();
    expect(delegates.auditLog).toBeDefined();
  });

  it('rejects updates and deletes of audit log rows at the database boundary', async () => {
    const audit = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO app.audit_logs (
        id, action, entity_type, outcome, changed_fields, metadata, occurred_at
      ) VALUES (
        concat('catalog-', floor(random() * 1000000000)::text),
        'CATALOG_TEST',
        'AuditLog',
        'SUCCEEDED'::app."AuditOutcome",
        ARRAY['status']::TEXT[],
        '{}'::JSONB,
        now()
      )
      RETURNING id
    `;

    await expect(
      prisma.$executeRawUnsafe(
        'UPDATE app.audit_logs SET action = $1 WHERE id = $2',
        'MUTATED',
        audit[0].id,
      ),
    ).rejects.toThrow(/immutable/i);
    await expect(
      prisma.$executeRawUnsafe('DELETE FROM app.audit_logs WHERE id = $1', audit[0].id),
    ).rejects.toThrow(/immutable/i);
  });
});
