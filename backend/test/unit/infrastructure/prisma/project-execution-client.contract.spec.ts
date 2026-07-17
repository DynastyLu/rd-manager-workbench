import { PrismaClient } from '@prisma/client';

describe('project execution Prisma client contract', () => {
  const prismaClient = new PrismaClient();

  afterAll(async () => {
    await prismaClient.$disconnect();
  });

  it('exposes the project, milestone, and work task delegates', () => {
    expect(prismaClient).toHaveProperty('project');
    expect(prismaClient).toHaveProperty('milestone');
    expect(prismaClient).toHaveProperty('workTask');
  });
});
