import { PrismaClient } from '@prisma/client';

describe('content and file catalog', () => {
  const prisma = new PrismaClient();

  afterAll(async () => prisma.$disconnect());

  it('creates content tables, lifecycle enums and active query indexes', async () => {
    const [tables, enumValues, indexes, constraints] = await Promise.all([
      prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'app'
          AND table_name IN (
            'knowledge_spaces',
            'content_documents',
            'document_versions',
            'file_assets',
            'file_versions'
          )
        ORDER BY table_name
      `,
      prisma.$queryRaw<Array<{ type_name: string; enumlabel: string }>>`
        SELECT pg_type.typname AS type_name, pg_enum.enumlabel
        FROM pg_enum
        JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
        JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
        WHERE pg_namespace.nspname = 'app'
          AND pg_type.typname IN ('ContentDocumentType', 'ContentStatus', 'FileAssetStatus')
      `,
      prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'app'
          AND tablename IN ('content_documents', 'document_versions', 'file_assets', 'file_versions')
      `,
      prisma.$queryRaw<Array<{ constraint_name: string }>>`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = 'app'
          AND table_name IN ('content_documents', 'document_versions', 'file_assets', 'file_versions')
          AND constraint_type = 'CHECK'
      `,
    ]);

    expect(tables.map(({ table_name }) => table_name)).toEqual([
      'content_documents',
      'document_versions',
      'file_assets',
      'file_versions',
      'knowledge_spaces',
    ]);
    expect(enumValues).toEqual(
      expect.arrayContaining([
        { type_name: 'ContentDocumentType', enumlabel: 'DOCUMENT' },
        { type_name: 'ContentDocumentType', enumlabel: 'KNOWLEDGE_PAGE' },
        { type_name: 'ContentDocumentType', enumlabel: 'MEETING_MINUTES' },
        { type_name: 'ContentStatus', enumlabel: 'ACTIVE' },
        { type_name: 'ContentStatus', enumlabel: 'TRASHED' },
        { type_name: 'FileAssetStatus', enumlabel: 'ACTIVE' },
        { type_name: 'FileAssetStatus', enumlabel: 'TRASHED' },
      ]),
    );
    expect(indexes.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        'content_documents_active_updated_at_idx',
        'content_documents_unique_meeting_minutes_idx',
        'content_documents_space_id_parent_id_status_idx',
        'document_versions_document_id_version_number_key',
        'file_assets_document_id_status_updated_at_idx',
        'file_versions_file_asset_id_version_number_key',
        'file_versions_storage_key_key',
      ]),
    );
    expect(constraints.map(({ constraint_name }) => constraint_name)).toEqual(
      expect.arrayContaining([
        'content_documents_parent_not_self_check',
        'content_documents_trash_state_check',
        'document_versions_positive_version_check',
        'file_assets_trash_state_check',
        'file_versions_size_nonnegative_check',
        'file_versions_sha256_check',
      ]),
    );
  });
});
