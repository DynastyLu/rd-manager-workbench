import { PrismaClient } from '@prisma/client';

describe('partner file catalog', () => {
  const prisma = new PrismaClient();

  afterAll(async () => prisma.$disconnect());

  it('has the partner file column, index, and foreign key', async () => {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'app' AND table_name = 'file_assets' AND column_name = 'partner_id'
    `;
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'app' AND tablename = 'file_assets'
        AND indexname = 'file_assets_partner_id_status_updated_at_idx'
    `;
    const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'app.file_assets'::regclass
        AND conname = 'file_assets_partner_id_fkey'
    `;
    expect(columns).toEqual([{ column_name: 'partner_id' }]);
    expect(indexes).toEqual([{ indexname: 'file_assets_partner_id_status_updated_at_idx' }]);
    expect(constraints).toEqual([{ conname: 'file_assets_partner_id_fkey' }]);
  });
});
