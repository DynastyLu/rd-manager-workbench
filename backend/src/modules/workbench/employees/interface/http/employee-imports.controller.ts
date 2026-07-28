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
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { UploadedContentFile } from '../../../content/application/files.service';
import { EmployeeImportsService } from '../../application/employee-imports.service';
import { EmployeeProgressQueryService } from '../../application/employee-progress-query.service';
import {
  EmployeeWorkbookTemplateQueryDto,
  ResolveEmployeeImportDto,
} from './dto/employee-imports.dto';
import { EmployeeImportDetailQueryDto, ListEmployeeImportsQueryDto } from './dto/employees.dto';

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const importUploadOptions = {
  limits: { files: 1, fileSize: 20 * 1024 * 1024 },
};

@Controller('employee-work-imports')
export class EmployeeImportsController {
  constructor(
    private readonly imports: EmployeeImportsService,
    private readonly progress: EmployeeProgressQueryService,
  ) {}

  @Get('template')
  async template(
    @Query() query: EmployeeWorkbookTemplateQueryDto,
    @Res() response: Response,
  ) {
    const content = await this.imports.template(query.periodStart);
    this.setDownloadHeaders(response, 'employee-work-import-template.xlsx');
    response.setHeader('Content-Length', content.length);
    response.status(HttpStatus.OK).send(content);
  }

  @Get()
  list(@Query() query: ListEmployeeImportsQueryDto) {
    return this.progress.listImports(query);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', importUploadOptions))
  upload(@UploadedFile() file: UploadedContentFile | undefined) {
    return this.imports.upload(file);
  }

  @Get(':id')
  get(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: EmployeeImportDetailQueryDto,
  ) {
    return this.progress.getImport(id, query);
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

  @Post(':id/commit')
  commit(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.imports.commit(id);
  }

  @Post(':id/rebuild-snapshots')
  rebuildSnapshots(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.imports.rebuildSnapshots(id);
  }

  @Post(':id/restore')
  restore(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.imports.restore(id);
  }

  @Get(':id/errors')
  async errors(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Res() response: Response,
  ) {
    const file = await this.imports.errorFile(id);
    this.setDownloadHeaders(response, file.fileName, file.mimeType);
    response.setHeader('X-Source-Batch-Ids', id);
    response.setHeader('Content-Length', file.content.length);
    response.status(HttpStatus.OK).send(file.content);
  }

  @Get(':id/source')
  async source(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Res() response: Response,
  ) {
    const file = await this.imports.sourceFile(id);
    this.setDownloadHeaders(response, file.fileName, file.mimeType);
    response.setHeader('X-Source-Batch-Ids', file.sourceBatchIds.join(','));
    response.setHeader('Content-Length', file.content.length);
    response.status(HttpStatus.OK).send(file.content);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.imports.remove(id);
  }

  private setDownloadHeaders(
    response: Response,
    fileName: string,
    mimeType = XLSX_MIME_TYPE,
  ): void {
    const encodedName = encodeURIComponent(fileName);
    const fallbackName = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    response.setHeader('Content-Type', mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
    );
  }
}
