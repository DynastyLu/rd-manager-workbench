import { CreateJobUseCase } from '../../../../../src/modules/system/jobs/application/create-job.use-case';
import { InMemoryJobRepository } from '../../../../../src/modules/system/jobs/infrastructure/in-memory-job.repository';
import { JobStatus } from '../../../../../src/shared/contracts/jobs/job-status';
import { JobType } from '../../../../../src/shared/contracts/jobs/job-type';

describe('CreateJobUseCase', () => {
  it('creates a queued job', async () => {
    const repository = new InMemoryJobRepository();
    const useCase = new CreateJobUseCase(repository);

    const job = await useCase.execute({
      type: JobType.OcrRecognize,
      input: { originalName: 'a.png' },
      traceId: 'trace-1',
    });

    expect(job.status).toBe(JobStatus.Queued);
    expect(job.type).toBe(JobType.OcrRecognize);
  });
});
