import { ReminderMaintenanceCoordinatorService } from '../../../../src/modules/workbench/notifications/application/reminder-maintenance-coordinator.service';
import { Logger } from '@nestjs/common';

describe('ReminderMaintenanceCoordinatorService', () => {
  function fixture() {
    const calls: string[] = [];
    const sync = {
      sync: jest.fn(async () => {
        calls.push('sync');
        return { scheduled: 1, archived: 0 };
      }),
    };
    const scheduler = {
      scanDue: jest.fn(async () => {
        calls.push('scan');
        return { created: 1, resurfaced: 0, notifications: [] };
      }),
    };
    const service = new ReminderMaintenanceCoordinatorService(sync as never, scheduler as never);
    return { service, sync, scheduler, calls };
  }

  it('always synchronizes employee plan rules before scanning due reminders', async () => {
    const { service, sync, scheduler, calls } = fixture();
    const now = new Date('2026-07-29T08:00:00.000Z');

    await expect(service.runMaintenance(now)).resolves.toEqual({
      sync: { scheduled: 1, archived: 0 },
      scan: { created: 1, resurfaced: 0, notifications: [] },
    });

    expect(calls).toEqual(['sync', 'scan']);
    expect(sync.sync).toHaveBeenCalledWith(now);
    expect(scheduler.scanDue).toHaveBeenCalledWith(now);
  });

  it('skips an overlapping coordinator tick before either child service runs twice', async () => {
    const { service, sync, scheduler } = fixture();
    let finishSync!: (value: { scheduled: number; archived: number }) => void;
    sync.sync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSync = resolve;
        }),
    );

    const first = service.runMaintenance();
    await expect(service.runMaintenance()).resolves.toEqual({ skipped: true });

    expect(sync.sync).toHaveBeenCalledTimes(1);
    expect(scheduler.scanDue).not.toHaveBeenCalled();

    finishSync({ scheduled: 0, archived: 0 });
    await first;
    expect(scheduler.scanDue).toHaveBeenCalledTimes(1);
  });

  it('still scans due reminders after synchronization fails and releases the running guard', async () => {
    const { service, sync, scheduler } = fixture();
    sync.sync.mockRejectedValueOnce(new Error('temporary sync failure'));

    await expect(service.runMaintenance()).rejects.toMatchObject({
      failedStages: ['employee-plan-sync'],
    });
    expect(scheduler.scanDue).toHaveBeenCalledTimes(1);

    await expect(service.runMaintenance()).resolves.toMatchObject({
      sync: { scheduled: 1 },
      scan: { created: 1 },
    });

    expect(sync.sync).toHaveBeenCalledTimes(2);
    expect(scheduler.scanDue).toHaveBeenCalledTimes(2);
  });

  it('does not write an unexpected error stack or absolute path to the coordinator log', () => {
    const { service } = fixture();
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    (
      service as unknown as {
        logFailure(error: unknown): void;
      }
    ).logFailure(new Error('failure at C:\\Users\\secret\\application.ts'));

    expect(loggerError).toHaveBeenCalledWith(
      'Reminder maintenance failed unexpectedly; it will retry on the next interval.',
    );
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain('C:\\\\Users\\\\secret');
  });
});
