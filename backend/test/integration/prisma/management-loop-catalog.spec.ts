import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('management loop catalog', () => {
  afterAll(async () => prisma.$disconnect());

  it('creates the management-loop tables and indexes in the app schema', async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'app'
        AND table_name IN ('risks', 'issues', 'decisions', 'partners', 'partner_contacts',
          'partner_agreements', 'communication_records', 'meetings', 'meeting_actions')
    `;

    expect(tables).toHaveLength(9);
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'app'
        AND indexname IN ('risks_project_id_archived_at_status_idx',
          'meeting_actions_meeting_id_archived_at_due_at_idx')
    `;
    expect(indexes).toHaveLength(2);
  });
});
