import { Prisma } from '@prisma/client';

export const REMINDER_SCHEDULING_LOCK_KEY = 77_190_425;

export async function acquireReminderSchedulingLock(tx: Prisma.TransactionClient) {
  await tx.$queryRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(${REMINDER_SCHEDULING_LOCK_KEY}) IS NULL AS acquired`,
  );
}
