import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { BaseService } from './base.service';
import { UploadedContentFile } from '../content/application/files.service';
import { BaseImportService } from './import/base-import.service';
import { BaseExportService } from './export/base-export.service';
import { BaseTemplateService } from './templates/base-template.service';
import { ImportColumnMapping } from './import/import.types';
import {
  PERMISSIONS,
  RequirePermissions,
} from '../../iam/interface/http/permissions.decorator';
import {
  CreateFieldDto,
  CreateTableDto,
  CreateViewDto,
  CreateWorkspaceDto,
  FormulaPreviewDto,
  ListRecordsQueryDto,
  RecordValuesDto,
  UpdateFieldDto,
  UpdateTableDto,
  UpdateViewDto,
  UpdateWorkspaceDto,
  BaseExportQueryDto,
  InstantiateTemplateDto,
  PreviewImportDto,
  InspectImportDto,
} from './dto/base.dto';

const importUploadOptions = { limits: { files: 1, fileSize: 20 * 1024 * 1024 } };

@Controller('base')
export class BaseController {
  constructor(
    private readonly service: BaseService,
    private readonly imports: BaseImportService,
    private readonly exports: BaseExportService,
    private readonly templates: BaseTemplateService,
  ) {}

  @Get('templates')
  @RequirePermissions(PERMISSIONS.BASE_READ)
  listTemplates() {
    return this.templates.list();
  }
  @Get('templates/:key')
  @RequirePermissions(PERMISSIONS.BASE_READ)
  getTemplate(@Param('key') key: string) {
    return this.templates.detail(key);
  }
  @Post('workspaces/:workspaceId/templates/:key/instantiate')
  @RequirePermissions(PERMISSIONS.BASE_CREATE)
  instantiateTemplate(
    @Param('workspaceId') workspaceId: string,
    @Param('key') key: string,
    @Body() dto: InstantiateTemplateDto,
  ) {
    return this.templates.instantiate(workspaceId, key, dto);
  }

  @Get('workspaces')
  @RequirePermissions(PERMISSIONS.BASE_READ)
  listWorkspaces() {
    return this.service.listWorkspaces();
  }
  @Post('workspaces')
  @RequirePermissions(PERMISSIONS.BASE_CREATE)
  createWorkspace(@Body() dto: CreateWorkspaceDto) {
    return this.service.createWorkspace(dto);
  }
  @Get('workspaces/:id')
  @RequirePermissions(PERMISSIONS.BASE_READ)
  getWorkspace(@Param('id') id: string) {
    return this.service.getWorkspace(id);
  }
  @Patch('workspaces/:id')
  @RequirePermissions(PERMISSIONS.BASE_UPDATE)
  updateWorkspace(
    @Param('id') id: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.service.updateWorkspace(id, dto);
  }
  @Delete('workspaces/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.BASE_DELETE)
  deleteWorkspace(@Param('id') id: string) {
    return this.service.deleteWorkspace(id);
  }

  @Get('workspaces/:workspaceId/tables')
  @RequirePermissions(PERMISSIONS.BASE_READ)
  listTables(@Param('workspaceId') id: string) {
    return this.service.listTables(id);
  }
  @Post('workspaces/:workspaceId/tables')
  @RequirePermissions(PERMISSIONS.BASE_CREATE)
  createTable(
    @Param('workspaceId') id: string,
    @Body() dto: CreateTableDto,
  ) {
    return this.service.createTable(id, dto);
  }
  @Get('tables/:id')
  @RequirePermissions(PERMISSIONS.BASE_READ)
  getTable(@Param('id') id: string) {
    return this.service.getTable(id);
  }
  @Patch('tables/:id')
  @RequirePermissions(PERMISSIONS.BASE_UPDATE)
  updateTable(@Param('id') id: string, @Body() dto: UpdateTableDto) {
    return this.service.updateTable(id, dto);
  }
  @Delete('tables/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.BASE_DELETE)
  deleteTable(@Param('id') id: string) {
    return this.service.deleteTable(id);
  }

  @Post('tables/:tableId/imports')
  @UseInterceptors(FileInterceptor('file', importUploadOptions))
  @RequirePermissions(PERMISSIONS.BASE_CREATE)
  uploadImport(
    @Param('tableId') tableId: string,
    @UploadedFile() file: UploadedContentFile | undefined,
  ) {
    return this.imports.upload(tableId, file);
  }
  @Patch('imports/:id/preview')
  @RequirePermissions(PERMISSIONS.BASE_CREATE)
  previewImport(
    @Param('id') id: string,
    @Body() dto: PreviewImportDto,
  ) {
    return this.imports.preview(id, {
      selectedSheet: dto.selectedSheet,
      mapping: dto.mapping as unknown as ImportColumnMapping[],
    });
  }
  @Patch('imports/:id/inspect')
  @RequirePermissions(PERMISSIONS.BASE_CREATE)
  inspectImport(
    @Param('id') id: string,
    @Body() dto: InspectImportDto,
  ) {
    return this.imports.inspect(id, dto.selectedSheet);
  }
  @Post('imports/:id/commit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.BASE_CREATE)
  commitImport(@Param('id') id: string) {
    return this.imports.commit(id);
  }
  @Get('imports/:id')
  @RequirePermissions(PERMISSIONS.BASE_READ)
  getImport(@Param('id') id: string) {
    return this.imports.get(id);
  }
  @Get('imports/:id/errors')
  @RequirePermissions(PERMISSIONS.BASE_READ)
  async downloadImportErrors(
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const file = await this.imports.errorFile(id);
    this.setDownloadHeaders(response, file.fileName, file.mimeType);
    response.status(HttpStatus.OK).send(file.content);
  }
  @Delete('imports/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.BASE_DELETE)
  removeImport(@Param('id') id: string) {
    return this.imports.remove(id);
  }

  @Get('tables/:tableId/export')
  @RequirePermissions(PERMISSIONS.BASE_READ)
  async exportTable(
    @Param('tableId') tableId: string,
    @Query() query: BaseExportQueryDto,
    @Res() response: Response,
  ) {
    const result = await this.exports.create(tableId, query);
    this.setDownloadHeaders(response, result.fileName, result.contentType);
    response.status(HttpStatus.OK);
    await result.writeTo(response);
  }

  @Get('tables/:tableId/fields')
  @RequirePermissions(PERMISSIONS.BASE_READ)
  listFields(@Param('tableId') id: string) {
    return this.service.listFields(id);
  }
  @Post('tables/:tableId/fields')
  @RequirePermissions(PERMISSIONS.BASE_CREATE)
  createField(
    @Param('tableId') id: string,
    @Body() dto: CreateFieldDto,
  ) {
    return this.service.createField(id, dto);
  }
  @Patch('fields/:id')
  @RequirePermissions(PERMISSIONS.BASE_UPDATE)
  updateField(@Param('id') id: string, @Body() dto: UpdateFieldDto) {
    return this.service.updateField(id, dto);
  }
  @Delete('fields/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.BASE_DELETE)
  deleteField(@Param('id') id: string) {
    return this.service.deleteField(id);
  }
  @Post('tables/:tableId/formula-preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.BASE_READ)
  previewFormula(
    @Param('tableId') id: string,
    @Body() dto: FormulaPreviewDto,
  ) {
    return this.service.previewFormula(id, dto);
  }

  @Get('tables/:tableId/records')
  @RequirePermissions(PERMISSIONS.BASE_READ)
  listRecords(
    @Param('tableId') id: string,
    @Query() query: ListRecordsQueryDto,
  ) {
    return this.service.listRecords(id, query);
  }
  @Post('tables/:tableId/records')
  @RequirePermissions(PERMISSIONS.BASE_CREATE)
  createRecord(
    @Param('tableId') id: string,
    @Body() dto: RecordValuesDto,
  ) {
    return this.service.createRecord(id, dto);
  }
  @Patch('tables/:tableId/records/:recordId')
  @RequirePermissions(PERMISSIONS.BASE_UPDATE)
  updateRecord(
    @Param('tableId') tableId: string,
    @Param('recordId') id: string,
    @Body() dto: RecordValuesDto,
  ) {
    return this.service.updateRecord(tableId, id, dto);
  }
  @Delete('tables/:tableId/records/:recordId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.BASE_DELETE)
  deleteRecord(
    @Param('tableId') tableId: string,
    @Param('recordId') id: string,
  ) {
    return this.service.deleteRecord(tableId, id);
  }

  @Get('tables/:tableId/views')
  @RequirePermissions(PERMISSIONS.BASE_READ)
  listViews(@Param('tableId') id: string) {
    return this.service.listViews(id);
  }
  @Post('tables/:tableId/views')
  @RequirePermissions(PERMISSIONS.BASE_CREATE)
  createView(
    @Param('tableId') id: string,
    @Body() dto: CreateViewDto,
  ) {
    return this.service.createView(id, dto);
  }
  @Patch('views/:id')
  @RequirePermissions(PERMISSIONS.BASE_UPDATE)
  updateView(@Param('id') id: string, @Body() dto: UpdateViewDto) {
    return this.service.updateView(id, dto);
  }
  @Delete('views/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.BASE_DELETE)
  deleteView(@Param('id') id: string) {
    return this.service.deleteView(id);
  }

  private setDownloadHeaders(response: Response, fileName: string, contentType: string) {
    const fallback = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    response.setHeader('Content-Type', contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
  }
}
