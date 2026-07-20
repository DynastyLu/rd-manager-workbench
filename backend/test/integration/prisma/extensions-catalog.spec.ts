import { PrismaClient } from '@prisma/client';

describe('external extension catalog', () => {
  const prisma = new PrismaClient();

  afterAll(async () => prisma.$disconnect());

  it('installs the secure extension tables, enums and constraints', async () => {
    const [tables, enums, constraints] = await Promise.all([
      prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'app'
          AND table_name IN (
            'extension_profiles', 'extension_runs', 'sms_recipients',
            'sms_deliveries', 'external_object_links', 'external_sync_sessions'
          )
        ORDER BY table_name
      `,
      prisma.$queryRaw<Array<{ type_name: string; enumlabel: string }>>`
        SELECT pg_type.typname AS type_name, pg_enum.enumlabel
        FROM pg_enum
        JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
        JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
        WHERE pg_namespace.nspname = 'app'
          AND pg_type.typname IN (
            'ExtensionKind', 'ExtensionRunStatus', 'SmsDeliveryStatus',
            'ExternalSyncDirection', 'ExternalConflictState', 'ReminderChannel'
          )
      `,
      prisma.$queryRaw<Array<{ constraint_name: string }>>`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_schema = 'app'
          AND table_name IN ('extension_runs', 'sms_recipients', 'sms_deliveries')
          AND constraint_type = 'CHECK'
      `,
    ]);

    expect(tables.map(({ table_name }) => table_name)).toEqual([
      'extension_profiles',
      'extension_runs',
      'external_object_links',
      'external_sync_sessions',
      'sms_deliveries',
      'sms_recipients',
    ]);
    expect(enums).toEqual(
      expect.arrayContaining([
        { type_name: 'ExtensionKind', enumlabel: 'AI' },
        { type_name: 'ExtensionRunStatus', enumlabel: 'REJECTED' },
        { type_name: 'SmsDeliveryStatus', enumlabel: 'PREVIEW' },
        { type_name: 'ExternalSyncDirection', enumlabel: 'PULL_ONLY' },
        { type_name: 'ExternalConflictState', enumlabel: 'CONFLICT' },
        { type_name: 'ReminderChannel', enumlabel: 'SMS' },
      ]),
    );
    expect(constraints.map(({ constraint_name }) => constraint_name)).toEqual(
      expect.arrayContaining([
        'extension_runs_hashes_check',
        'extension_runs_body_free_metadata_check',
        'sms_recipients_mask_check',
        'sms_deliveries_attempt_count_check',
      ]),
    );
  });

  it('exposes all catalog delegates through Prisma Client', () => {
    const delegates = prisma as unknown as Record<string, unknown>;
    expect(delegates.extensionProfile).toBeDefined();
    expect(delegates.extensionRun).toBeDefined();
    expect(delegates.smsRecipient).toBeDefined();
    expect(delegates.smsDelivery).toBeDefined();
    expect(delegates.externalObjectLink).toBeDefined();
    expect(delegates.externalSyncSession).toBeDefined();
  });
});
