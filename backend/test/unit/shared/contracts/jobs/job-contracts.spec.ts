import { JobStatus } from '../../../../../src/shared/contracts/jobs/job-status';
import { JobType } from '../../../../../src/shared/contracts/jobs/job-type';
import { QueueNames } from '../../../../../src/shared/contracts/jobs/queue-names';

describe('job contracts', () => {
  it('defines stable job statuses', () => {
    expect(JobStatus.Queued).toBe('queued');
    expect(JobStatus.Processing).toBe('processing');
    expect(JobStatus.Succeeded).toBe('succeeded');
    expect(JobStatus.Failed).toBe('failed');
    expect(JobStatus.Canceled).toBe('canceled');
  });

  it('defines OCR worker queue names and job types', () => {
    expect(QueueNames.Ocr).toBe('ocr');
    expect(JobType.OcrRecognize).toBe('ocr.recognize');
    expect(JobType.ExcelExport).toBe('excel.export');
    expect(JobType.ExcelExportBatch).toBe('excel.exportBatch');
    expect(JobType.HairstyleTransform).toBe('hairstyle.transform');
  });
});
