import { PrismaClient } from '@prisma/client';

describe('non-project RD completion catalog', () => {
  const prisma = new PrismaClient();

  afterAll(async () => prisma.$disconnect());

  it('stores the explicit outcome-waiver reason', async () => {
    const columns = await prisma.$queryRaw<Array<{ column_name: string; is_nullable: string }>>`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'app'
        AND table_name = 'non_project_rd_items'
        AND column_name = 'outcome_waived_reason'
    `;

    expect(columns).toEqual([{ column_name: 'outcome_waived_reason', is_nullable: 'YES' }]);
  });
});
