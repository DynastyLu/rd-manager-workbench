import { JobStatus } from '../../../../../src/shared/contracts/jobs/job-status';
import { JobType } from '../../../../../src/shared/contracts/jobs/job-type';
import { PrismaGeneratedFileRepository } from '../../../../../src/modules/system/jobs/infrastructure/prisma-generated-file.repository';
import { PrismaJobRepository } from '../../../../../src/modules/system/jobs/infrastructure/prisma-job.repository';

describe('PrismaJobRepository', () => {
  it('creates and maps persisted jobs using shared job contracts', async () => {
    const prisma = {
      job: {
        create: jest.fn().mockResolvedValue({
          id: 'job-1',
          type: JobType.OcrRecognize,
          status: 'QUEUED',
          queueJobId: null,
          tenantId: 'tenant-1',
          tenantKey: null,
          operatorId: null,
          traceId: null,
          input: { imageBase64: 'abc' },
          result: null,
          errorCode: null,
          errorMessage: null,
          attempts: 0,
          progress: 0,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          startedAt: null,
          finishedAt: null,
        }),
      },
    };
    const repository = new PrismaJobRepository(prisma as never);

    const job = await repository.create({
      type: JobType.OcrRecognize,
      input: { imageBase64: 'abc' },
      tenantId: 'tenant-1',
    });

    expect(prisma.job.create).toHaveBeenCalledWith({
      data: {
        type: JobType.OcrRecognize,
        input: { imageBase64: 'abc' },
        queueJobId: undefined,
        tenantId: 'tenant-1',
        tenantKey: undefined,
        operatorId: undefined,
        traceId: undefined,
      },
    });
    expect(job).toMatchObject({
      id: 'job-1',
      type: JobType.OcrRecognize,
      status: JobStatus.Queued,
      input: { imageBase64: 'abc' },
      tenantId: 'tenant-1',
    });
  });

  it('persists success and failure status transitions', async () => {
    const prisma = {
      job: {
        update: jest.fn().mockResolvedValue({
          id: 'job-1',
          type: JobType.ExcelExport,
          status: 'SUCCEEDED',
          queueJobId: null,
          tenantId: null,
          tenantKey: null,
          operatorId: null,
          traceId: null,
          input: null,
          result: { fileId: 'file-1' },
          errorCode: null,
          errorMessage: null,
          attempts: 0,
          progress: 100,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          startedAt: null,
          finishedAt: new Date('2026-01-01T00:00:01.000Z'),
        }),
      },
    };
    const repository = new PrismaJobRepository(prisma as never);

    await repository.markSucceeded('job-1', { fileId: 'file-1' });
    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: {
        status: 'SUCCEEDED',
        progress: 100,
        result: { fileId: 'file-1' },
        finishedAt: expect.any(Date),
      },
    });

    await repository.markFailed('job-1', {
      errorCode: 'OCR_WORKER_ERROR',
      errorMessage: 'boom',
    });
    expect(prisma.job.update).toHaveBeenLastCalledWith({
      where: { id: 'job-1' },
      data: {
        status: 'FAILED',
        errorCode: 'OCR_WORKER_ERROR',
        errorMessage: 'boom',
        finishedAt: expect.any(Date),
      },
    });
  });
});

describe('PrismaGeneratedFileRepository', () => {
  it('stores generated file metadata for downloads', async () => {
    const prisma = {
      generatedFile: {
        create: jest.fn().mockResolvedValue({
          id: 'file-1',
          jobId: 'job-1',
          kind: 'excel',
          filename: 'table.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: 12,
          storageKey: 'jobs/job-1/table.xlsx',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      },
    };
    const repository = new PrismaGeneratedFileRepository(prisma as never);

    const file = await repository.create({
      jobId: 'job-1',
      kind: 'excel',
      filename: 'table.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 12,
      storageKey: 'jobs/job-1/table.xlsx',
    });

    expect(prisma.generatedFile.create).toHaveBeenCalledWith({
      data: {
        jobId: 'job-1',
        kind: 'excel',
        filename: 'table.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 12,
        storageKey: 'jobs/job-1/table.xlsx',
      },
    });
    expect(file).toMatchObject({
      id: 'file-1',
      jobId: 'job-1',
      storageKey: 'jobs/job-1/table.xlsx',
    });
  });
});
