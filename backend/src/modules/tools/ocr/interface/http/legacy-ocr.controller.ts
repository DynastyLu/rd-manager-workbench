import {
  BadRequestException,
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CreateJobUseCase } from '../../../../system/jobs/application/create-job.use-case';
import { JobType } from '../../../../../shared/contracts/jobs/job-type';
import { OcrJobProducer } from '../../application/ocr-job.producer';
import {
  ExcelExportBatchPayload,
  ExcelExportPayload,
  MergedCellPayload,
} from '../../../../../shared/contracts/jobs/job-contracts';

interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

@Controller()
export class LegacyOcrController {
  constructor(
    private readonly createJobUseCase: CreateJobUseCase,
    private readonly ocrJobProducer: OcrJobProducer,
  ) {}

  @Post('recognize')
  @UseInterceptors(FileInterceptor('image'))
  async recognize(@UploadedFile() image: UploadedImage | undefined, @Res() response: Response) {
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

    return response.status(HttpStatus.ACCEPTED).json({
      success: false,
      pending: true,
      jobId: job.id,
      statusUrl: `/api/jobs/${job.id}`,
      resultUrl: `/api/tools/ocr/jobs/${job.id}/result`,
    });
  }

  @Post('export')
  async exportExcel(@Body() body: unknown, @Res() response: Response) {
    const input = this.normalizeExcelPayload(body);
    const job = await this.createJobUseCase.execute({
      type: JobType.ExcelExport,
      input,
    });
    await this.ocrJobProducer.enqueue({
      jobId: job.id,
      type: JobType.ExcelExport,
      payload: input,
    });

    return response.status(HttpStatus.ACCEPTED).json(this.pendingResponse(job.id));
  }

  @Post('export-batch')
  async exportExcelBatch(@Body() body: unknown, @Res() response: Response) {
    const input = this.normalizeExcelBatchPayload(body);
    const job = await this.createJobUseCase.execute({
      type: JobType.ExcelExportBatch,
      input,
    });
    await this.ocrJobProducer.enqueue({
      jobId: job.id,
      type: JobType.ExcelExportBatch,
      payload: input,
    });

    return response.status(HttpStatus.ACCEPTED).json(this.pendingResponse(job.id));
  }

  @Post('hairstyle/transform')
  @UseInterceptors(FileInterceptor('image'))
  async transformHairstyle(
    @UploadedFile() image: UploadedImage | undefined,
    @Body('style') style: string | undefined,
    @Res() response: Response,
  ) {
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

    return response.status(HttpStatus.ACCEPTED).json({
      success: false,
      pending: true,
      jobId: job.id,
      statusUrl: `/api/jobs/${job.id}`,
      resultUrl: `/api/tools/hairstyle/jobs/${job.id}`,
    });
  }

  private pendingResponse(jobId: string) {
    return {
      success: false,
      pending: true,
      jobId,
      statusUrl: `/api/jobs/${jobId}`,
      resultUrl: `/api/tools/ocr/jobs/${jobId}/result`,
    };
  }

  private normalizeExcelPayload(body: unknown): ExcelExportPayload {
    const payload = body as {
      rows?: string[][];
      mergedCells?: unknown[];
      merged_cells?: unknown[];
    };
    if (!Array.isArray(payload?.rows)) {
      throw new BadRequestException('rows is required');
    }

    return {
      rows: payload.rows,
      mergedCells: this.normalizeMergedCells(payload.mergedCells ?? payload.merged_cells ?? []),
    };
  }

  private normalizeExcelBatchPayload(body: unknown): ExcelExportBatchPayload {
    const payload = body as {
      sheets?: Array<{
        name?: string;
        rows?: string[][];
        mergedCells?: unknown[];
        merged_cells?: unknown[];
      }>;
    };
    if (!Array.isArray(payload?.sheets)) {
      throw new BadRequestException('sheets is required');
    }
    if (payload.sheets.length > 20) {
      throw new BadRequestException('sheets must not contain more than 20 items');
    }

    return {
      sheets: payload.sheets.map((sheet, index) => {
        if (!Array.isArray(sheet.rows)) {
          throw new BadRequestException(`sheets[${index}].rows is required`);
        }

        return {
          name: sheet.name || `Sheet${index + 1}`,
          rows: sheet.rows,
          mergedCells: this.normalizeMergedCells(sheet.mergedCells ?? sheet.merged_cells ?? []),
        };
      }),
    };
  }

  private normalizeMergedCells(cells: unknown[]): MergedCellPayload[] {
    return cells.map((cell) => {
      const value = cell as Partial<MergedCellPayload> & {
        from?: [number, number];
        to?: [number, number];
      };
      if (Array.isArray(value.from) && Array.isArray(value.to)) {
        return {
          startRow: value.from[0],
          startCol: value.from[1],
          endRow: value.to[0],
          endCol: value.to[1],
        };
      }

      return {
        startRow: Number(value.startRow),
        startCol: Number(value.startCol),
        endRow: Number(value.endRow),
        endCol: Number(value.endCol),
      };
    });
  }
}
