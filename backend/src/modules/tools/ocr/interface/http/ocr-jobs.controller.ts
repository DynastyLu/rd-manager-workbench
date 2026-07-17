import { BadRequestException, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateJobUseCase } from '../../../../system/jobs/application/create-job.use-case';
import { GetJobUseCase } from '../../../../system/jobs/application/get-job.use-case';
import { JobType } from '../../../../../shared/contracts/jobs/job-type';
import { OcrJobProducer } from '../../application/ocr-job.producer';

interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

@Controller('tools/ocr/jobs')
export class OcrJobsController {
  constructor(
    private readonly createJobUseCase: CreateJobUseCase,
    private readonly getJobUseCase: GetJobUseCase,
    private readonly ocrJobProducer: OcrJobProducer,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('image'))
  async create(@UploadedFile() image?: UploadedImage) {
    if (!image) {
      throw new BadRequestException('image file is required');
    }

    const input = {
      imageBase64: image.buffer.toString('base64'),
      mimeType: image.mimetype,
      originalName: image.originalname,
    };
    const job = await this.createJobUseCase.execute({
      type: JobType.OcrRecognize,
      input,
    });
    await this.ocrJobProducer.enqueue({
      jobId: job.id,
      type: JobType.OcrRecognize,
      payload: input,
    });

    return {
      jobId: job.id,
      statusUrl: `/api/jobs/${job.id}`,
      resultUrl: `/api/tools/ocr/jobs/${job.id}/result`,
    };
  }

  @Get(':jobId')
  get(@Param('jobId') jobId: string) {
    return this.getJobUseCase.execute(jobId);
  }

  @Get(':jobId/result')
  async result(@Param('jobId') jobId: string) {
    const job = await this.getJobUseCase.execute(jobId);
    return job.result ?? job;
  }
}
