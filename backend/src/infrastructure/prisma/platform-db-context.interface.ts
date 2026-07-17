import { PrismaClient } from '@prisma/client';

export interface PlatformDbContext {
  schemaName: 'platform';
  client: PrismaClient;
}
