import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CreateJobUseCase } from '../../../../system/jobs/application/create-job.use-case';
import { GetJobUseCase } from '../../../../system/jobs/application/get-job.use-case';
import { CopyrightRiskAnalyzePayload } from '../../../../../shared/contracts/jobs/job-contracts';
import { JobType } from '../../../../../shared/contracts/jobs/job-type';
import { OcrJobProducer } from '../../../ocr/application/ocr-job.producer';

interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@Controller('copyright')
export class CopyrightRiskController {
  constructor(
    private readonly createJobUseCase: CreateJobUseCase,
    private readonly getJobUseCase: GetJobUseCase,
    private readonly ocrJobProducer: OcrJobProducer,
  ) {}

  @Post('analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FilesInterceptor('images', 20))
  async analyze(@UploadedFiles() images: UploadedImage[] | undefined) {
    if (!images?.length) {
      throw new BadRequestException('images files are required');
    }

    const jobs = await Promise.all(
      images.map(async (image) => {
        const input: CopyrightRiskAnalyzePayload = {
          imageBase64: image.buffer.toString('base64'),
          mimeType: image.mimetype,
          originalName: image.originalname,
        };
        const job = await this.createJobUseCase.execute({
          type: JobType.CopyrightRiskAnalyze,
          input,
        });
        await this.ocrJobProducer.enqueue({
          jobId: job.id,
          type: JobType.CopyrightRiskAnalyze,
          payload: input,
        });

        return {
          jobId: job.id,
          originalName: image.originalname,
          statusUrl: `/api/copyright/jobs/${job.id}`,
          resultUrl: `/api/copyright/jobs/${job.id}`,
        };
      }),
    );

    return {
      pending: true,
      count: jobs.length,
      jobs,
    };
  }

  @Get('jobs/:jobId')
  async get(@Param('jobId') jobId: string) {
    const job = await this.getJobUseCase.execute(jobId);
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      result: job.result,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      attempts: job.attempts,
      progress: job.progress,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    };
  }
}
