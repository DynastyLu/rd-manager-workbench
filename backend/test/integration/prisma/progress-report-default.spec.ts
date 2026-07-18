import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ProgressReport migration contract', () => {
  const prismaClient = new PrismaClient();
  const schemaPath = resolve(__dirname, '../../../prisma/schema.prisma');

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

  it('keeps the required reportedAt field without an ORM default', () => {
    const schema = readFileSync(schemaPath, 'utf8');

    expect(schema).toContain('reportedAt        DateTime @map("reported_at") @db.Timestamptz(6)');
    expect(schema).not.toContain('reportedAt        DateTime @default(now())');
  });
});
