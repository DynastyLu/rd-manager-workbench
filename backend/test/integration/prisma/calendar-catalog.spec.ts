import { PrismaClient } from '@prisma/client';

describe('calendar catalog', () => {
  const prisma = new PrismaClient();

  afterAll(async () => prisma.$disconnect());

  it('creates the calendar event table, enum and active range indexes', async () => {
    const [tables, enumValues, indexes, constraints] = await Promise.all([
      prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'app' AND table_name = 'calendar_events'
      `,
      prisma.$queryRaw<Array<{ enumlabel: string }>>`
        SELECT enumlabel
        FROM pg_enum
        JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
        JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
        WHERE pg_namespace.nspname = 'app' AND pg_type.typname = 'CalendarEventType'
        ORDER BY pg_enum.enumsortorder
      `,
      prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'app' AND tablename = 'calendar_events'
      `,
      prisma.$queryRaw<Array<{ constraint_name: string }>>`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = 'app'
          AND table_name = 'calendar_events'
          AND constraint_type = 'CHECK'
      `,
    ]);

    expect(tables).toHaveLength(1);
    expect(enumValues.map(({ enumlabel }) => enumlabel)).toEqual([
      'EVENT',
      'INTERVIEW',
      'REVIEW',
      'OTHER',
    ]);
    expect(indexes.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        'calendar_events_start_at_end_at_idx',
        'calendar_events_project_id_archived_at_start_at_idx',
        'calendar_events_active_range_idx',
      ]),
    );
    expect(constraints.map(({ constraint_name }) => constraint_name)).toContain(
      'calendar_events_time_order_check',
    );
  });
});
