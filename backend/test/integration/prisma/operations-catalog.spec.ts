import { PrismaClient } from '@prisma/client';

describe('operations catalog and Prisma contract', () => {
  const prisma = new PrismaClient();

  afterAll(async () => prisma.$disconnect());

  it('keeps the applied operations tables, enums, indexes and constraints intact', async () => {
    const [tables, enumValues, indexes, foreignKeys, checks] = await Promise.all([
      prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'app'
          AND table_name IN (
            'non_project_rd_items', 'non_project_rd_outcomes', 'resource_profiles',
            'resource_skills', 'resource_load_entries', 'weekly_report_drafts'
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
            'NonProjectRdKind', 'NonProjectRdStatus', 'NonProjectOutcomeStatus',
            'SkillLevel', 'LoadEntryKind', 'WeeklyReportStatus'
          )
      `,
      prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'app'
          AND indexname IN (
            'non_project_rd_items_code_key',
            'resource_profiles_display_name_key',
            'resource_skills_resource_id_name_key',
            'weekly_report_drafts_week_start_at_version_key'
          )
      `,
      prisma.$queryRaw<Array<{ constraint_name: string }>>`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = 'app'
          AND table_name IN (
            'non_project_rd_items', 'non_project_rd_outcomes', 'resource_skills',
            'resource_load_entries'
          )
          AND constraint_type = 'FOREIGN KEY'
      `,
      prisma.$queryRaw<Array<{ constraint_name: string }>>`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = 'app'
          AND table_name = 'resource_load_entries'
          AND constraint_type = 'CHECK'
      `,
    ]);

    expect(tables.map(({ table_name }) => table_name)).toEqual([
      'non_project_rd_items',
      'non_project_rd_outcomes',
      'resource_load_entries',
      'resource_profiles',
      'resource_skills',
      'weekly_report_drafts',
    ]);
    expect(enumValues).toEqual(
      expect.arrayContaining([
        { type_name: 'NonProjectRdKind', enumlabel: 'TECH_EXPLORATION' },
        { type_name: 'NonProjectRdStatus', enumlabel: 'COMPLETED' },
        { type_name: 'NonProjectOutcomeStatus', enumlabel: 'VERIFIED' },
        { type_name: 'SkillLevel', enumlabel: 'EXPERT' },
        { type_name: 'LoadEntryKind', enumlabel: 'NON_PROJECT_RD' },
        { type_name: 'WeeklyReportStatus', enumlabel: 'FINAL' },
      ]),
    );
    expect(indexes.map(({ indexname }) => indexname)).toHaveLength(4);
    expect(foreignKeys.map(({ constraint_name }) => constraint_name)).toEqual(
      expect.arrayContaining([
        'non_project_rd_items_project_id_fkey',
        'non_project_rd_outcomes_item_id_fkey',
        'resource_skills_resource_id_fkey',
        'resource_load_entries_resource_id_fkey',
        'resource_load_entries_non_project_rd_item_id_fkey',
        'resource_load_entries_project_id_fkey',
        'resource_load_entries_task_id_fkey',
      ]),
    );
    expect(checks.map(({ constraint_name }) => constraint_name)).toContain(
      'resource_load_entries_reference_by_kind_check',
    );
  });

  it('exposes every applied operations table through Prisma Client', () => {
    const delegates = prisma as unknown as Record<string, unknown>;
    expect(delegates.nonProjectRdItem).toBeDefined();
    expect(delegates.nonProjectRdOutcome).toBeDefined();
    expect(delegates.resourceProfile).toBeDefined();
    expect(delegates.resourceSkill).toBeDefined();
    expect(delegates.resourceLoadEntry).toBeDefined();
    expect(delegates.weeklyReportDraft).toBeDefined();
  });
});
