import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PlatformPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    if (this.shouldSkipDatabaseConnection()) {
      return;
    }

    await this.$connect();
  }

  async onModuleDestroy() {
    if (this.shouldSkipDatabaseConnection()) {
      return;
    }

    await this.$disconnect();
  }

  private shouldSkipDatabaseConnection() {
    return !process.env.DATABASE_URL?.trim();
  }
}
