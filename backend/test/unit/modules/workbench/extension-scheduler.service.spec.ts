import { ExtensionSchedulerService } from '../../../../src/modules/workbench/extensions/application/extension-scheduler.service';

describe('ExtensionSchedulerService', () => {
  it('delegates due work to the SMS delivery state machine', async () => {
    const sms = { dispatchDue: jest.fn().mockResolvedValue({ requested: 2 }) };
    const scheduler = new ExtensionSchedulerService(sms as any);
    await expect(scheduler.scanDue(new Date('2026-07-20T00:00:00Z'))).resolves.toEqual({ requested: 2 });
    expect(sms.dispatchDue).toHaveBeenCalledWith(new Date('2026-07-20T00:00:00Z'));
  });
});
