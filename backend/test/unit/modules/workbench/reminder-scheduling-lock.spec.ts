import { acquireReminderSchedulingLock } from '../../../../src/modules/workbench/notifications/application/reminder-scheduling-lock';

describe('reminder scheduling lock', () => {
  it.each([
    [true, true],
    [false, false],
  ])('returns %s when PostgreSQL reports acquired=%s', async (acquired, expected) => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ acquired }]),
    };

    await expect(acquireReminderSchedulingLock(tx as never)).resolves.toBe(expected);

    const query = tx.$queryRaw.mock.calls[0]?.[0] as { sql?: string; text?: string };
    const sql = query.sql ?? query.text ?? '';
    expect(sql).toContain('pg_try_advisory_xact_lock');
    expect(sql).not.toContain('pg_advisory_xact_lock(');
  });
});
