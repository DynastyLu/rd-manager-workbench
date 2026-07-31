import { Prisma } from '@prisma/client';

export const REMINDER_SCHEDULING_LOCK_KEY = 77_190_425;

export async function acquireReminderSchedulingLock(
  tx: Prisma.TransactionClient,
): Promise<boolean> {
  const [result] = await tx.$queryRaw<Array<{ acquired: boolean }>>(
    Prisma.sql`SELECT pg_try_advisory_xact_lock(${REMINDER_SCHEDULING_LOCK_KEY}) AS acquired`,
  );
  return result?.acquired === true;
}
