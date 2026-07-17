import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Optional } from '@nestjs/common';
import type { Job } from 'bullmq';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { StoragePort } from '../../infrastructure/storage/storage.port';
import { GeneratedFileRepository } from '../../modules/system/jobs/domain/generated-file.repository';
import { JobRepository } from '../../modules/system/jobs/domain/job.repository';
import {
  CopyrightRiskAnalyzePayload,
  ExcelExportBatchPayload,
  ExcelExportPayload,
  HairstyleTransformPayload,
  OcrRecognizePayload,
} from '../../shared/contracts/jobs/job-contracts';
import { JobStatus } from '../../shared/contracts/jobs/job-status';
import { JobType } from '../../shared/contracts/jobs/job-type';
import { QueueNames } from '../../shared/contracts/jobs/queue-names';
import { BaiduOcrService } from './services/baidu-ocr.service';
import { CopyrightRiskService } from './services/copyright-risk.service';
import { ExcelExportService } from './services/excel-export.service';
import { HairstyleTransformService } from './services/hairstyle-transform.service';
import { OcrProviderError } from './services/ocr-provider.error';

interface MinimalWorkerResult {
  status: JobStatus.Succeeded;
  result: unknown;
}

const workerConcurrency = Math.max(1, Number(process.env.OCR_WORKER_CONCURRENCY || 2) || 2);

@Injectable()
@Processor(QueueNames.Ocr, { concurrency: workerConcurrency })
export class OcrProcessor extends WorkerHost {
  constructor(
    private readonly baiduOcrService: BaiduOcrService,
    private readonly excelExportService: ExcelExportService,
    private readonly hairstyleTransformService: HairstyleTransformService,
    private readonly jobRepository: JobRepository,
    private readonly storage: StoragePort,
    private readonly generatedFileRepository: GeneratedFileRepository,
    @Optional() private readonly logger?: AppLoggerService,
    @Optional() private readonly copyrightRiskService?: CopyrightRiskService,
  ) {
    super();
  }

  async process(job: Job): Promise<MinimalWorkerResult> {
    const jobId = this.getJobId(job);
    await this.jobRepository.markProcessing(jobId);

    try {
      const result = await this.dispatch(job);
      await this.jobRepository.markSucceeded(jobId, result.result);
      return result;
    } catch (error) {
      const errorCode = error instanceof OcrProviderError ? error.code : 'OCR_WORKER_ERROR';
      await this.jobRepository.markFailed(jobId, {
        errorCode,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      this.logger?.error(
        JSON.stringify({
          event: 'ocr_worker_job_failed',
          jobId,
          queueJobName: job.name,
          errorCode,
          errorMessage: error instanceof Error ? error.message : String(error),
        }),
      );
      throw error;
    }
  }

  async handleRecognize(job: Job<OcrRecognizePayload>): Promise<MinimalWorkerResult> {
    const result = await this.baiduOcrService.recognizeTable(
      Buffer.from(job.data.imageBase64, 'base64'),
      job.data.mimeType,
    );
    return {
      status: JobStatus.Succeeded,
      result,
    };
  }

  async handleExcelExport(job: Job<ExcelExportPayload>): Promise<MinimalWorkerResult> {
    const buffer = await this.excelExportService.generateExcel(job.data);
    const file = await this.persistGeneratedFile({
      jobId: this.getJobId(job),
      kind: 'excel',
      filename: 'table.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      content: buffer,
    });
    return {
      status: JobStatus.Succeeded,
      result: file,
    };
  }

  async handleExcelExportBatch(job: Job<ExcelExportBatchPayload>): Promise<MinimalWorkerResult> {
    const buffer = await this.excelExportService.generateExcelMultiSheet(job.data);
    const file = await this.persistGeneratedFile({
      jobId: this.getJobId(job),
      kind: 'excel',
      filename: 'tables.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      content: buffer,
    });
    return {
      status: JobStatus.Succeeded,
      result: file,
    };
  }

  async handleHairstyleTransform(job: Job<HairstyleTransformPayload>): Promise<MinimalWorkerResult> {
    const result = await this.hairstyleTransformService.transform({
      imageBuffer: Buffer.from(job.data.imageBase64, 'base64'),
      mimeType: job.data.mimeType,
      style: job.data.style,
    });
    const file = await this.persistGeneratedFile({
      jobId: this.getJobId(job),
      kind: 'hairstyle',
      filename: 'hairstyle.svg',
      mimeType: 'image/svg+xml',
      content: this.dataUrlToBuffer(result.data.imageUrl),
    });
    return {
      status: JobStatus.Succeeded,
      result: {
        ...result,
        data: {
          ...result.data,
          fileId: file.fileId,
          downloadUrl: file.downloadUrl,
        },
      },
    };
  }

  async handleCopyrightRiskAnalyze(
    job: Job<CopyrightRiskAnalyzePayload>,
  ): Promise<MinimalWorkerResult> {
    if (!this.copyrightRiskService) {
      throw new Error('Copyright risk service is not available');
    }

    const result = await this.copyrightRiskService.analyze({
      imageBuffer: Buffer.from(job.data.imageBase64, 'base64'),
      mimeType: job.data.mimeType,
      originalName: job.data.originalName,
    });
    return {
      status: JobStatus.Succeeded,
      result,
    };
  }

  private dispatch(job: Job): Promise<MinimalWorkerResult> {
    switch (job.name) {
      case JobType.OcrRecognize:
        return this.handleRecognize(job as Job<OcrRecognizePayload>);
      case JobType.ExcelExport:
        return this.handleExcelExport(job as Job<ExcelExportPayload>);
      case JobType.ExcelExportBatch:
        return this.handleExcelExportBatch(job as Job<ExcelExportBatchPayload>);
      case JobType.HairstyleTransform:
        return this.handleHairstyleTransform(job as Job<HairstyleTransformPayload>);
      case JobType.CopyrightRiskAnalyze:
        return this.handleCopyrightRiskAnalyze(job as Job<CopyrightRiskAnalyzePayload>);
      default:
        throw new Error(`Unsupported OCR worker job type: ${job.name}`);
    }
  }

  private async persistGeneratedFile(input: {
    jobId: string;
    kind: string;
    filename: string;
    mimeType: string;
    content: Buffer;
  }) {
    const storageKey = `jobs/${input.jobId}/${input.filename}`;
    const stored = await this.storage.write({
      key: storageKey,
      content: input.content,
      mimeType: input.mimeType,
    });
    const file = await this.generatedFileRepository.create({
      jobId: input.jobId,
      kind: input.kind,
      filename: input.filename,
      mimeType: input.mimeType,
      size: stored.size,
      storageKey: stored.storageKey,
    });

    return {
      fileId: file.id,
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.size,
      downloadUrl: `/api/files/${file.id}/download`,
    };
  }

  private getJobId(job: Job) {
    if (!job.id) {
      throw new Error('Queue job id is required');
    }
    return String(job.id);
  }

  private dataUrlToBuffer(dataUrl: string) {
    const [, payload] = dataUrl.split(',');
    return Buffer.from(payload || dataUrl, 'base64');
  }
}
