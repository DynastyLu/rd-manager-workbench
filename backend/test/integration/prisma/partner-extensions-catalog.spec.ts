import { PrismaClient } from '@prisma/client';

describe('partner operations extensions catalog', () => {
  const prisma = new PrismaClient();

  afterAll(async () => prisma.$disconnect());

  it('stores partner-project links with the expected columns and composite uniqueness', async () => {
    const [tables, columns, constraints] = await Promise.all([
      prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'app'
          AND table_name = 'partner_projects'
      `,
      prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'app'
          AND table_name = 'partner_projects'
        ORDER BY ordinal_position
      `,
      prisma.$queryRaw<
        Array<{
          constraint_name: string;
          constraint_type: string;
        }>
      >`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_schema = 'app'
          AND table_name = 'partner_projects'
        ORDER BY constraint_name
      `,
    ]);

    expect(tables).toEqual([{ table_name: 'partner_projects' }]);
    expect(columns.map(({ column_name }) => column_name)).toEqual([
      'partner_id',
      'project_id',
      'role',
      'notes',
      'created_at',
    ]);
    expect(constraints).toEqual(
      expect.arrayContaining([
        {
          constraint_name: 'partner_projects_pkey',
          constraint_type: 'PRIMARY KEY',
        },
        {
          constraint_name: 'partner_projects_partner_id_fkey',
          constraint_type: 'FOREIGN KEY',
        },
        {
          constraint_name: 'partner_projects_project_id_fkey',
          constraint_type: 'FOREIGN KEY',
        },
      ]),
    );
  });

  it('enforces one task per communication and non-project RD item', async () => {
    const [columns, indexes, foreignKeys] = await Promise.all([
      prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'app'
          AND column_name = 'task_id'
          AND table_name IN ('communication_records', 'non_project_rd_items')
        ORDER BY table_name
      `,
      prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'app'
          AND indexname IN (
            'communication_records_task_id_key',
            'non_project_rd_items_task_id_key'
          )
        ORDER BY indexname
      `,
      prisma.$queryRaw<Array<{ constraint_name: string }>>`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = 'app'
          AND table_name IN ('communication_records', 'non_project_rd_items')
          AND constraint_type = 'FOREIGN KEY'
          AND constraint_name IN (
            'communication_records_task_id_fkey',
            'non_project_rd_items_task_id_fkey'
          )
        ORDER BY constraint_name
      `,
    ]);

    expect(columns).toEqual([
      { table_name: 'communication_records', column_name: 'task_id' },
      { table_name: 'non_project_rd_items', column_name: 'task_id' },
    ]);
    expect(indexes.map(({ indexname }) => indexname)).toEqual([
      'communication_records_task_id_key',
      'non_project_rd_items_task_id_key',
    ]);
    expect(foreignKeys.map(({ constraint_name }) => constraint_name)).toEqual([
      'communication_records_task_id_fkey',
      'non_project_rd_items_task_id_fkey',
    ]);
  });
});
