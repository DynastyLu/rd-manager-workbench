import { PrismaClient } from '@prisma/client';

describe('ProgressReport migration contract', () => {
  const prismaClient = new PrismaClient();

  afterAll(async () => {
    await prismaClient.$disconnect();
  });

  it('does not add a database default for the required reportedAt field', async () => {
    const columns = await prismaClient.$queryRaw<Array<{ column_default: string | null }>>`
      SELECT column_default
      FROM information_schema.columns
      WHERE table_schema = 'app'
        AND table_name = 'progress_reports'
        AND column_name = 'reported_at'
    `;

    expect(columns).toEqual([{ column_default: null }]);
  });
});
