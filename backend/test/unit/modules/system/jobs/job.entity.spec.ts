import { JobStatus } from '../../../../../src/shared/contracts/jobs/job-status';

describe('job status transitions', () => {
  it('supports queued to processing to succeeded', () => {
    expect([JobStatus.Queued, JobStatus.Processing, JobStatus.Succeeded]).toEqual([
      'queued',
      'processing',
      'succeeded',
    ]);
  });
});
