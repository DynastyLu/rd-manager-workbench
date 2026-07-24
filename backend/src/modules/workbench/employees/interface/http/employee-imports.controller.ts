import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { UploadedContentFile } from '../../../content/application/files.service';
import { EmployeeImportsService } from '../../application/employee-imports.service';
import { EmployeeWorkbookService } from '../../application/employee-workbook.service';
import { ResolveEmployeeImportDto } from './dto/employee-imports.dto';

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const importUploadOptions = {
  limits: { files: 1, fileSize: 20 * 1024 * 1024 },
};

@Controller('employee-work-imports')
export class EmployeeImportsController {
  constructor(
    private readonly imports: EmployeeImportsService,
    private readonly workbook: EmployeeWorkbookService,
  ) {}

  @Get('template')
  async template(@Res() response: Response) {
    const content = await this.workbook.template();
    this.setDownloadHeaders(response, 'employee-work-import-template.xlsx');
    response.setHeader('Content-Length', content.length);
    response.status(HttpStatus.OK).send(content);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', importUploadOptions))
  upload(@UploadedFile() file: UploadedContentFile | undefined) {
    return this.imports.upload(file);
  }

  @Patch(':id/preview')
  preview(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.imports.preview(id);
  }

  @Patch(':id/resolutions')
  resolve(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ResolveEmployeeImportDto,
  ) {
    return this.imports.resolve(id, dto);
  }

  @Get(':id/errors')
  async errors(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Res() response: Response,
  ) {
    const file = await this.imports.errorFile(id);
    this.setDownloadHeaders(response, file.fileName);
    response.setHeader('Content-Length', file.content.length);
    response.status(HttpStatus.OK).send(file.content);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.imports.remove(id);
  }

  private setDownloadHeaders(response: Response, fileName: string): void {
    const encodedName = encodeURIComponent(fileName);
    const fallbackName = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    response.setHeader('Content-Type', XLSX_MIME_TYPE);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
    );
  }
}
