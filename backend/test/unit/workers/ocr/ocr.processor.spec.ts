import { OcrProcessor } from '../../../../src/workers/ocr/ocr.processor';
import { JobStatus } from '../../../../src/shared/contracts/jobs/job-status';
import { JobType } from '../../../../src/shared/contracts/jobs/job-type';
import { ExcelExportService } from '../../../../src/workers/ocr/services/excel-export.service';
import { HairstyleTransformService } from '../../../../src/workers/ocr/services/hairstyle-transform.service';
import { OcrProviderError } from '../../../../src/workers/ocr/services/ocr-provider.error';

describe('OcrProcessor', () => {
  it('configures local worker concurrency for long-running AI jobs', () => {
    expect(Reflect.getMetadata('bullmq:worker_metadata', OcrProcessor)).toMatchObject({
      concurrency: 2,
    });
  });

  it('returns a minimal success result for a recognize job', async () => {
    const processor = new OcrProcessor(
      {
        recognizeTable: jest.fn().mockResolvedValue({ rows: [], mergedCells: [] }),
      } as never,
      new ExcelExportService(),
      new HairstyleTransformService(),
      { markProcessing: jest.fn(), markSucceeded: jest.fn(), markFailed: jest.fn() } as never,
      { write: jest.fn() } as never,
      { create: jest.fn() } as never,
    );
    const result = await processor.handleRecognize({
      id: 'job-1',
      data: { imageBase64: 'ZmFrZQ==', mimeType: 'image/png', originalName: 'a.png' },
    } as never);

    expect(result.status).toBe(JobStatus.Succeeded);
    expect(result.result).toEqual({ rows: [], mergedCells: [] });
  });

  it('marks jobs processing and succeeded with persisted Excel file metadata', async () => {
    const jobRepository = {
      markProcessing: jest.fn().mockResolvedValue(undefined),
      markSucceeded: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    const storage = {
      write: jest.fn().mockResolvedValue({
        storageKey: 'jobs/job-1/table.xlsx',
        size: 5,
      }),
    };
    const fileRepository = {
      create: jest.fn().mockResolvedValue({
        id: 'file-1',
        filename: 'table.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 5,
        storageKey: 'jobs/job-1/table.xlsx',
      }),
    };
    const processor = new OcrProcessor(
      { recognizeTable: jest.fn() } as never,
      { generateExcel: jest.fn().mockResolvedValue(Buffer.from('excel')) } as never,
      new HairstyleTransformService(),
      jobRepository as never,
      storage as never,
      fileRepository as never,
    );

    const result = await processor.process({
      id: 'job-1',
      name: JobType.ExcelExport,
      data: { rows: [['A']], mergedCells: [] },
    } as never);

    expect(jobRepository.markProcessing).toHaveBeenCalledWith('job-1');
    expect(storage.write).toHaveBeenCalledWith({
      key: 'jobs/job-1/table.xlsx',
      content: Buffer.from('excel'),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(fileRepository.create).toHaveBeenCalledWith({
      jobId: 'job-1',
      kind: 'excel',
      filename: 'table.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 5,
      storageKey: 'jobs/job-1/table.xlsx',
    });
    expect(jobRepository.markSucceeded).toHaveBeenCalledWith('job-1', {
      fileId: 'file-1',
      filename: 'table.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 5,
      downloadUrl: '/api/files/file-1/download',
    });
    expect(result.result).toMatchObject({ fileId: 'file-1' });
  });

  it('marks jobs failed when worker processing throws', async () => {
    const jobRepository = {
      markProcessing: jest.fn().mockResolvedValue(undefined),
      markSucceeded: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    const processor = new OcrProcessor(
      {
        recognizeTable: jest.fn().mockRejectedValue(new Error('bad image')),
      } as never,
      new ExcelExportService(),
      new HairstyleTransformService(),
      jobRepository as never,
      { write: jest.fn() } as never,
      { create: jest.fn() } as never,
    );

    await expect(
      processor.process({
        id: 'job-1',
        name: JobType.OcrRecognize,
        data: { imageBase64: 'ZmFrZQ==', mimeType: 'image/png', originalName: 'a.png' },
      } as never),
    ).rejects.toThrow('bad image');

    expect(jobRepository.markFailed).toHaveBeenCalledWith('job-1', {
      errorCode: 'OCR_WORKER_ERROR',
      errorMessage: 'bad image',
    });
    expect(jobRepository.markSucceeded).not.toHaveBeenCalled();
  });

  it('persists stable OCR provider error codes when worker processing throws provider errors', async () => {
    const jobRepository = {
      markProcessing: jest.fn().mockResolvedValue(undefined),
      markSucceeded: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    const processor = new OcrProcessor(
      {
        recognizeTable: jest
          .fn()
          .mockRejectedValue(new OcrProviderError('OCR_CONFIG_MISSING', 'missing config')),
      } as never,
      new ExcelExportService(),
      new HairstyleTransformService(),
      jobRepository as never,
      { write: jest.fn() } as never,
      { create: jest.fn() } as never,
    );

    await expect(
      processor.process({
        id: 'job-1',
        name: JobType.OcrRecognize,
        data: { imageBase64: 'ZmFrZQ==', mimeType: 'image/png', originalName: 'a.png' },
      } as never),
    ).rejects.toThrow('missing config');

    expect(jobRepository.markFailed).toHaveBeenCalledWith('job-1', {
      errorCode: 'OCR_CONFIG_MISSING',
      errorMessage: 'missing config',
    });
  });
});
