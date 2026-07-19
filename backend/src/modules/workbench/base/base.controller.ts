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
} from '@nestjs/common';
import { BaseService } from './base.service';
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
} from './dto/base.dto';

@Controller('base')
export class BaseController {
  constructor(private readonly service: BaseService) {}

  @Get('workspaces') listWorkspaces() {
    return this.service.listWorkspaces();
  }
  @Post('workspaces') createWorkspace(@Body() dto: CreateWorkspaceDto) {
    return this.service.createWorkspace(dto);
  }
  @Get('workspaces/:id') getWorkspace(@Param('id') id: string) {
    return this.service.getWorkspace(id);
  }
  @Patch('workspaces/:id') updateWorkspace(
    @Param('id') id: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.service.updateWorkspace(id, dto);
  }
  @Delete('workspaces/:id') @HttpCode(HttpStatus.NO_CONTENT) deleteWorkspace(
    @Param('id') id: string,
  ) {
    return this.service.deleteWorkspace(id);
  }

  @Get('workspaces/:workspaceId/tables') listTables(@Param('workspaceId') id: string) {
    return this.service.listTables(id);
  }
  @Post('workspaces/:workspaceId/tables') createTable(
    @Param('workspaceId') id: string,
    @Body() dto: CreateTableDto,
  ) {
    return this.service.createTable(id, dto);
  }
  @Get('tables/:id') getTable(@Param('id') id: string) {
    return this.service.getTable(id);
  }
  @Patch('tables/:id') updateTable(@Param('id') id: string, @Body() dto: UpdateTableDto) {
    return this.service.updateTable(id, dto);
  }
  @Delete('tables/:id') @HttpCode(HttpStatus.NO_CONTENT) deleteTable(@Param('id') id: string) {
    return this.service.deleteTable(id);
  }

  @Get('tables/:tableId/fields') listFields(@Param('tableId') id: string) {
    return this.service.listFields(id);
  }
  @Post('tables/:tableId/fields') createField(
    @Param('tableId') id: string,
    @Body() dto: CreateFieldDto,
  ) {
    return this.service.createField(id, dto);
  }
  @Patch('fields/:id') updateField(@Param('id') id: string, @Body() dto: UpdateFieldDto) {
    return this.service.updateField(id, dto);
  }
  @Delete('fields/:id') @HttpCode(HttpStatus.NO_CONTENT) deleteField(@Param('id') id: string) {
    return this.service.deleteField(id);
  }
  @Post('tables/:tableId/formula-preview') previewFormula(
    @Param('tableId') id: string,
    @Body() dto: FormulaPreviewDto,
  ) {
    return this.service.previewFormula(id, dto);
  }

  @Get('tables/:tableId/records') listRecords(
    @Param('tableId') id: string,
    @Query() query: ListRecordsQueryDto,
  ) {
    return this.service.listRecords(id, query);
  }
  @Post('tables/:tableId/records') createRecord(
    @Param('tableId') id: string,
    @Body() dto: RecordValuesDto,
  ) {
    return this.service.createRecord(id, dto);
  }
  @Patch('tables/:tableId/records/:recordId') updateRecord(
    @Param('tableId') tableId: string,
    @Param('recordId') id: string,
    @Body() dto: RecordValuesDto,
  ) {
    return this.service.updateRecord(tableId, id, dto);
  }
  @Delete('tables/:tableId/records/:recordId') @HttpCode(HttpStatus.NO_CONTENT) deleteRecord(
    @Param('tableId') tableId: string,
    @Param('recordId') id: string,
  ) {
    return this.service.deleteRecord(tableId, id);
  }

  @Get('tables/:tableId/views') listViews(@Param('tableId') id: string) {
    return this.service.listViews(id);
  }
  @Post('tables/:tableId/views') createView(
    @Param('tableId') id: string,
    @Body() dto: CreateViewDto,
  ) {
    return this.service.createView(id, dto);
  }
  @Patch('views/:id') updateView(@Param('id') id: string, @Body() dto: UpdateViewDto) {
    return this.service.updateView(id, dto);
  }
  @Delete('views/:id') @HttpCode(HttpStatus.NO_CONTENT) deleteView(@Param('id') id: string) {
    return this.service.deleteView(id);
  }
}
