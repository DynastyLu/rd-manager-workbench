import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateJobUseCase } from '../../../../system/jobs/application/create-job.use-case';
import { GetJobUseCase } from '../../../../system/jobs/application/get-job.use-case';
import { JobType } from '../../../../../shared/contracts/jobs/job-type';
import { OcrJobProducer } from '../../../../tools/ocr/application/ocr-job.producer';

interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

@Controller('tools/hairstyle/jobs')
export class HairstyleJobsController {
  constructor(
    private readonly createJobUseCase: CreateJobUseCase,
    private readonly getJobUseCase: GetJobUseCase,
    private readonly ocrJobProducer: OcrJobProducer,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('image'))
  async create(@UploadedFile() image: UploadedImage | undefined, @Body('style') style?: string) {
    if (!image) {
      throw new BadRequestException('image file is required');
    }

    const input = {
      imageBase64: image.buffer.toString('base64'),
      mimeType: image.mimetype,
      originalName: image.originalname,
      style: style || 'short-bob',
    };
    const job = await this.createJobUseCase.execute({
      type: JobType.HairstyleTransform,
      input,
    });
    await this.ocrJobProducer.enqueue({
      jobId: job.id,
      type: JobType.HairstyleTransform,
      payload: input,
    });

    return {
      jobId: job.id,
      statusUrl: `/api/jobs/${job.id}`,
      resultUrl: `/api/tools/hairstyle/jobs/${job.id}`,
    };
  }

  @Get(':jobId')
  result(@Param('jobId') jobId: string) {
    return this.getJobUseCase.execute(jobId);
  }
}
