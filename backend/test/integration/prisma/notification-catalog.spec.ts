import { PrismaClient } from '@prisma/client';

describe('notification catalog', () => {
  const prisma = new PrismaClient();

  afterAll(async () => prisma.$disconnect());

  it('creates reminder and notification constraints for idempotent due scanning', async () => {
    const [tables, enumValues, indexes] = await Promise.all([
      prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'app'
          AND table_name IN ('reminder_rules', 'notifications')
        ORDER BY table_name
      `,
      prisma.$queryRaw<Array<{ type_name: string; enumlabel: string }>>`
        SELECT pg_type.typname AS type_name, pg_enum.enumlabel
        FROM pg_enum
        JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
        JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
        WHERE pg_namespace.nspname = 'app'
          AND pg_type.typname IN ('ReminderSourceType', 'NotificationStatus')
        ORDER BY pg_type.typname, pg_enum.enumsortorder
      `,
      prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'app'
          AND tablename IN ('reminder_rules', 'notifications')
      `,
    ]);

    expect(tables.map(({ table_name }) => table_name)).toEqual(['notifications', 'reminder_rules']);
    expect(enumValues).toEqual(
      expect.arrayContaining([
        { type_name: 'ReminderSourceType', enumlabel: 'TASK' },
        { type_name: 'ReminderSourceType', enumlabel: 'CALENDAR_EVENT' },
        { type_name: 'ReminderSourceType', enumlabel: 'MEETING' },
        { type_name: 'NotificationStatus', enumlabel: 'UNREAD' },
        { type_name: 'NotificationStatus', enumlabel: 'READ' },
        { type_name: 'NotificationStatus', enumlabel: 'DISMISSED' },
        { type_name: 'NotificationStatus', enumlabel: 'SNOOZED' },
      ]),
    );
    expect(indexes.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        'reminder_rules_source_type_source_id_remind_at_key',
        'reminder_rules_active_due_idx',
        'notifications_reminder_rule_id_key',
        'notifications_source_type_source_id_scheduled_for_key',
        'notifications_status_triggered_at_idx',
        'notifications_due_snooze_idx',
      ]),
    );
  });
});
