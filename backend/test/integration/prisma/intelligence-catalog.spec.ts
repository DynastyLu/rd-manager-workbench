import { PrismaClient } from '@prisma/client';

describe('intelligence catalog and conversion constraints', () => {
  const prisma = new PrismaClient();

  afterAll(async () => prisma.$disconnect());

  it('stores the complete intelligence catalog in the app schema', async () => {
    const [tables, enumValues, indexes, foreignKeys] = await Promise.all([
      prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'app'
          AND table_name IN (
            'intelligence_topics', 'intelligence_sources', 'intelligence_collection_plans',
            'intelligence_runs', 'intelligence_items', 'intelligence_occurrences',
            'intelligence_item_topics', 'intelligence_item_projects',
            'intelligence_conversions', 'intelligence_briefs', 'intelligence_brief_items'
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
            'IntelligenceSourceKind', 'IntelligenceCollectionFrequency',
            'IntelligenceRunTrigger', 'IntelligenceRunStatus',
            'IntelligencePriority', 'IntelligenceItemStatus',
            'IntelligenceConversionKind', 'IntelligenceBriefKind'
          )
      `,
      prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'app'
          AND indexname IN (
            'intelligence_topics_active_name_key',
            'intelligence_sources_active_name_key',
            'intelligence_items_content_hash_key',
            'intelligence_occurrences_item_id_source_id_source_url_key',
            'intelligence_conversions_item_id_kind_key',
            'intelligence_briefs_kind_brief_date_key'
          )
        ORDER BY indexname
      `,
      prisma.$queryRaw<Array<{ constraint_name: string }>>`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = 'app'
          AND table_name IN (
            'intelligence_collection_plans', 'intelligence_runs', 'intelligence_occurrences',
            'intelligence_item_topics', 'intelligence_item_projects',
            'intelligence_conversions', 'intelligence_brief_items'
          )
          AND constraint_type = 'FOREIGN KEY'
      `,
    ]);

    expect(tables.map(({ table_name }) => table_name)).toEqual([
      'intelligence_brief_items',
      'intelligence_briefs',
      'intelligence_collection_plans',
      'intelligence_conversions',
      'intelligence_item_projects',
      'intelligence_item_topics',
      'intelligence_items',
      'intelligence_occurrences',
      'intelligence_runs',
      'intelligence_sources',
      'intelligence_topics',
    ]);
    expect(enumValues).toEqual(
      expect.arrayContaining([
        { type_name: 'IntelligenceSourceKind', enumlabel: 'DATABASE' },
        { type_name: 'IntelligenceCollectionFrequency', enumlabel: 'WEEKLY' },
        { type_name: 'IntelligenceRunTrigger', enumlabel: 'CONNECTOR' },
        { type_name: 'IntelligenceRunStatus', enumlabel: 'FAILED' },
        { type_name: 'IntelligencePriority', enumlabel: 'CRITICAL' },
        { type_name: 'IntelligenceItemStatus', enumlabel: 'ACTIONED' },
        { type_name: 'IntelligenceConversionKind', enumlabel: 'KNOWLEDGE' },
        { type_name: 'IntelligenceBriefKind', enumlabel: 'WEEKLY' },
      ]),
    );
    expect(indexes.map(({ indexname }) => indexname)).toEqual([
      'intelligence_briefs_kind_brief_date_key',
      'intelligence_conversions_item_id_kind_key',
      'intelligence_items_content_hash_key',
      'intelligence_occurrences_item_id_source_id_source_url_key',
      'intelligence_sources_active_name_key',
      'intelligence_topics_active_name_key',
    ]);
    expect(foreignKeys.map(({ constraint_name }) => constraint_name)).toEqual(
      expect.arrayContaining([
        'intelligence_collection_plans_source_id_fkey',
        'intelligence_runs_plan_id_fkey',
        'intelligence_occurrences_item_id_fkey',
        'intelligence_occurrences_source_id_fkey',
        'intelligence_item_topics_topic_id_fkey',
        'intelligence_item_projects_project_id_fkey',
        'intelligence_conversions_item_id_fkey',
        'intelligence_brief_items_brief_id_fkey',
      ]),
    );
  });

  it('exposes every intelligence table through Prisma Client', () => {
    const delegates = prisma as unknown as Record<string, unknown>;
    expect(delegates.intelligenceTopic).toBeDefined();
    expect(delegates.intelligenceSource).toBeDefined();
    expect(delegates.intelligenceCollectionPlan).toBeDefined();
    expect(delegates.intelligenceRun).toBeDefined();
    expect(delegates.intelligenceItem).toBeDefined();
    expect(delegates.intelligenceOccurrence).toBeDefined();
    expect(delegates.intelligenceItemTopic).toBeDefined();
    expect(delegates.intelligenceItemProject).toBeDefined();
    expect(delegates.intelligenceConversion).toBeDefined();
    expect(delegates.intelligenceBrief).toBeDefined();
    expect(delegates.intelligenceBriefItem).toBeDefined();
  });
});
